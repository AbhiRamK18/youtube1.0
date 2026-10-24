import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import users from "../Modals/Auth.js";
import {
  LoginChallenge,
  LoginRecord,
  TrustedDevice,
} from "../Modals/loginSecurity.js";
import { getFirebaseAdminAuth } from "../lib/firebaseAdmin.js";
import { getCityFromCoordinates } from "../lib/reverseGeocode.js";
import {
  findMatchingTrustedDevice,
  hashSecurityValue,
  parseLoginDevice,
} from "../lib/trustedDevice.js";

const DEVICE_COOKIE = "yt_trusted_device";
const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

const setTrustedCookie = (res, token, expiresAt) => {
  const signature = hashSecurityValue(token);
  const sameSite = process.env.AUTH_COOKIE_SAMESITE || "Lax";
  const secure =
    process.env.NODE_ENV === "production" || sameSite.toLowerCase() === "none"
      ? "; Secure"
      : "";
  res.setHeader(
    "Set-Cookie",
    `${DEVICE_COOKIE}=${token}.${signature}; HttpOnly; SameSite=${sameSite}; Path=/; Expires=${expiresAt.toUTCString()}${secure}`,
  );
};

const emailTransport = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS are required");
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
};

const sendOtp = async (email, code) => {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await emailTransport().sendMail({
    from,
    to: email,
    subject: "Your YourTube sign-in verification code",
    text: `Your verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes. If you did not try to sign in, secure your account.`,
  });
};

const defaultTheme = () => {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  return hour >= 5 && hour < 12 ? "light" : "dark";
};

const loginResponse = (res, user) =>
  res.status(200).json({
    result: user,
    trustedDevice: true,
  });

const recordSuccessfulLogin = async (user, device, trustedDeviceId) => {
  if (device.city !== "Unavailable") {
    user.location = device.city;
    await user.save();
  }
  return LoginRecord.create({
    userId: user._id,
    ...device,
    status: "verified",
    verifiedAt: new Date(),
    trustedDeviceId,
  });
};

export const beginLogin = async (req, res) => {
  try {
    if (!req.body?.idToken) {
      return res.status(400).json({ message: "Firebase sign-in token is required" });
    }

    const decoded = await getFirebaseAdminAuth().verifyIdToken(req.body.idToken);
    if (!decoded.email || !decoded.email_verified) {
      return res.status(401).json({ message: "A verified Google account is required" });
    }

    const email = decoded.email.toLowerCase();
    let user = await users.findOne({ email });
    if (!user) {
      user = await users.create({
        email,
        name: decoded.name || "",
        image: decoded.picture || "",
        themePreference: defaultTheme(),
      });
    } else {
      user.name = decoded.name || user.name;
      user.image = decoded.picture || user.image;
      if (!user.themePreference) user.themePreference = defaultTheme();
      await user.save();
    }

    const device = parseLoginDevice(req);
    const location = await getCityFromCoordinates(req.body.locationCoordinates);
    if (location) {
      for (const [key, value] of Object.entries(location)) {
        if (value) device[key] = value;
      }
    }
    const trusted = await findMatchingTrustedDevice(req, user._id, location);

    if (trusted) {
      trusted.lastUsedAt = new Date();
      await trusted.save();
      await recordSuccessfulLogin(user, device, trusted._id);
      return loginResponse(res, user);
    }

    const previousChallenges = await LoginChallenge.find({ userId: user._id }).select(
      "loginRecordId",
    );
    if (previousChallenges.length) {
      await LoginRecord.updateMany(
        { _id: { $in: previousChallenges.map((item) => item.loginRecordId) }, status: "otp_sent" },
        { $set: { status: "expired" } },
      );
      await LoginChallenge.deleteMany({ userId: user._id });
    }
    const record = await LoginRecord.create({
      userId: user._id,
      ...device,
      status: "otp_sent",
    });
    const code = String(randomInt(100000, 1000000));
    const challenge = await LoginChallenge.create({
      userId: user._id,
      email,
      codeHash: hashSecurityValue(code),
      loginRecordId: record._id,
      previousTrustedDeviceId: trusted?._id || null,
      device,
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    });

    try {
      await sendOtp(email, code);
    } catch (mailError) {
      await LoginChallenge.findByIdAndDelete(challenge._id);
      record.status = "otp_failed";
      await record.save();
      console.error("Sign-in OTP email failed:", mailError);
      return res.status(503).json({
        message: "Email verification is temporarily unavailable. Please try again later.",
      });
    }

    return res.status(202).json({
      verificationRequired: true,
      challengeId: challenge._id,
      email: email.replace(/^(.).+(@.*)$/, "$1***$2"),
      expiresInSeconds: OTP_TTL_MINUTES * 60,
    });
  } catch (error) {
    console.error("Secure login failed:", error);
    if (typeof error.code === "string" && error.code.startsWith("auth/")) {
      return res.status(401).json({ message: "Google sign-in could not be verified" });
    }
    return res.status(503).json({
      message: "Secure sign-in is not configured or could not be completed.",
    });
  }
};

