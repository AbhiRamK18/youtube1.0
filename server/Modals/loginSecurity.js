import mongoose from "mongoose";

const deviceDetails = {
  ipAddress: { type: String, default: "unknown" },
  browser: { type: String, default: "Unknown" },
  browserVersion: { type: String, default: "" },
  operatingSystem: { type: String, default: "Unknown" },
  deviceType: {
    type: String,
    enum: ["Desktop", "Mobile", "Tablet"],
    default: "Desktop",
  },
  deviceModel: { type: String, default: "Unknown" },
  city: { type: String, default: "Unavailable" },
  state: { type: String, default: "Unavailable" },
  country: { type: String, default: "Unavailable" },
  approximateLocation: { type: String, default: "Unavailable" },
};

const loginRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    ...deviceDetails,
    status: {
      type: String,
      enum: ["otp_sent", "verified", "otp_failed", "expired", "revoked"],
      required: true,
    },
    verifiedAt: { type: Date, default: null },
    trustedDeviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "trusteddevice",
      default: null,
    },
  },
  { timestamps: true },
);

const trustedDeviceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true, select: false },
    label: { type: String, required: true },
    ...deviceDetails,
    trustedUntil: { type: Date, required: true },
    lastUsedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const loginChallengeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    email: { type: String, required: true },
    codeHash: { type: String, required: true, select: false },
    loginRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "loginrecord",
      required: true,
    },
    previousTrustedDeviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "trusteddevice",
      default: null,
    },
    device: { type: mongoose.Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const LoginRecord =
  mongoose.models.loginrecord ||
  mongoose.model("loginrecord", loginRecordSchema);
export const TrustedDevice =
  mongoose.models.trusteddevice ||
  mongoose.model("trusteddevice", trustedDeviceSchema);
export const LoginChallenge =
  mongoose.models.loginchallenge ||
  mongoose.model("loginchallenge", loginChallengeSchema);
