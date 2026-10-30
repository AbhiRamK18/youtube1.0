import mongoose from "mongoose";

const subscriptionPaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    plan: {
      type: String,
      enum: ["bronze", "silver", "gold"],
      required: true,
    },
    period: {
      type: String,
      enum: ["monthly", "quarterly", "yearly"],
      required: true,
    },
    orderId: { type: String, required: true, unique: true },
    paymentId: { type: String, unique: true, sparse: true },
    signature: { type: String, default: "" },
    invoiceNumber: { type: String, default: "" },
    amountPaise: { type: Number, required: true },
    currency: { type: String, enum: ["INR"], default: "INR" },
    status: {
      type: String,
      enum: ["created", "activating", "captured", "failed", "cancelled"],
      default: "created",
      index: true,
    },
    failureReason: { type: String, default: "" },
    receiptEmailSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("subscriptionpayment", subscriptionPaymentSchema);
