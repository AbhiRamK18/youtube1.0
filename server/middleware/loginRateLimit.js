import { rateLimit } from "express-rate-limit";

const createLoginLimit = (limit, message) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message },
  });

export const secureLoginRateLimit = createLoginLimit(
  8,
  "Too many sign-in attempts. Please wait before trying again.",
);

export const otpVerificationRateLimit = createLoginLimit(
  10,
  "Too many verification attempts. Please wait before trying again.",
);
