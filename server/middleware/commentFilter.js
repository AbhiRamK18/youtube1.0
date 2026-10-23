const MAX_COMMENT_LENGTH = 2000;
const MIN_COMMENT_LENGTH = 2;

// Detect long sequences of the same character.
const repeatedCharacterPattern = /(.)\1{9,}/u;

// Detect comments consisting only of punctuation, symbols, or whitespace.
const onlySymbolsPattern = /^[\p{P}\p{S}\s]+$/u;

// Detect excessive repeated emoji sequences.
const repeatedEmojiPattern =
  /(?:\p{Extended_Pictographic}[\uFE0F\uFE0E]?(?:\u200D\p{Extended_Pictographic}[\uFE0F\uFE0E]?)*){6,}/u;

// Configurable abusive-word list.
// Add appropriate terms in English, Telugu, Hindi, and other languages.
// These are illustrative entries; expand and review the list for your needs.
const abusiveWords = [
  "fuck",
  "bitch",
  "bastard",
];

// Detect URLs and dangerous URL schemes.
const urlPattern = /\b(?:https?:\/\/|www\.)\S+/giu;

const dangerousSchemePattern =
  /(?:javascript|data|vbscript):/iu;

// Common URL-shortening services sometimes used to hide destinations.
// This is a basic heuristic, not proof that a link is malicious.
const suspiciousShortenerPattern =
  /(?:https?:\/\/)?(?:www\.)?(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly)\//iu;

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

  // Check for dangerous URL schemes.
  if (dangerousSchemePattern.test(trimmedText)) {
    return {
      valid: false,
      message: "Your comment contains an unsafe link.",
    };
  }

  // Check for links from commonly used URL shorteners.
  if (suspiciousShortenerPattern.test(trimmedText)) {
    return {
      valid: false,
      message: "Shortened links are not allowed in comments.",
    };
  }

  // Check for configured abusive words.
  const normalizedText = trimmedText.toLowerCase();

  const containsAbusiveWord = abusiveWords.some((word) => {
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
