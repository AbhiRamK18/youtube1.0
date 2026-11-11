import express from "express";
import {
  updateprofile,
  updatePreferredCommentLanguage,
  updateThemePreference,
} from "../controllers/auth.js";
import {
  beginLogin,
  getLoginHistory,
  getTrustedDevices,
  revokeTrustedDevice,
  verifyLogin,
} from "../controllers/loginSecurity.js";
import { requireFirebaseUser } from "../middleware/requireFirebaseUser.js";
import {
  otpVerificationRateLimit,
  secureLoginRateLimit,
} from "../middleware/loginRateLimit.js";
const routes = express.Router();

routes.post("/login", secureLoginRateLimit, beginLogin);
routes.post("/verify-login", otpVerificationRateLimit, verifyLogin);
routes.patch("/update/:id", updateprofile);
routes.patch("/preferences/theme", requireFirebaseUser, updateThemePreference);
routes.patch(
  "/preferences/comment-language",
  requireFirebaseUser,
  updatePreferredCommentLanguage,
);
routes.get("/security/logins", requireFirebaseUser, getLoginHistory);
routes.get("/security/devices", requireFirebaseUser, getTrustedDevices);
routes.delete(
  "/security/devices/:id",
  requireFirebaseUser,
  revokeTrustedDevice,
);
export default routes;