export const verifyLogin = async (req, res) => {
  const { challengeId, code, idToken } = req.body || {};
  if (!challengeId || !/^\d{6}$/.test(code || "") || !idToken) {
    return res.status(400).json({ message: "A valid verification code is required" });
  }

  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
    const challenge = await LoginChallenge.findOne({
      _id: challengeId,
      email: decoded.email?.toLowerCase(),
      expiresAt: { $gt: new Date() },
    }).select("+codeHash");

    if (!challenge) {
      return res.status(400).json({ message: "Verification expired. Please sign in again." });
    }
    if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
      await LoginChallenge.findByIdAndDelete(challenge._id);
      return res.status(429).json({ message: "Too many incorrect codes. Sign in again." });
    }

    const submittedHash = Buffer.from(hashSecurityValue(code), "hex");
    const savedHash = Buffer.from(challenge.codeHash, "hex");
    if (!timingSafeEqual(submittedHash, savedHash)) {
      const updatedChallenge = await LoginChallenge.findOneAndUpdate(
        { _id: challenge._id, attempts: { $lt: MAX_OTP_ATTEMPTS } },
        { $inc: { attempts: 1 } },
        { new: true },
      );
      if (!updatedChallenge) {
        return res.status(429).json({
          message: "Too many incorrect codes. Sign in again.",
        });
      }
      await LoginRecord.create({
        userId: challenge.userId,
        ...challenge.device,
        status: "otp_failed",
      });
      return res.status(400).json({
        message: "That verification code is incorrect",
        attemptsRemaining: MAX_OTP_ATTEMPTS - updatedChallenge.attempts,
      });
    }

    const user = await users.findById(challenge.userId);
    if (!user) {
      return res.status(404).json({ message: "Account not found" });
    }
    const device = challenge.device;
    if (device.city !== "Unavailable") {
      user.location = device.city;
      await user.save();
    }

    const trustDays = Number(process.env.TRUSTED_DEVICE_DAYS || 30);
    if (!Number.isFinite(trustDays) || trustDays < 1 || trustDays > 365) {
      return res.status(500).json({
        message: "Trusted-device duration must be between 1 and 365 days",
      });
    }
    const trustedToken = randomBytes(32).toString("base64url");
    const trustedUntil = new Date(Date.now() + trustDays * 24 * 60 * 60 * 1000);
    const deviceUpdate = {
      tokenHash: hashSecurityValue(trustedToken),
      label: `${device.browser} on ${device.operatingSystem}`,
      ...device,
      trustedUntil,
      lastUsedAt: new Date(),
      revokedAt: null,
    };
    const trustedDevice = challenge.previousTrustedDeviceId
      ? await TrustedDevice.findOneAndUpdate(
          {
            _id: challenge.previousTrustedDeviceId,
            userId: challenge.userId,
          },
          { $set: deviceUpdate },
          { new: true },
        )
      : null;
    const savedTrustedDevice =
      trustedDevice ||
      (await TrustedDevice.create({
        userId: challenge.userId,
        ...deviceUpdate,
      }));

    await LoginRecord.findByIdAndUpdate(challenge.loginRecordId, {
      status: "verified",
      verifiedAt: new Date(),
      trustedDeviceId: savedTrustedDevice._id,
    });
    await LoginChallenge.findByIdAndDelete(challenge._id);
    setTrustedCookie(res, trustedToken, trustedUntil);
    return loginResponse(res, user);
  } catch (error) {
    console.error("Login verification failed:", error);
    return res.status(503).json({ message: "Unable to verify sign-in right now" });
  }
};

export const getLoginHistory = async (req, res) => {
  try {
    const records = await LoginRecord.find({ userId: req.authenticatedUser._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .select("-__v");
    return res.status(200).json(records);
  } catch (error) {
    console.error("Login history retrieval failed:", error);
    return res.status(500).json({ message: "Unable to load login history" });
  }
};

export const getTrustedDevices = async (req, res) => {
  try {
    const devices = await TrustedDevice.find({
      userId: req.authenticatedUser._id,
      revokedAt: null,
      trustedUntil: { $gt: new Date() },
    })
      .sort({ lastUsedAt: -1 })
      .select("-tokenHash -__v");
    return res.status(200).json(devices);
  } catch (error) {
    console.error("Trusted device retrieval failed:", error);
    return res.status(500).json({ message: "Unable to load trusted devices" });
  }
};

export const revokeTrustedDevice = async (req, res) => {
  try {
    const device = await TrustedDevice.findOneAndUpdate(
      { _id: req.params.id, userId: req.authenticatedUser._id, revokedAt: null },
      { $set: { revokedAt: new Date() } },
      { new: true },
    );
    if (!device) return res.status(404).json({ message: "Trusted device not found" });
    return res.status(200).json({ message: "Trusted device revoked" });
  } catch (error) {
    console.error("Trusted device revocation failed:", error);
    return res.status(500).json({ message: "Unable to revoke trusted device" });
  }
};
