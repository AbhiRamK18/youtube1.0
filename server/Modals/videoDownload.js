import mongoose from "mongoose";

const downloadAttemptSchema = new mongoose.Schema(
  {
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["authorized", "in_progress", "completed", "failed"],
      required: true,
    },
    reservedQuota: { type: Boolean, required: true },
    failureReason: { type: String, default: "" },
  },
  { _id: true },
);

const videoDownloadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
    },
    duplicateKey: { type: String, required: true, unique: true },
    downloadedAt: { type: Date, default: Date.now },
    ipAddress: { type: String, default: "unknown" },
    browser: { type: String, default: "Unknown" },
    browserVersion: { type: String, default: "" },
    operatingSystem: { type: String, default: "Unknown" },
    deviceType: { type: String, default: "Desktop" },
    deviceModel: { type: String, default: "Unknown" },
    subscriptionPlan: { type: String, required: true },
    fileSize: { type: Number, required: true },
    status: {
      type: String,
      enum: ["authorized", "in_progress", "completed", "failed", "blocked"],
      default: "authorized",
      index: true,
    },
    activeAttemptId: { type: mongoose.Schema.Types.ObjectId, default: null },
    ticketHash: { type: String, default: "", select: false },
    ticketExpiresAt: { type: Date, default: null, select: false },
    attempts: { type: [downloadAttemptSchema], default: [] },
  },
  { timestamps: true },
);

videoDownloadSchema.index({ userId: 1, downloadedAt: -1 });

export default mongoose.model("videodownload", videoDownloadSchema);
