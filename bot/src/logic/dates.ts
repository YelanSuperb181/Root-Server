// Calendar helpers for daily jobs and birthdays. Everything is UTC so the
// bot behaves the same wherever Root runs it.

import type { MonthDay } from "./parse";

/** "2026-10-01" for the UTC day containing `ms`. */
export function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The next time the clock reads hour:00 UTC, strictly after `now`. */
export function nextDailyRun(now: number, hourUtc: number): Date {
  const d = new Date(now);
  const run = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hourUtc, 0, 0, 0);
  return new Date(run > now ? run : run + 86_400_000);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Feb 29 birthdays are celebrated on Feb 28 in non-leap years. */
export function celebratesOn(birthday: MonthDay, year: number): MonthDay {
  if (birthday.month === 2 && birthday.day === 29 && !isLeapYear(year)) return { month: 2, day: 28 };
  return birthday;
}

export interface BirthdayEntry {
  userId: string;
  birthday: MonthDay;
}

export function birthdaysOn(entries: readonly BirthdayEntry[], ms: number): BirthdayEntry[] {
  const d = new Date(ms);
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return entries.filter((e) => {
    const on = celebratesOn(e.birthday, d.getUTCFullYear());
    return on.month === month && on.day === day;
  });
}

/** Whole days from the UTC day of `ms` until the next celebration (0 = today). */
export function daysUntil(birthday: MonthDay, ms: number): number {
  const d = new Date(ms);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  for (const year of [d.getUTCFullYear(), d.getUTCFullYear() + 1]) {
    const on = celebratesOn(birthday, year);
    const date = Date.UTC(year, on.month - 1, on.day);
    if (date >= today) return Math.round((date - today) / 86_400_000);
  }
  return 365;
}

export function upcomingBirthdays(entries: readonly BirthdayEntry[], ms: number, limit: number): Array<BirthdayEntry & { inDays: number }> {
  return entries
    .map((e) => ({ ...e, inDays: daysUntil(e.birthday, ms) }))
    .sort((a, b) => a.inDays - b.inDays || a.userId.localeCompare(b.userId))
    .slice(0, limit);
}
