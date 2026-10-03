// Stardust arithmetic: what chatting, daily visits and level-ups pay, and how
// streaks work. Pure, so it's unit tested without Root.

import { dayKey } from "./pulse";

/** Chatting pays a little, at most once a minute (like XP), so spam doesn't. */
export const CHAT_COOLDOWN_MS = 60_000;
export const CHAT_MIN = 2;
export const CHAT_MAX = 4;

export function chatEarning(random: () => number = Math.random): number {
  return CHAT_MIN + Math.floor(random() * (CHAT_MAX - CHAT_MIN + 1));
}

export interface DailyResult {
  ok: boolean;
  amount: number;
  streak: number;
  /** A full week in a row earns a bonus on top. */
  weekBonus: boolean;
}

/**
 * Claiming the daily gift: 50 Stardust, 10 more for each day in a row (up to
 * 150), and 100 extra every 7th day. Missing a day starts the streak over.
 */
export function claimDaily(lastDaily: string | undefined, streak: number, now: number): DailyResult {
  const today = dayKey(now);
  if (lastDaily === today) return { ok: false, amount: 0, streak, weekBonus: false };
  const yesterday = dayKey(now - 86_400_000);
  const next = lastDaily === yesterday ? streak + 1 : 1;
  const weekBonus = next % 7 === 0;
  const amount = 50 + 10 * Math.min(next - 1, 10) + (weekBonus ? 100 : 0);
  return { ok: true, amount, streak: next, weekBonus };
}

/** When the next daily gift is ready (the start of the next UTC day). */
export function nextDailyAt(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** A level-up pays 20 Stardust per level reached, up to 500. */
export function levelUpReward(level: number): number {
  return Math.min(500, Math.max(0, level * 20));
}
