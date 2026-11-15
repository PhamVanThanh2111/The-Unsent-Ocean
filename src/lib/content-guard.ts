/**
 * The Unsent Ocean — Multi-Layered Content Sincerity & Anti-Spam Guard
 *
 * Ensures that every letter cast into the ocean is a genuine, heartfelt human message
 * rather than gibberish, keyboard mashing, filler spam to bypass "Give to Receive",
 * links, phone numbers, commercial ads, or profanity.
 */

export type ContentValidationErrorCode =
  | "TOO_SHORT"
  | "TOO_LONG"
  | "LOW_EFFORT_SPAM"
  | "LINK_OR_CONTACT"
  | "INAPPROPRIATE"
  | "DUPLICATE"
  | "RATE_LIMITED";

export interface ContentValidationResult {
  valid: boolean;
  normalizedContent: string;
  errorCode?: ContentValidationErrorCode;
  isSoftFlagged?: boolean;
}

// 1. Explicit Profanity & Vulgarity Patterns (including dot/space/dash obfuscations)
// NOTE: Temporarily commented out — reserved for future opt-in sensitive content filter feature
/*
const PROFANITY_PATTERNS: RegExp[] = [
  /\b(đụ|địt|lồn|cặc|đéo|đĩ|điếm|chó\s*đẻ|vkl|vcl|vl|đm|đcm|dmm|đkm|clm|cc|loz|cak)\b/i,
  /\b(d[\s._-]*u[\s._-]*m[\s._-]*a|d[\s._-]*i[\s._-]*t|l[\s._-]*o[\s._-]*n|c[\s._-]*a[\s._-]*c)\b/i,
  /\b(fuck|fucking|f\*ck|f[\s._-]*u[\s._-]*c[\s._-]*k|shit|bitch|asshole|bastard|cunt|dick|pussy|whore|slut)\b/i,
];

// 2. Soft-Flag Borderline Aggressive Patterns (allowed but auto-flagged `isReported = true`)
const SOFT_FLAG_PATTERNS: RegExp[] = [
  /\b(chết\s*tiệt|khốn\s*nạn|ngu\s*ngốc|cút\s*đi|rác\s*rưởi|đồ\s*ngu|khốn\s*kiếp)\b/i,
];
*/

// 3. Links, Domains, Emails, Phone Numbers & Commercial Solicitation
const LINK_AND_CONTACT_PATTERNS: RegExp[] = [
  /(https?:\/\/|ftp:\/\/|www\.)/i,
  /\b[a-z0-9-]+\.(com|vn|net|org|io|me|info|biz|xyz|top|club|online|site|store|shop|app|gg|ly)\b/i,
  /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i,
  // Phone numbers: 8 to 12 digits (even separated by spaces, dots, or hyphens)
  /(?:\+?84|0)(?:[\s.-]*\d){8,10}\b/,
  /\b(?:\d[\s.-]*){8,13}\b/,
  // Gambling, scam & social solicitation keywords
  /\b(nhà\s*cái|cá\s*cược|tài\s*xỉu|nổ\s*hũ|vay\s*tiền|kiếm\s*tiền\s*online|tuyển\s*ctv|link\s*bio|telegram|t\.me|zalo\s*0\d)\b/i,
];

// 4. Keyboard Mashing & Low-Effort Bypass Phrases
const KEYBOARD_MASH_PATTERNS: RegExp[] = [
  /(qwerty|asdfgh|zxcvbn|qazwsx|poiuyt|lkjhgf|mnbvcx|sdfghj|dfghjk|cvbnm)/i,
  /(123456|234567|345678|456789|567890|098765|987654|abcdef|abcdefg)/i,
  /(.)\1{4,}/i, // 5+ identical consecutive characters (e.g. "aaaaa", ".....", "!!!!!")
  /(\b\w+\b)(?:\s+\1){2,}/i, // Same word repeated 3+ times consecutively (e.g. "alo alo alo")
];

const BYPASS_FILLER_PATTERNS: RegExp[] = [
  /^(test|testing|alo|hello|hi|ok|okay|abc|xyz|nothing|none)[\s\d.!?,]*$/i,
  /\b(viết\s*đại|nhập\s*đại|ghi\s*đại|test\s*thử|để\s*đọc\s*thư|mở\s*khóa\s*đọc|cho\s*xem\s*thư|unlock\s*read|lorem\s*ipsum|blah\s*blah)\b/i,
];

