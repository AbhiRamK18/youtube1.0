import { randomInt } from "node:crypto";

const ATTEMPT_WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS_BEFORE_CHALLENGE = 3;
const attemptStates = new Map();

const newChallenge = () => {
  const left = randomInt(20, 100);
  const right = randomInt(20, 100);
  return {
    question: `What is ${left} + ${right}?`,
    answer: String(left + right),
  };
};

const createPostingLimit = (label) => (req, res, next) => {
  const ipAddress = req.ip || req.socket.remoteAddress || "unknown";
  const userId = req.authenticatedUser?._id?.toString() || "anonymous";
  const key = `${ipAddress}:${userId}`;
  const now = Date.now();
  let state = attemptStates.get(key);

  if (!state || now - state.startedAt >= ATTEMPT_WINDOW_MS) {
    state = {
      startedAt: now,
      attempts: 0,
      challenge: null,
      challengeAttempts: 0,
    };
    attemptStates.set(key, state);
  }

  if (state.attempts >= MAX_ATTEMPTS_BEFORE_CHALLENGE) {
    if (!state.challenge) state.challenge = newChallenge();
    const { question } = state.challenge;
    if (state.challengeAttempts >= 5) {
      return res.status(429).json({
        message: `Too many incorrect verification answers. Wait before posting another ${label}.`,
        captchaRequired: true,
      });
    }

    if (
      typeof req.body?.captchaAnswer !== "string" ||
      req.body.captchaAnswer.trim() !== state.challenge.answer
    ) {
      state.challengeAttempts += 1;
      return res.status(429).json({
        message: `Please complete the verification before posting another ${label}.`,
        captchaRequired: true,
        captcha: { question },
        attemptsRemaining: 5 - state.challengeAttempts,
      });
    }

    state.attempts = 0;
    state.challenge = null;
    state.challengeAttempts = 0;
  } else {
    state.attempts += 1;
  }

  if (attemptStates.size > 10000) {
    for (const [ip, item] of attemptStates) {
      if (now - item.startedAt >= ATTEMPT_WINDOW_MS) attemptStates.delete(ip);
    }
  }

  next();
};

export const commentRateLimit = createPostingLimit("comment");
export const replyRateLimit = createPostingLimit("reply");
