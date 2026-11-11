"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import { getFirebaseAuthConfig } from "@/lib/firebaseAuthConfig";

type Plan = {
  id: string;
  name: string;
  monthlyPricePaise: number;
  dailyDownloads: number;
  monthlyDownloads: number;
  quality: string;
  premiumRank: number;
  exclusiveCourses: string;
  adFree: boolean;
  prioritySupport: boolean;
  prices: Record<string, number>;
};

type Payment = {
  _id: string;
  orderId: string;
  paymentId?: string;
  currency?: string;
  status: string;
  plan: string;
  period: string;
  amountPaise: number;
  invoiceNumber?: string;
};

type ActiveSubscription = {
  _id: string;
  plan: string;
  status: string;
  startsAt: string;
  expiresAt: string;
};

type SubscriptionDashboard = {
  currentPlan: {
    id: string;
    name: string;
    subscription: ActiveSubscription | null;
  };
  subscriptions: ActiveSubscription[];
  billingHistory: Payment[];
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: unknown) => void) => void;
    };
  }
}

const periods = ["monthly", "quarterly", "yearly"] as const;
type BillingPeriod = (typeof periods)[number];

const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

export default function SubscriptionsPage() {
  const { user } = useUser();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [dashboard, setDashboard] = useState<SubscriptionDashboard | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [loading, setLoading] = useState(true);
  const [plansError, setPlansError] = useState("");
  const [busyPlan, setBusyPlan] = useState("");
  const [busySubscription, setBusySubscription] = useState("");
  const reconciledOrders = useRef(new Set<string>());

  const loadDashboard = useCallback(async () => {
    if (!user) {
      setDashboard(null);
      return;
    }
    const config = await getFirebaseAuthConfig();
    const response = await axiosInstance.get("/subscription/dashboard", config);
    setDashboard(response.data);
  }, [user]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [catalogResult, dashboardResult] = await Promise.allSettled([
        axiosInstance.get("/subscription/plans"),
        loadDashboard(),
      ]);
      if (catalogResult.status === "fulfilled") {
        if (mounted) setPlans(catalogResult.value.data);
      } else {
        console.error("Unable to load subscription plans:", catalogResult.reason);
        if (mounted) setPlansError("Could not load paid plans. Check that the backend is running, then refresh.");
      }

      if (dashboardResult.status === "rejected") {
        console.error("Unable to load subscription dashboard:", dashboardResult.reason);
        if (mounted) toast.error("Could not load your membership status. Plan prices are still available.");
      }

      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [loadDashboard]);

  useEffect(() => {
    const payments: Payment[] = dashboard?.billingHistory || [];
    const pending = payments.filter((payment) =>
      ["created", "activating"].includes(payment.status) &&
      !reconciledOrders.current.has(payment.orderId),
    );
    if (!pending.length || !user) return;
    pending.forEach((payment) => reconciledOrders.current.add(payment.orderId));
    void (async () => {
      try {
        const config = await getFirebaseAuthConfig();
        await Promise.all(
          pending.map((payment) =>
            axiosInstance.post(
              `/subscription/orders/${encodeURIComponent(payment.orderId)}/reconcile`,
              {},
              config,
            ),
          ),
        );
        await loadDashboard();
      } catch (error) {
        console.error("Unable to reconcile pending subscription payments:", error);
      }
    })();
  }, [dashboard?.billingHistory, loadDashboard, user]);

  const handlePurchase = async (plan: Plan) => {
    if (!user) {
      toast.error("Sign in to purchase a subscription.");
      return;
    }
    setBusyPlan(plan.id);
    try {
      const config = await getFirebaseAuthConfig();
      const orderResponse = await axiosInstance.post(
        "/subscription/orders",
        { plan: plan.id, period },
        config,
      );
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Razorpay Checkout failed to load"));
          document.body.appendChild(script);
        });
      }
      const order = orderResponse.data;
      if (!window.Razorpay) throw new Error("Razorpay Checkout is unavailable");
      let paymentSubmitted = false;
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Your-Tube",
        description: `${plan.name} subscription (${period})`,
        order_id: order.orderId,
        prefill: { email: user.email, name: user.name },
        handler: async (payment: Record<string, string>) => {
          paymentSubmitted = true;
          try {
            const verification = await axiosInstance.post(
              "/subscription/verify",
              {
                orderId: payment.razorpay_order_id,
                paymentId: payment.razorpay_payment_id,
                signature: payment.razorpay_signature,
              },
              config,
            );
            const startsAt = verification.data.subscription?.startsAt;
            if (startsAt && new Date(startsAt).getTime() > Date.now()) {
              toast.success(
                `${plan.name} is scheduled to start ${new Date(startsAt).toLocaleDateString()}.`,
              );
            } else {
              toast.success("Subscription activated.");
            }
            await loadDashboard();
          } catch (error) {
            console.error("Payment verification failed:", error);
            toast.error(
              "Payment received, but verification is pending. Reopen billing history to reconcile it.",
            );
            await loadDashboard();
          }
        },
        modal: {
          ondismiss: () => {
            void (async () => {
              try {
                await axiosInstance.post(
                  paymentSubmitted
                    ? `/subscription/orders/${encodeURIComponent(order.orderId)}/reconcile`
                    : `/subscription/orders/${encodeURIComponent(order.orderId)}/cancel`,
                  {},
                  config,
                );
                await loadDashboard();
              } catch (error) {
                console.error("Could not record checkout cancellation:", error);
                toast.error("Could not update payment status. Recheck billing history.");
              }
            })();
          },
        },
        theme: { color: "#7c3aed" },
      });
      checkout.on("payment.failed", () => {
        toast.error("Payment failed. You can retry checkout from this plan.");
      });
      checkout.open();
    } catch (error) {
      console.error("Could not start subscription checkout:", error);
      toast.error("Could not start checkout. Check your sign-in and payment configuration.");
    } finally {
      setBusyPlan("");
    }
  };

  const handleCancelSubscription = async (subscription: ActiveSubscription) => {
    const isScheduled = new Date(subscription.startsAt).getTime() > Date.now();
    const message = isScheduled
      ? "Cancel this paid subscription scheduled for a future date?"
      : "Cancel this subscription at the end of its current validity period?";
    if (!window.confirm(message)) return;

    setBusySubscription(subscription._id);
    try {
      const config = await getFirebaseAuthConfig();
      const response = await axiosInstance.post(
        `/subscription/${encodeURIComponent(subscription._id)}/cancel`,
        {},
        config,
      );
      toast.success(response.data.message);
      await loadDashboard();
    } catch (error) {
      console.error("Could not cancel subscription:", error);
      toast.error("Unable to cancel this subscription. Please retry.");
    } finally {
      setBusySubscription("");
    }
  };

  const activeSubscription = dashboard?.currentPlan?.subscription;
  const currentPlanId = dashboard?.currentPlan?.id || "free";
  const planRanks: Record<string, number> = {
    free: 0,
    bronze: 1,
    silver: 2,
    gold: 3,
  };

  return (
    <main className="min-w-0 flex-1 space-y-6 p-3 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold">Subscription plans</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare memberships, download limits, and premium features.
        </p>
      </header>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-lg font-semibold">Your membership</h2>
        {!user ? (
          <p className="mt-2 text-sm text-muted-foreground">Sign in to view your membership and billing history.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              Current plan: <strong>{dashboard?.currentPlan?.name || (loading ? "Loading…" : "Free")}</strong>
              {activeSubscription && (
                <>
                  {" · "}
                  {activeSubscription.status === "cancelled"
                    ? "Access until "
                    : "Valid until "}
                  {new Date(activeSubscription.expiresAt).toLocaleDateString()}
                </>
              )}
            </p>
            <Link className="text-sm text-primary underline" href="/downloads">
              View downloads and quota
            </Link>
          </div>
        )}
        {user && (
          <p className="mt-2 text-xs text-muted-foreground">
            Renewals are manual. A purchase made during a paid period starts at its expiry; a higher-tier upgrade takes effect after payment verification. There are no prorated refunds.
          </p>
        )}
        {user && activeSubscription?.status === "active" && (
          <button
            type="button"
            disabled={busySubscription === activeSubscription._id}
            onClick={() => void handleCancelSubscription(activeSubscription)}
            className="mt-3 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          >
            {busySubscription === activeSubscription._id
              ? "Cancelling…"
              : "Cancel at expiry"}
          </button>
        )}
        {user && activeSubscription?.status === "cancelled" && (
          <p className="mt-2 text-sm text-muted-foreground">
            This membership is set to end at its expiry date.
          </p>
        )}
      </section>

      {user && dashboard?.subscriptions?.some((subscription) =>
        subscription.status === "scheduled",
      ) && (
        <section className="space-y-2 rounded-lg border bg-card p-4">
          <h2 className="font-semibold">Scheduled memberships</h2>
          {dashboard.subscriptions
            .filter((subscription) => subscription.status === "scheduled")
            .map((subscription) => (
              <div
                key={subscription._id}
                className="flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <span>
                  {subscription.plan || "Membership"} · Starts{" "}
                  {new Date(subscription.startsAt).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  disabled={busySubscription === subscription._id}
                  onClick={() => void handleCancelSubscription(subscription)}
                  className="rounded-md border px-3 py-2 disabled:opacity-50"
                >
                  {busySubscription === subscription._id
                    ? "Cancelling…"
                    : "Cancel scheduled plan"}
                </button>
              </div>
            ))}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2" aria-label="Billing period">
        {periods.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setPeriod(value)}
            className={`rounded-md border px-3 py-2 text-sm capitalize ${
              period === value ? "border-primary bg-primary text-primary-foreground" : "bg-background"
            }`}
          >
            {value}
            {value === "quarterly" ? " · 10% off" : value === "yearly" ? " · 20% off" : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <p>Loading plans…</p>
      ) : plansError ? (
        <p role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm text-destructive">
          {plansError}
        </p>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <article key={plan.id} className="flex flex-col rounded-lg border bg-card p-5">
              <h2 className="text-xl font-semibold">{plan.name}</h2>
              <p className="mt-2 text-2xl font-bold">{money(plan.prices[period])}</p>
              <p className="text-xs text-muted-foreground">{period} billing</p>
              <ul className="my-5 flex-1 space-y-2 text-sm">
                <li>{plan.dailyDownloads} downloads per day · {plan.monthlyDownloads} per month</li>
                <li>Up to {plan.quality} streaming quality</li>
                <li>{plan.premiumRank === 0 ? "Public videos" : `${plan.name} premium videos and below`}</li>
                <li>{plan.exclusiveCourses === "all" ? "All exclusive courses" : plan.exclusiveCourses === "selected" ? "Selected exclusive courses" : "No exclusive courses"}</li>
                <li>{plan.adFree ? "Ad-free viewing" : "Includes ads"}</li>
                <li>{plan.prioritySupport ? "Priority support" : "Standard support"}</li>
              </ul>
              <button
                type="button"
                disabled={plan.id === "free" || busyPlan !== ""}
                onClick={() => void handlePurchase(plan)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {plan.id === "free"
                  ? "Included"
                  : busyPlan === plan.id
                    ? "Starting checkout…"
                    : plan.id === currentPlanId
                      ? "Renew after expiry"
                      : planRanks[plan.id] > planRanks[currentPlanId]
                        ? "Upgrade now"
                        : "Change at expiry"}
              </button>
            </article>
          ))}
        </section>
      )}

      {user && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-lg font-semibold">Billing history</h2>
          {!dashboard?.billingHistory?.length ? (
            <p className="mt-2 text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <div className="mt-3 divide-y">
              {dashboard.billingHistory.map((payment) => (
                <div key={payment._id} className="space-y-1 py-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>{payment.plan} · {payment.period} · {money(payment.amountPaise)}</span>
                    <span className="capitalize">{payment.status}</span>
                  </div>
                  <p className="break-all text-xs text-muted-foreground">
                    Invoice: {payment.invoiceNumber || "Pending"} · Order: {payment.orderId}
                  </p>
                  {payment.paymentId && (
                    <p className="break-all text-xs text-muted-foreground">
                      Payment: {payment.paymentId}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          {activeSubscription && (
            <p className="mt-3 text-xs text-muted-foreground">
              This plan does not auto-renew; renew manually before expiry to retain premium access.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
