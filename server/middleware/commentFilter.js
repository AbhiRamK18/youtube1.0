const MAX_COMMENT_LENGTH = 2000;
const MIN_COMMENT_LENGTH = 2;

// Detect long sequences of the same character.
const repeatedCharacterPattern = /(.)\1{9,}/u;

// Detect comments consisting only of punctuation, symbols, or whitespace.
const onlySymbolsPattern = /^[\p{P}\p{S}\s]+$/u;

// Detect excessive repeated emoji sequences.
const repeatedEmojiPattern =
  /(?:\p{Extended_Pictographic}[\uFE0F\uFE0E]?(?:\u200D\p{Extended_Pictographic}[\uFE0F\uFE0E]?)*){6,}/u;

const urlPattern = /\b(?:https?:\/\/|www\.)\S+/giu;
const dangerousSchemePattern = /(?:javascript|data|vbscript):/iu;
const suspiciousShortenerPattern =
  /(?:https?:\/\/)?(?:www\.)?(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly)\//iu;
const unsafeIpPattern =
  /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/u;
const configuredAbusiveWords = () => [
  "fuck",
  "bitch",
  "bastard",
  ...(process.env.COMMENT_ABUSIVE_WORDS || "")
    .split(",")
    .map((word) => word.trim().normalize("NFKC").toLowerCase())
    .filter(Boolean),
];

const configuredBlockedDomains = () =>
  (process.env.COMMENT_BLOCKED_DOMAINS || "")
  .split(",")
  .map((domain) => domain.trim().toLowerCase().replace(/^www\./, ""))
  .filter(Boolean);

const containsUnsafeLink = (text) => {
  const links = [...text.matchAll(urlPattern)];
  if (links.length > 3) return true;
  const blockedDomains = configuredBlockedDomains();

  return links.some((match) => {
    try {
      const value = match[0].startsWith("www.") ? `https://${match[0]}` : match[0];
      const parsedUrl = new URL(value);
      const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
      return (
        Boolean(parsedUrl.username || parsedUrl.password) ||
        hostname === "localhost" ||
        hostname === "0.0.0.0" ||
        hostname === "::1" ||
        unsafeIpPattern.test(hostname) ||
        blockedDomains.some(
          (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
        )
      );
    } catch {
      return true;
    }
  });
};

export const filterCommentText = (text) => {
  if (typeof text !== "string") {
    return {
      valid: false,
      message: "Comment must be text.",
    };
  }

  const trimmedText = text.trim();

  if (trimmedText.length < MIN_COMMENT_LENGTH) {
    return {
      valid: false,
      message: "Comment is too short.",
    };
  }

  if (trimmedText.length > MAX_COMMENT_LENGTH) {
    return {
      valid: false,
      message: "Comment cannot exceed 2000 characters.",
    };
  }

  if (onlySymbolsPattern.test(trimmedText)) {
    return {
      valid: false,
      message: "Please include meaningful text in your comment.",
    };
  }

  if (repeatedCharacterPattern.test(trimmedText)) {
    return {
      valid: false,
      message: "Too many repeated characters. Please edit your comment.",
    };
  }

  if (repeatedEmojiPattern.test(trimmedText)) {
    return {
      valid: false,
      message: "Please avoid excessive repeated emojis.",
    };
  }

  const meaningfulCharacterCount = [...trimmedText].filter((character) =>
    /[\p{L}\p{N}]/u.test(character),
  ).length;
  if (
    [...trimmedText].length >= 20 &&
    meaningfulCharacterCount / [...trimmedText].length < 0.35
  ) {
    return {
      valid: false,
      message: "Please avoid comments made mostly of repeated symbols or emojis.",
    };
  }

  if (
    dangerousSchemePattern.test(trimmedText) ||
    containsUnsafeLink(trimmedText)
  ) {
    return {
      valid: false,
      message: "Your comment contains an unsafe or blocked link.",
    };
  }

  if (suspiciousShortenerPattern.test(trimmedText)) {
    return {
      valid: false,
      message: "Shortened links are not allowed in comments.",
    };
  }

  // Check for configured abusive words.
  const normalizedText = trimmedText
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[013457@$!]/g, (character) => {
      const substitutions = {
        "0": "o",
        "1": "i",
        "3": "e",
        "4": "a",
        "5": "s",
        "7": "t",
        "@": "a",
        "$": "s",
        "!": "i",
      };
      return substitutions[character];
    });

  const containsAbusiveWord = configuredAbusiveWords().some((word) => {
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const wordPattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapedWord}($|[^\\p{L}\\p{N}])`,
      "iu"
    );

    return wordPattern.test(normalizedText);
  });

  if (containsAbusiveWord) {
    return {
      valid: false,
      message: "Your comment contains inappropriate language.",
    };
  }

  return {
    valid: true,
    text: trimmedText,
  };
};
