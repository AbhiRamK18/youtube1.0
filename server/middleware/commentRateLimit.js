import { rateLimit } from "express-rate-limit";

// Limit comment submissions.
export const commentRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many comments submitted. Please try again in one minute.",
  },
});

// Limit reply submissions separately.
export const replyRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many replies submitted. Please try again in one minute.",
  },
});