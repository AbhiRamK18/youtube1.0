import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
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
    status: {
      type: String,
      enum: ["active", "scheduled", "cancelled", "expired"],
      default: "active",
      index: true,
    },
    startsAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    autoRenew: { type: Boolean, default: false },
    orderId: { type: String, required: true, unique: true },
    paymentId: { type: String, required: true, unique: true },
    invoiceNumber: { type: String, required: true, unique: true },
    amountPaise: { type: Number, required: true },
    currency: { type: String, enum: ["INR"], default: "INR" },
  },
  { timestamps: true },
);

export default mongoose.model("subscription", subscriptionSchema);