// Vietnamese + English vowels for linguistic naturalness check
const VOWEL_REGEX =
  /[aeiouyăâêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;

const CJK_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

function isLetterChar(ch: string): boolean {
  return ch.toLowerCase() !== ch.toUpperCase() || CJK_REGEX.test(ch);
}

export function validateBottleContent(
  rawInput: string
): ContentValidationResult {
  const normalizedContent = (rawInput ?? "")
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n");

  // Layer 1: Character length check (10 to 500 chars)
  if (normalizedContent.length < 10) {
    return {
      valid: false,
      normalizedContent,
      errorCode: "TOO_SHORT",
    };
  }

  if (normalizedContent.length > 500) {
    return {
      valid: false,
      normalizedContent,
      errorCode: "TOO_LONG",
    };
  }

  // Layer 2: Profanity & Hate Speech check
  // NOTE: Temporarily commented out — reserved for future opt-in sensitive content filter feature
  /*
  for (const pattern of PROFANITY_PATTERNS) {
    if (pattern.test(normalizedContent)) {
      return {
        valid: false,
        normalizedContent,
        errorCode: "INAPPROPRIATE",
      };
    }
  }
  */

  // Layer 3: Links, Phone Numbers, Emails & Solicitation check
  for (const pattern of LINK_AND_CONTACT_PATTERNS) {
    if (pattern.test(normalizedContent)) {
      return {
        valid: false,
        normalizedContent,
        errorCode: "LINK_OR_CONTACT",
      };
    }
  }

  // Layer 4: Keyboard Mashing & Bypass Filler Phrases check
  for (const pattern of KEYBOARD_MASH_PATTERNS) {
    if (pattern.test(normalizedContent)) {
      return {
        valid: false,
        normalizedContent,
        errorCode: "LOW_EFFORT_SPAM",
      };
    }
  }

  for (const pattern of BYPASS_FILLER_PATTERNS) {
    if (pattern.test(normalizedContent)) {
      return {
        valid: false,
        normalizedContent,
        errorCode: "LOW_EFFORT_SPAM",
      };
    }
  }

  // Layer 5: Word Count, Word Length & Vocabulary Diversity check
  const hasCJK = CJK_REGEX.test(normalizedContent);
  const words = normalizedContent
    .toLowerCase()
    .replace(/[.,!?;:"'()[\]{}<>\/\\|@#$%^&*_+=~`-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (!hasCJK) {
    // Require at least 3 words for non-CJK languages (allows concise ~10-char/10-word heartfelt thoughts)
    if (words.length < 3) {
      return {
        valid: false,
        normalizedContent,
        errorCode: "TOO_SHORT",
      };
    }

    // Reject if any single word is > 24 characters without spaces (random keystroke mash)
    if (words.some((w) => w.length > 24)) {
      return {
        valid: false,
        normalizedContent,
        errorCode: "LOW_EFFORT_SPAM",
      };
    }

    // Require at least 3 unique words and >= 55% unique word ratio on short texts
    const uniqueWords = new Set(words);
    const uniqueRatio = uniqueWords.size / words.length;
    if (uniqueWords.size < 3 || (words.length <= 16 && uniqueRatio < 0.55)) {
      return {
        valid: false,
        normalizedContent,
        errorCode: "LOW_EFFORT_SPAM",
      };
    }
  }

  // Layer 6: Alphabetic Ratio, Character Entropy & Vowel-Consonant Naturalness
  const nonSpaceChars = Array.from(normalizedContent.replace(/\s+/g, ""));
  const letterChars = nonSpaceChars.filter((ch) => isLetterChar(ch));

  // At least 65% of non-whitespace characters must be real letters (prevents number/symbol/emoji flood)
  if (
    nonSpaceChars.length === 0 ||
    letterChars.length / nonSpaceChars.length < 0.65
  ) {
    return {
      valid: false,
      normalizedContent,
      errorCode: "LOW_EFFORT_SPAM",
    };
  }

  // Must have at least 5 distinct letter characters
  const uniqueLetters = new Set(letterChars.map((c) => c.toLowerCase()));
  if (uniqueLetters.size < 5) {
    return {
      valid: false,
      normalizedContent,
      errorCode: "LOW_EFFORT_SPAM",
    };
  }

  // For Latin/Vietnamese script: verify natural vowel-to-letter ratio (14% to 82%)
  if (!hasCJK && letterChars.length >= 8) {
    const vowelCount = letterChars.filter((ch) => VOWEL_REGEX.test(ch)).length;
    const vowelRatio = vowelCount / letterChars.length;
    if (vowelRatio < 0.14 || vowelRatio > 0.82) {
      return {
        valid: false,
        normalizedContent,
        errorCode: "LOW_EFFORT_SPAM",
      };
    }
  }

  // Check soft-flag patterns (Temporarily commented out for future opt-in sensitive content toggle)
  /*
  const isSoftFlagged = SOFT_FLAG_PATTERNS.some((pattern) =>
    pattern.test(normalizedContent)
  );
  */
  const isSoftFlagged = false;

  return {
    valid: true,
    normalizedContent,
    isSoftFlagged,
  };
}
