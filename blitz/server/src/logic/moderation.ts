// Moderation bookkeeping: who a command is aimed at, how long, why, and how
// a member's history reads. Pure, so it's unit tested without Root.

import { formatDuration } from "./parse";
import { defuseMentions, truncate } from "./text";

export type CaseKind = "warn" | "mute" | "unmute" | "kick" | "ban" | "unban" | "note";

/** One entry in a member's moderation history. */
export interface ModCase {
  id: number;
  kind: CaseKind;
  userId: string;
  /** The staff member who did it. */
  modId: string;
  reason?: string;
  at: number;
  /** Mutes and temporary bans. */
  durationMs?: number;
  /** A warning taken back with !unwarn. */
  revoked?: boolean;
}

export const CASE_LABEL: Record<CaseKind, string> = {
  warn: "⚠️ Warning",
  mute: "🔇 Mute",
  unmute: "🔊 Unmute",
  kick: "👢 Kick",
  ban: "🔨 Ban",
  unban: "🕊️ Unban",
  note: "📝 Note",
};

/** Staff ranks, lowest first; mirrors AccessLevel in core/members. */
export type Rank = "everyone" | "mod" | "admin";
const RANKS: Rank[] = ["everyone", "mod", "admin"];

/** Staff can only act on members ranked below them (so mods can't kick each other). */
export function outranks(actor: Rank, target: Rank): boolean {
  return RANKS.indexOf(actor) > RANKS.indexOf(target);
}

const MENTION = /^\s*\[@[^\]]*\]\(root:\/\/user\/([^)\s]+)\)\s*/;
/** Root IDs: 22 base64url characters, or a UUID. */
const RAW_ID = /^\s*([A-Za-z0-9_-]{22}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=\s|$)\s*/i;

/** "@someone the reason" or "<user ID> the reason" -> the user and what's left. */
export function parseTarget(rest: string): { userId: string; rest: string } | undefined {
  const m = MENTION.exec(rest) ?? RAW_ID.exec(rest);
  return m ? { userId: m[1], rest: rest.slice(m[0].length).trim() } : undefined;
}

const UNIT = "(weeks?|wks?|w|days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)";
const UNIT_MS: Record<string, number> = { w: 604_800_000, d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 };

function unitMs(unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith("mi") || u === "m") return UNIT_MS.m;
  if (u.startsWith("wk")) return UNIT_MS.w;
  if (u.startsWith("hr")) return UNIT_MS.h;
  return UNIT_MS[u[0]];
}

/**
 * A time at the start of the text: "2h", "1d12h", "in 30 minutes",
 * "2 hours and 15 min". Returns it and the rest of the text.
 */
export function parseLeadingDuration(text: string): { ms: number; rest: string } | undefined {
  let left = text.trimStart().replace(/^in\s+/i, "");
  let total = 0;
  let found = false;
  const step = new RegExp(`^(\\d+)\\s*${UNIT}(?![a-z])\\s*(?:,\\s*|and\\s+)?`, "i");
  for (let m = step.exec(left); m; m = step.exec(left)) {
    total += Number(m[1]) * unitMs(m[2]);
    left = left.slice(m[0].length);
    found = true;
  }
  if (!found || total <= 0) return undefined;
  return { ms: total, rest: left.trim().replace(/^(?:to|that)\s+/i, "") };
}

export function timeAgo(ms: number): string {
  if (ms < 60_000) return "just now";
  return `${formatDuration(ms).split(" ")[0]} ago`;
}

/** "#12 ⚠️ Warning · 3d ago · by Alex: spamming". */
export function caseLine(c: ModCase, modName: string, now: number): string {
  const parts = [`**#${c.id}** ${CASE_LABEL[c.kind]}`];
  if (c.durationMs) parts.push(formatDuration(c.durationMs));
  parts.push(timeAgo(now - c.at), `by ${modName}`);
  const reason = c.reason ? `: ${truncate(defuseMentions(c.reason), 200)}` : "";
  const line = `${parts.join(" · ")}${reason}`;
  return c.revoked ? `~~${line}~~ _(taken back)_` : line;
}

/** Warnings still standing. */
export function activeWarnings(cases: readonly ModCase[]): number {
  return cases.filter((c) => c.kind === "warn" && !c.revoked).length;
}

/** "spam, scam*\nfree nitro" -> ["spam", "scam*", "free nitro"]. */
export function parseWordList(text: string | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  for (const raw of text.split(/[,\n;]/)) {
    const word = raw.trim();
    if (word) seen.add(word);
  }
  return [...seen];
}

export interface NamedRole {
  id: string;
  name: string;
}

/** Finds the role someone typed: exact name, else the only one starting with it, else the only one containing it. */
export function matchRole(query: string, roles: readonly NamedRole[]): NamedRole | NamedRole[] | undefined {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  if (!q) return undefined;
  const exact = roles.find((r) => r.name.toLowerCase() === q);
  if (exact) return exact;
  for (const test of [(n: string) => n.startsWith(q), (n: string) => n.includes(q)]) {
    const hits = roles.filter((r) => test(r.name.toLowerCase()));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return hits;
  }
  return undefined;
}

/** Custom command names: short, lowercase letters, digits and dashes. */
export function customNameProblem(name: string, taken: (name: string) => boolean): string | undefined {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(name)) return "Names are 1-32 lowercase letters, numbers or dashes, like `rules` or `how-to-join`.";
  if (taken(name)) return `\`${name}\` is already one of Blitz's own commands.`;
  return undefined;
}
