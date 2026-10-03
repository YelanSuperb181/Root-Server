// Pulse arithmetic: day keys, and the summary the team sees (how this week
// compares with last week, the busiest channels and hours, a health score).
// Pure, so it's unit tested without Root.

export interface DayCounts {
  date: string;
  messages: number;
  people: readonly string[];
  channels: Record<string, number>;
  hours: readonly number[];
  joins: number;
  leaves: number;
  mod: Record<string, number>;
  caught: Record<string, number>;
}

/** "2026-10-03": the UTC day of a time. */
export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export interface PulseSummary {
  /** Per day, oldest first: messages, active people, joins, leaves, team actions, catches. */
  series: Array<{ date: string; messages: number; people: number; joins: number; leaves: number; mod: number; caught: number }>;
  /** Totals for the latest 7 days, and the change from the 7 before (as a fraction; undefined without earlier data). */
  week: { messages: number; people: number; joins: number; leaves: number; mod: number; caught: number };
  change: { messages?: number; people?: number };
  topChannels: Array<{ channelId: string; messages: number }>;
  /** Messages per UTC hour over the period. */
  hours: number[];
  modKinds: Record<string, number>;
  caughtKinds: Record<string, number>;
  /** 0-100: activity trend, how many stay versus leave, and how calm it is. */
  health: number;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const total = (r: Record<string, number>) => sum(Object.values(r));

function merge(into: Record<string, number>, from: Record<string, number>): void {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
}

/** Sums up days of counts (oldest first; 14 or more gives week-on-week changes). */
export function summarize(days: readonly DayCounts[]): PulseSummary {
  const series = days.map((d) => ({ date: d.date, messages: d.messages, people: d.people.length, joins: d.joins, leaves: d.leaves, mod: total(d.mod), caught: total(d.caught) }));
  const last = days.slice(-7);
  const before = days.slice(-14, -7);
  const peopleIn = (ds: readonly DayCounts[]) => new Set(ds.flatMap((d) => d.people)).size;
  const week = {
    messages: sum(last.map((d) => d.messages)),
    people: peopleIn(last),
    joins: sum(last.map((d) => d.joins)),
    leaves: sum(last.map((d) => d.leaves)),
    mod: sum(last.map((d) => total(d.mod))),
    caught: sum(last.map((d) => total(d.caught))),
  };
  const prevMessages = sum(before.map((d) => d.messages));
  const prevPeople = peopleIn(before);
  const change = {
    messages: before.length === 7 && prevMessages > 0 ? (week.messages - prevMessages) / prevMessages : undefined,
    people: before.length === 7 && prevPeople > 0 ? (week.people - prevPeople) / prevPeople : undefined,
  };
  const channels: Record<string, number> = {};
  const modKinds: Record<string, number> = {};
  const caughtKinds: Record<string, number> = {};
  const hours = Array(24).fill(0) as number[];
  for (const d of days) {
    merge(channels, d.channels);
    merge(modKinds, d.mod);
    merge(caughtKinds, d.caught);
    d.hours.forEach((n, h) => (hours[h] += n));
  }
  const topChannels = Object.entries(channels)
    .map(([channelId, messages]) => ({ channelId, messages }))
    .sort((a, b) => b.messages - a.messages)
    .slice(0, 6);
  return { series, week, change, topChannels, hours, modKinds, caughtKinds, health: healthScore(week, change.messages) };
}

/**
 * A rough 0-100 for how the community's doing: growing activity, more
 * joining than leaving, and little that needed the team or the shields.
 */
export function healthScore(week: PulseSummary["week"], messageChange: number | undefined): number {
  if (week.messages === 0 && week.joins === 0) return 50;
  const trend = messageChange === undefined ? 0.5 : Math.min(1, Math.max(0, 0.5 + messageChange));
  const stay = week.joins + week.leaves === 0 ? 0.6 : week.joins / (week.joins + week.leaves);
  const trouble = (week.mod + week.caught) / Math.max(1, week.messages);
  const calm = Math.max(0, 1 - trouble * 20);
  return Math.round(100 * (0.4 * trend + 0.3 * stay + 0.3 * calm));
}
