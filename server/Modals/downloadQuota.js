import mongoose from "mongoose";

const downloadQuotaSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      unique: true,
    },
    dayKey: { type: String, required: true },
    monthKey: { type: String, required: true },
    dailyCount: { type: Number, default: 0, min: 0 },
    monthlyCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

export default mongoose.model("downloadquota", downloadQuotaSchema);
