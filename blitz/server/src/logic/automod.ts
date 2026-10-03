// Auto-moderation checks. Pure: the caller keeps the per-member history and
// decides what to do with a verdict.

import { mentionedRoleIds, mentionedUserIds } from "./text";

export interface AutomodRules {
  maxMentions: number;
  spam: { messages: number; seconds: number };
  duplicates: { count: number; seconds: number };
  blockInviteLinks: boolean;
  blockedWords: readonly string[];
  /** The stricter filters a community can opt into: shouting in capitals, emoji floods and walls of text. */
  strict?: boolean;
}

export interface Verdict {
  /** Short code for logs and strike counting. */
  kind: "mentions" | "invite" | "word" | "spam" | "duplicate" | "zalgo" | "caps" | "emoji" | "wall";
  /** Friendly sentence shown to the member. */
  reason: string;
}

/** What the caller remembers about a member's recent messages. */
export interface History {
  /** Epoch ms of recent messages, oldest first. */
  times: number[];
  /** Normalized text of recent messages, aligned with `times`. */
  texts: string[];
}

export function emptyHistory(): History {
  return { times: [], texts: [] };
}

const INVITE = /\b(?:discord(?:app)?\.com\/invite|discord\.gg|discord\.me|dsc\.gg|t\.me\/joinchat|chat\.whatsapp\.com)\/\S+/i;

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word match; a trailing "*" in the list matches any ending ("spam*"). */
export function findBlockedWord(text: string, words: readonly string[]): string | undefined {
  const normalized = normalizeForMatch(text);
  for (const raw of words) {
    const word = normalizeForMatch(raw);
    if (!word) continue;
    const wildcard = word.endsWith("*");
    const body = escapeRegex(wildcard ? word.slice(0, -1) : word);
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${body}${wildcard ? "" : "(?=$|[^\\p{L}\\p{N}])"}`, "u");
    if (pattern.test(normalized)) return raw;
  }
  return undefined;
}

/** Checks the message on its own (no history needed). */
export function checkContent(text: string, rules: AutomodRules): Verdict | undefined {
  const mentions = mentionedUserIds(text).length + mentionedRoleIds(text).length;
  if (mentions > rules.maxMentions) {
    return { kind: "mentions", reason: `too many mentions (${mentions}) in one message` };
  }
  if (rules.blockInviteLinks && INVITE.test(text)) {
    return { kind: "invite", reason: "invite links to other communities aren't allowed here" };
  }
  if (findBlockedWord(text, rules.blockedWords) !== undefined) {
    return { kind: "word", reason: "that message contains a blocked word" };
  }
  if (isZalgo(text)) {
    return { kind: "zalgo", reason: "glitchy stacked-up letters make chat hard to read" };
  }
  if (rules.strict) {
    const plain = stripLinksAndMentions(text);
    if (isShouting(plain)) return { kind: "caps", reason: "that was a lot of capital letters" };
    if (emojiCount(text) > 14) return { kind: "emoji", reason: "that was a lot of emoji at once" };
    if (isWall(text)) return { kind: "wall", reason: "that message was a huge wall of text" };
  }
  return undefined;
}

/** Text without links and mentions (their addresses and IDs aren't what anyone typed). */
function stripLinksAndMentions(text: string): string {
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, " ");
}

/** Letters piled with combining marks ("Z̴̡̛͓a̵̛l̷g̸o̴"): several marks on one letter, or marks outnumbering the letters. */
export function isZalgo(text: string): boolean {
  const marks = text.match(/\p{M}/gu)?.length ?? 0;
  if (marks < 8) return false;
  if (/\p{L}\p{M}{4,}/u.test(text)) return true;
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  return marks > letters;
}

/** A message that's mostly capitals, long enough to be shouting rather than "OK" or "LOL". */
export function isShouting(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 16) return false;
  const upper = letters.filter((ch) => ch !== ch.toLowerCase() && ch === ch.toUpperCase()).length;
  return upper / letters.length >= 0.8;
}

/** Emoji in a message: pictographs plus :custom: emoji codes. */
export function emojiCount(text: string): number {
  const pictographs = text.match(/\p{Extended_Pictographic}/gu)?.length ?? 0;
  const codes = text.match(/:[a-z0-9_+-]{2,32}:/gi)?.length ?? 0;
  return pictographs + codes;
}

/** A wall: dozens of lines, or thousands of characters. */
export function isWall(text: string): boolean {
  return text.split("\n").length > 30 || text.length > 2500;
}

/**
 * Records the message in `history` (mutated, trimmed to the longest window)
 * and reports flooding or repeated messages.
 */
export function checkRate(history: History, text: string, now: number, rules: AutomodRules): Verdict | undefined {
  const keepMs = Math.max(rules.spam.seconds, rules.duplicates.seconds) * 1000;
  while (history.times.length > 0 && now - history.times[0] > keepMs) {
    history.times.shift();
    history.texts.shift();
  }
  const normalized = normalizeForMatch(text);
  history.times.push(now);
  history.texts.push(normalized);

  const spamWindow = rules.spam.seconds * 1000;
  const recent = history.times.filter((t) => now - t <= spamWindow).length;
  if (recent > rules.spam.messages) {
    return { kind: "spam", reason: "you're sending messages very quickly" };
  }

  if (normalized.length > 0) {
    const dupWindow = rules.duplicates.seconds * 1000;
    let same = 0;
    for (let i = 0; i < history.times.length; i++) {
      if (now - history.times[i] <= dupWindow && history.texts[i] === normalized) same++;
    }
    if (same >= rules.duplicates.count) {
      return { kind: "duplicate", reason: "you've posted the same message several times" };
    }
  }
  return undefined;
}

/** Strike timestamps within the window, after adding `now`. */
export function addStrike(strikes: number[], now: number, windowMs: number): number[] {
  return [...strikes.filter((t) => now - t <= windowMs), now];
}
