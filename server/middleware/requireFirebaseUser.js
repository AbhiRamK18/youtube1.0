import users from "../Modals/Auth.js";
import { getFirebaseAdminAuth } from "../lib/firebaseAdmin.js";
import { findMatchingTrustedDevice } from "../lib/trustedDevice.js";

export const requireFirebaseUser = async (req, res, next) => {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!token) {
    return res.status(401).json({ message: "Sign in is required" });
  }

  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    if (!decoded.email || !decoded.email_verified) {
      return res.status(401).json({ message: "A verified account is required" });
    }

    const user = await users.findOne({ email: decoded.email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: "User account not found" });
    }

    const trustedDevice = await findMatchingTrustedDevice(req, user._id);
    if (!trustedDevice) {
      return res.status(403).json({
        message: "Complete email verification on this device first",
      });
    }

    req.authenticatedUser = user;
    return next();
  } catch (error) {
    console.error("Firebase token verification failed:", error.message);
    return res.status(401).json({ message: "Your sign-in has expired" });
  }
};
