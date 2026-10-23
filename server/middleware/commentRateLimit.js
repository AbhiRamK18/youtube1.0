import { randomInt } from "node:crypto";

const ATTEMPT_WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS_BEFORE_CHALLENGE = 3;
const attemptStates = new Map();

const newChallenge = () => {
  const left = randomInt(2, 10);
  const right = randomInt(2, 10);
  return {
    question: `What is ${left} + ${right}?`,
    answer: String(left + right),
  };
};

const createPostingLimit = (label) => (req, res, next) => {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let state = attemptStates.get(key);

  if (!state || now - state.startedAt >= ATTEMPT_WINDOW_MS) {
    state = { startedAt: now, attempts: 0, challenge: null };
    attemptStates.set(key, state);
  }

  if (state.attempts >= MAX_ATTEMPTS_BEFORE_CHALLENGE) {
    if (!state.challenge) state.challenge = newChallenge();
    const { question } = state.challenge;

    if (
      typeof req.body?.captchaAnswer !== "string" ||
      req.body.captchaAnswer.trim() !== state.challenge.answer
    ) {
      return res.status(429).json({
        message: `Please complete the verification before posting another ${label}.`,
        captchaRequired: true,
        captcha: { question },
      });
    }

    state.attempts = 0;
    state.challenge = null;
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
