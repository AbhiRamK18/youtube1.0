import assert from "node:assert/strict";
import { test } from "node:test";
import { filterCommentText } from "./commentFilter.js";

test("comment filter catches curated profanity in supported language scripts", () => {
  for (const text of [
    "That is a fuck idea",
    "यह चूतिया है",
    "ఇది లంజ పని",
    "அவன் தேவடியா",
    "ಇದು ಸೂಳೆ",
    "അവൻ തായോളി",
  ]) {
    assert.equal(filterCommentText(text).valid, false, text);
  }
});

test("comment filter accepts ordinary multilingual comments", () => {
  for (const text of [
    "This is a helpful explanation.",
    "यह बहुत अच्छी बात है",
    "ఈ వీడియో చాలా బాగుంది",
    "இந்த வீடியோ மிகவும் நன்றாக உள்ளது",
    "ಇದು ತುಂಬಾ ಚೆನ್ನಾಗಿದೆ",
    "ഈ വീഡിയോ വളരെ നല്ലതാണ്",
  ]) {
    assert.equal(filterCommentText(text).valid, true, text);
  }
});

test("comment filter supports additional deployment-configured terms", () => {
  const previous = process.env.COMMENT_ABUSIVE_WORDS_HI;
  process.env.COMMENT_ABUSIVE_WORDS_HI = "workspace-specific-term";

  try {
    assert.equal(filterCommentText("this workspace-specific-term").valid, false);
  } finally {
    if (previous === undefined) {
      delete process.env.COMMENT_ABUSIVE_WORDS_HI;
    } else {
      process.env.COMMENT_ABUSIVE_WORDS_HI = previous;
    }
  }
});

test("comment filter blocks unsafe links and repeated symbols", () => {
  assert.equal(filterCommentText("Visit javascript:alert(1)").valid, false);
  assert.equal(filterCommentText("!!!!!!!!!!!!!!").valid, false);
});
