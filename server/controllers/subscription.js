import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import Subscription from "../Modals/subscription.js";
import SubscriptionPayment from "../Modals/subscriptionPayment.js";
import {
  getActivePlan,
  getPlanCatalog,
  getPlanPricePaise,
  SUBSCRIPTION_PLANS,
} from "../lib/subscriptionPlans.js";

const VALID_PERIODS = new Set(["monthly", "quarterly", "yearly"]);

const razorpayConfig = () => {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay test credentials are not configured");
  }
  return { keyId: RAZORPAY_KEY_ID, keySecret: RAZORPAY_KEY_SECRET };
};

const razorpayRequest = async (path, options = {}) => {
  const { keyId, keySecret } = razorpayConfig();
  const authorization = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(
      data.error?.description || `Razorpay returned HTTP ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }
  return data;
};

const calculatePeriodEnd = (start, period) => {
  const months = { monthly: 1, quarterly: 3, yearly: 12 }[period];
  const end = new Date(start);
  const targetMonth = end.getUTCMonth() + months;
  const dayOfMonth = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(targetMonth);
  const finalDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(dayOfMonth, finalDay));
  return end;
};

const createInvoiceNumber = () =>
  `YT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID()
    .replace(/-/g, "")
    .slice(0, 10)
    .toUpperCase()}`;

const sendReceiptEmail = async (user, subscription) => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP email settings are not configured");
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  const plan = SUBSCRIPTION_PLANS[subscription.plan];
  await transporter.sendMail({
    from: process.env.SMTP_FROM || SMTP_USER,
    to: user.email,
    subject: `Your ${plan.name} subscription receipt`,
    text: [
      `Hello ${user.name || "there"},`,
      "",
      `Your ${plan.name} subscription is active.`,
      `Validity: ${subscription.startsAt.toISOString()} to ${subscription.expiresAt.toISOString()}`,
      `Amount: INR ${(subscription.amountPaise / 100).toFixed(2)}`,
      `Payment ID: ${subscription.paymentId}`,
      `Order ID: ${subscription.orderId}`,
      `Invoice: ${subscription.invoiceNumber}`,
      "",
      `Support: ${process.env.SUPPORT_EMAIL || SMTP_USER}`,
    ].join("\n"),
  });
};

const activatePayment = async (paymentRecord, payment, signature = "") => {
  if (paymentRecord.status === "captured") {
    return {
      subscription: await Subscription.findOne({
        orderId: paymentRecord.orderId,
      }),
      alreadyActivated: true,
    };
  }
  if (payment.status !== "captured") {
    return { subscription: null, alreadyActivated: false };
  }
  if (
    payment.order_id !== paymentRecord.orderId ||
    payment.amount !== paymentRecord.amountPaise ||
    payment.currency !== paymentRecord.currency
  ) {
    throw new Error("Captured payment does not match the expected order");
  }

  if (["created", "cancelled", "failed"].includes(paymentRecord.status)) {
    await SubscriptionPayment.findOneAndUpdate(
      { _id: paymentRecord._id, status: paymentRecord.status },
      { $set: { status: "activating", paymentId: payment.id, signature } },
    );
  }

  let subscription = await Subscription.findOne({ orderId: paymentRecord.orderId });
  if (!subscription) {
    const invoiceNumber = createInvoiceNumber();
    const now = new Date();
    try {
      subscription = await Subscription.create({
        userId: paymentRecord.userId,
        plan: paymentRecord.plan,
        period: paymentRecord.period,
        status: "active",
        startsAt: now,
        expiresAt: calculatePeriodEnd(now, paymentRecord.period),
        autoRenew: false,
        orderId: paymentRecord.orderId,
        paymentId: payment.id,
        invoiceNumber,
        amountPaise: paymentRecord.amountPaise,
        currency: paymentRecord.currency,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      subscription = await Subscription.findOne({
        orderId: paymentRecord.orderId,
      });
      if (!subscription) throw error;
    }
  }

  const updated = await SubscriptionPayment.findOneAndUpdate(
    {
      _id: paymentRecord._id,
      status: { $in: ["created", "activating", "cancelled", "failed"] },
    },
    {
      $set: {
        status: "captured",
        paymentId: payment.id,
        signature,
        invoiceNumber: subscription.invoiceNumber,
      },
    },
    { new: true },
  );
  if (!updated) {
    const currentPayment = await SubscriptionPayment.findById(paymentRecord._id);
    if (currentPayment?.status !== "captured") {
      throw new Error("Payment state changed before activation");
    }
  }

  return {
    subscription,
    alreadyActivated: !updated,
  };
};

const notifyReceipt = async (paymentRecord, subscription) => {
  const user = await import("../Modals/Auth.js").then(({ default: users }) =>
    users.findById(paymentRecord.userId),
  );
  if (!user?.email) {
    console.error("Subscription receipt could not be sent: user email is unavailable");
    return false;
  }
  try {
    await sendReceiptEmail(user, subscription);
    await SubscriptionPayment.updateOne(
      { _id: paymentRecord._id },
      { $set: { receiptEmailSentAt: new Date() } },
    );
    return true;
  } catch (error) {
    console.error("Subscription receipt email failed:", error);
    return false;
  }
};

export const getSubscriptionPlans = (_req, res) =>
  res.status(200).json(getPlanCatalog());

export const getSubscriptionDashboard = async (req, res) => {
  try {
    const userId = req.authenticatedUser._id;
    const [active, subscriptions, payments] = await Promise.all([
      getActivePlan(userId),
      Subscription.find({ userId }).sort({ createdAt: -1 }).limit(50),
      SubscriptionPayment.find({ userId }).sort({ createdAt: -1 }).limit(50),
    ]);
    return res.status(200).json({
      currentPlan: active,
      subscriptions,
      billingHistory: payments,
    });
  } catch (error) {
    console.error("Subscription dashboard load failed:", error);
    return res.status(500).json({ message: "Unable to load subscription details" });
  }
};

export const createSubscriptionOrder = async (req, res) => {
  const { plan, period } = req.body || {};
  const amountPaise = getPlanPricePaise(plan, period);
  if (!amountPaise || !VALID_PERIODS.has(period)) {
    return res.status(400).json({ message: "Choose a valid paid plan and billing period" });
  }

  try {
    const userId = req.authenticatedUser._id;
    const recentPending = await SubscriptionPayment.findOne({
      userId,
      plan,
      period,
      status: "created",
      createdAt: { $gte: new Date(Date.now() - 20 * 60 * 1000) },
    }).sort({ createdAt: -1 });
    if (recentPending) {
      return res.status(200).json({
        orderId: recentPending.orderId,
        amount: recentPending.amountPaise,
        currency: recentPending.currency,
        keyId: razorpayConfig().keyId,
        plan,
        period,
      });
    }

    const order = await razorpayRequest("orders", {
      method: "POST",
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: `yt-${String(userId).slice(-12)}-${Date.now()}`,
        notes: { userId: String(userId), plan, period },
      }),
    });
    await SubscriptionPayment.create({
      userId,
      plan,
      period,
      orderId: order.id,
      amountPaise,
      currency: "INR",
      status: "created",
    });

    return res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: razorpayConfig().keyId,
      plan,
      period,
    });
  } catch (error) {
    console.error("Subscription order creation failed:", error);
    return res.status(503).json({
      message: "Unable to create a Razorpay test order. Check payment configuration and retry.",
    });
  }
};

export const verifySubscriptionPayment = async (req, res) => {
  const { orderId, paymentId, signature } = req.body || {};
  if (
    typeof orderId !== "string" ||
    typeof paymentId !== "string" ||
    typeof signature !== "string"
  ) {
    return res.status(400).json({ message: "Payment verification details are required" });
  }

  try {
    const paymentRecord = await SubscriptionPayment.findOne({
      orderId,
      userId: req.authenticatedUser._id,
    });
    if (!paymentRecord) return res.status(404).json({ message: "Payment order not found" });

    const { keySecret } = razorpayConfig();
    const expected = createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest();
    const supplied = Buffer.from(signature, "hex");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      await SubscriptionPayment.updateOne(
        { _id: paymentRecord._id, status: "created" },
        { $set: { status: "failed", failureReason: "Invalid payment signature" } },
      );
      return res.status(400).json({ message: "Payment signature verification failed" });
    }

    const payment = await razorpayRequest(`payments/${encodeURIComponent(paymentId)}`);
    if (
      payment.order_id !== orderId ||
      payment.amount !== paymentRecord.amountPaise ||
      payment.currency !== paymentRecord.currency ||
      payment.status !== "captured"
    ) {
      return res.status(409).json({ message: "Payment is not captured for this order yet" });
    }

    const result = await activatePayment(paymentRecord, payment, signature);
    if (!result.subscription) {
      return res.status(409).json({ message: "Payment is not captured yet" });
    }
    const receiptEmailSent = result.alreadyActivated
      ? Boolean(paymentRecord.receiptEmailSentAt)
      : await notifyReceipt(paymentRecord, result.subscription);
    return res.status(200).json({
      message: "Payment verified and subscription activated",
      subscription: result.subscription,
      receiptEmailSent,
    });
  } catch (error) {
    console.error("Subscription payment verification failed:", error);
    return res.status(503).json({
      message: "Payment verification is temporarily unavailable. Retry verification from your billing history.",
    });
  }
};

export const reconcileSubscriptionOrder = async (req, res) => {
  try {
    const paymentRecord = await SubscriptionPayment.findOne({
      orderId: req.params.orderId,
      userId: req.authenticatedUser._id,
    });
    if (!paymentRecord) return res.status(404).json({ message: "Payment order not found" });
    if (paymentRecord.status === "captured") {
      const subscription = await Subscription.findOne({ orderId: paymentRecord.orderId });
      return res.status(200).json({ status: "captured", subscription });
    }
    const payments = await razorpayRequest(
      `orders/${encodeURIComponent(paymentRecord.orderId)}/payments`,
    );
    const captured = payments.items?.find(
      (payment) =>
        payment.status === "captured" &&
        payment.amount === paymentRecord.amountPaise &&
        payment.currency === paymentRecord.currency,
    );
    if (!captured) {
      const failed = payments.items?.some((payment) => payment.status === "failed");
      if (failed) {
        await SubscriptionPayment.updateOne(
          { _id: paymentRecord._id, status: { $in: ["created", "cancelled"] } },
          { $set: { status: "failed", failureReason: "Payment was not captured" } },
        );
        return res.status(200).json({ status: "failed" });
      }
      return res.status(200).json({ status: paymentRecord.status });
    }
    const result = await activatePayment(paymentRecord, captured);
    if (result.subscription && !result.alreadyActivated) {
      await notifyReceipt(paymentRecord, result.subscription);
    }
    return res.status(200).json({
      status: "captured",
      subscription: result.subscription,
    });
  } catch (error) {
    console.error("Subscription order reconciliation failed:", error);
    return res.status(503).json({ message: "Unable to reconcile this payment yet" });
  }
};

export const cancelSubscriptionOrder = async (req, res) => {
  try {
    const paymentRecord = await SubscriptionPayment.findOne({
      orderId: req.params.orderId,
      userId: req.authenticatedUser._id,
    });
    if (!paymentRecord) return res.status(404).json({ message: "Payment order not found" });
    if (paymentRecord.status === "captured") {
      return res.status(409).json({ message: "A captured payment cannot be cancelled" });
    }

    const payments = await razorpayRequest(
      `orders/${encodeURIComponent(paymentRecord.orderId)}/payments`,
    );
    const captured = payments.items?.find(
      (payment) =>
        payment.status === "captured" &&
        payment.amount === paymentRecord.amountPaise &&
        payment.currency === paymentRecord.currency,
    );
    if (captured) {
      const activated = await activatePayment(paymentRecord, captured);
      if (activated.subscription && !activated.alreadyActivated) {
        await notifyReceipt(paymentRecord, activated.subscription);
      }
      return res.status(409).json({
        message: "Payment was captured and the subscription has been activated.",
        subscription: activated.subscription,
      });
    }
    const failed = payments.items?.some((payment) => payment.status === "failed");
    const status = failed ? "failed" : "cancelled";
    await SubscriptionPayment.updateOne(
      { _id: paymentRecord._id, status: { $in: ["created", "cancelled"] } },
      {
        $set: {
          status,
          failureReason: failed ? "Payment failed in checkout" : "Checkout was cancelled",
        },
      },
    );
    return res.status(200).json({ status });
  } catch (error) {
    console.error("Subscription checkout cancellation failed:", error);
    return res.status(503).json({ message: "Unable to update checkout status" });
  }
};

export const cancelSubscriptionRenewal = async (req, res) => {
  try {
    const subscription = await Subscription.findOneAndUpdate(
      {
        _id: req.params.subscriptionId,
        userId: req.authenticatedUser._id,
        status: "active",
        expiresAt: { $gt: new Date() },
      },
      { $set: { autoRenew: false } },
      { new: true },
    );
    if (!subscription) {
      return res.status(404).json({ message: "Active subscription not found" });
    }
    return res.status(200).json({
      message: "Renewal cancelled. Access remains available until expiry.",
      subscription,
    });
  } catch (error) {
    console.error("Subscription cancellation failed:", error);
    return res.status(500).json({ message: "Unable to cancel renewal" });
  }
};
