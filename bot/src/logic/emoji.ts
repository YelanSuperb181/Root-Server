// Root reports reactions as ":name:" for standard emoji (iamcal emoji-data
// names) and ":name:id:" for community emoji. Root only turns shortcodes into
// emoji for reactions, never in message text, so every emoji we use carries
// both forms: `code` to react with and `glyph` to print.

export interface Emoji {
  /** Shortcode name without colons, e.g. "star". */
  code: string;
  /** Unicode text for message bodies, e.g. "⭐". */
  glyph: string;
}

export function emoji(code: string, glyph: string): Emoji {
  return { code, glyph };
}

/** ":star:" for reactionCreate. */
export function shortcode(e: Emoji): string {
  return `:${e.code}:`;
}

// Alternative names some clients report for the same standard emoji.
const ALIASES: Record<string, string> = {
  thumbsup: "+1",
  thumbsdown: "-1",
  heavy_check_mark: "white_check_mark",
  ten: "keycap_ten",
};

/** Comparable key for a reported shortcode: ":Star:" and ":star:123:" -> "star". */
export function emojiKey(reported: string): string {
  const name = reported.split(":").filter(Boolean)[0]?.toLowerCase() ?? "";
  return ALIASES[name] ?? name;
}

export function isEmoji(reported: string, e: Emoji): boolean {
  return emojiKey(reported) === emojiKey(e.code);
}

export const E = {
  check: emoji("white_check_mark", "✅"),
  cross: emoji("x", "❌"),
  thumbsUp: emoji("+1", "👍"),
  thumbsDown: emoji("-1", "👎"),
  star: emoji("star", "⭐"),
  tada: emoji("tada", "🎉"),
} as const;

/** Keycap reactions for poll options 1-10. */
export const NUMBERS: readonly Emoji[] = [
  emoji("one", "1️⃣"),
  emoji("two", "2️⃣"),
  emoji("three", "3️⃣"),
  emoji("four", "4️⃣"),
  emoji("five", "5️⃣"),
  emoji("six", "6️⃣"),
  emoji("seven", "7️⃣"),
  emoji("eight", "8️⃣"),
  emoji("nine", "9️⃣"),
  emoji("keycap_ten", "🔟"),
];
