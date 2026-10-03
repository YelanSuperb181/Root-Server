// Pulse: the community's vital signs, day by day. Messages and how many
// people sent them, the busiest channels and hours, joins and leaves, what
// the team did and what the shields caught. Counted as it happens, kept for
// 60 days, shown to the team in Blitz's menu and read by Ask Blitz. Only
// counts: never what anyone said.

import { rootServer, ChannelMessageCreatedEvent, CommunityEvent } from "@rootsdk/server-app";
import { errMessage, log } from "../core/log";
import { settings } from "../core/settings";
import { kv } from "../core/store";
import { dayKey } from "../logic/pulse";

export interface PulseDay {
  /** "2026-10-03" (UTC). */
  date: string;
  messages: number;
  /** Who posted (capped, for counting active people). */
  people: string[];
  /** Messages per channel (private channels left out). */
  channels: Record<string, number>;
  /** Messages per UTC hour. */
  hours: number[];
  joins: number;
  leaves: number;
  /** Team actions by kind (warn, mute, kick, ban…). */
  mod: Record<string, number>;
  /** What the shields and auto-mod caught, by kind. */
  caught: Record<string, number>;
}

const KEEP_DAYS = 60;
const MAX_PEOPLE = 3000;
const key = (date: string) => `pulse:${date}`;

let today: PulseDay | undefined;
let peopleSet = new Set<string>();
let dirty = false;

function blank(date: string): PulseDay {
  return { date, messages: 0, people: [], channels: {}, hours: Array(24).fill(0), joins: 0, leaves: 0, mod: {}, caught: {} };
}

async function current(): Promise<PulseDay> {
  const date = dayKey(Date.now());
  if (today?.date === date) return today;
  if (today && dirty) await flush();
  today = (await kv.get<PulseDay>(key(date))) ?? blank(date);
  peopleSet = new Set(today.people);
  return today;
}

async function flush(): Promise<void> {
  if (!today || !dirty) return;
  dirty = false;
  today.people = [...peopleSet].slice(0, MAX_PEOPLE);
  await kv.set(key(today.date), today);
}

export async function initPulse(): Promise<void> {
  await current();
  setInterval(() => void flush().catch((err) => log("warn", "couldn't save today's pulse", { error: errMessage(err) })), 60_000).unref();
  const communities = rootServer.community.communities;
  communities.on(CommunityEvent.CommunityJoined, () => void bump((d) => d.joins++));
  communities.on(CommunityEvent.CommunityLeave, () => void bump((d) => d.leaves++));
  // Old days fade out.
  setInterval(() => void prune(), 6 * 3_600_000).unref();
}

async function prune(): Promise<void> {
  try {
    const cutoff = dayKey(Date.now() - KEEP_DAYS * 86_400_000);
    for (const { key: k } of await kv.entries<PulseDay>("pulse:")) if (k.slice(6) < cutoff) await kv.delete(k);
  } catch (err) {
    log("warn", "couldn't tidy old pulse days", { error: errMessage(err) });
  }
}

async function bump(change: (d: PulseDay) => void): Promise<void> {
  try {
    change(await current());
    dirty = true;
  } catch {
    // Counting is never worth failing over.
  }
}

/** Every message from a person (called once per message). */
export function countMessage(evt: ChannelMessageCreatedEvent): void {
  void bump((d) => {
    d.messages++;
    if (peopleSet.size < MAX_PEOPLE) peopleSet.add(evt.userId);
    d.hours[new Date().getUTCHours()]++;
    if (!settings.isPrivate(evt.channelId) && !settings.isLog(evt.channelId)) d.channels[evt.channelId] = (d.channels[evt.channelId] ?? 0) + 1;
  });
}

export function countMod(kind: string): void {
  void bump((d) => (d.mod[kind] = (d.mod[kind] ?? 0) + 1));
}

export function countCatch(kind: string): void {
  void bump((d) => (d.caught[kind] = (d.caught[kind] ?? 0) + 1));
}

/** The last `count` days, oldest first, today included (live). Days with nothing recorded come back empty. */
export async function pulseDays(count: number): Promise<PulseDay[]> {
  const now = Date.now();
  const live = await current();
  const days: PulseDay[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = dayKey(now - i * 86_400_000);
    if (date === live.date) days.push({ ...live, people: [...peopleSet] });
    else days.push((await kv.get<PulseDay>(key(date))) ?? blank(date));
  }
  return days;
}
