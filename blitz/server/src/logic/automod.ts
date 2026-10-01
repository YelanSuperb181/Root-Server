// Auto-moderation checks. Pure: the caller keeps the per-member history and
// decides what to do with a verdict.

import { mentionedRoleIds, mentionedUserIds } from "./text";

export interface AutomodRules {
  maxMentions: number;
  spam: { messages: number; seconds: number };
  duplicates: { count: number; seconds: number };
  blockInviteLinks: boolean;
  blockedWords: readonly string[];
}

export interface Verdict {
  /** Short code for logs and strike counting. */
  kind: "mentions" | "invite" | "word" | "spam" | "duplicate";
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
  return undefined;
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
