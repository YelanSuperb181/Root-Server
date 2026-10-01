// What Wisp remembers: the last few messages in each channel (so it knows
// what people are talking about) and its own recent exchanges. Kept in
// memory only, never stored, and gone when Wisp restarts.

import type { ChatLine } from "@wisp/shared";
import { config } from "../config";
import { nickname } from "../core/members";

export interface Line {
  userId: string;
  text: string;
}

const lines = new Map<string, Line[]>();
const talks = new Map<string, Array<{ from: string; text: string; wisp: string }>>();
const names = new Map<string, { name: string; at: number }>();

const NAME_TTL_MS = 10 * 60_000;

async function nameOf(userId: string): Promise<string> {
  const known = names.get(userId);
  if (known && Date.now() - known.at < NAME_TTL_MS) return known.name;
  const name = await nickname(userId);
  names.set(userId, { name, at: Date.now() });
  return name;
}

export function rememberLine(place: string, userId: string, text: string): void {
  const keep = config.brain.contextMessages;
  if (keep <= 0 || !text.trim()) return;
  const list = lines.get(place) ?? [];
  list.push({ userId, text: text.slice(0, 500) });
  while (list.length > keep) list.shift();
  lines.set(place, list);
}

/** The channel's recent messages as they are now, oldest first. Cheap: names come later. */
export function snapshotLines(place: string): readonly Line[] {
  return [...(lines.get(place) ?? [])];
}

/** Puts names to a snapshot, only when Wisp actually needs it. */
export async function nameLines(list: readonly Line[]): Promise<ChatLine[]> {
  return Promise.all(list.map(async (l) => ({ from: await nameOf(l.userId), text: l.text })));
}

export function rememberTalk(place: string, from: string, text: string, wisp: string): void {
  const keep = config.brain.memory;
  if (keep <= 0) return;
  const list = talks.get(place) ?? [];
  list.push({ from, text: text.slice(0, 500), wisp: wisp.slice(0, 500) });
  while (list.length > keep) list.shift();
  talks.set(place, list);
}

export function recentTalk(place: string): Array<{ from: string; text: string; wisp: string }> {
  return [...(talks.get(place) ?? [])];
}
