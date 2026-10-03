// Giveaway bookkeeping: reading "!giveaway 1d 2 winners Nitro", spotting a
// Stardust prize, and drawing winners fairly. Pure, so it's unit tested.

import { parseLeadingDuration } from "./moderation";

const MIN_MS = 60_000;
const MAX_MS = 30 * 86_400_000;

/** "1d 2 winners Nitro" → 1 day, 2 winners, "Nitro". Undefined if it doesn't make sense. */
export function parseGiveaway(text: string): { ms: number; winners: number; prize: string } | undefined {
  const timed = parseLeadingDuration(text);
  if (!timed || timed.ms < MIN_MS || timed.ms > MAX_MS) return undefined;
  let rest = timed.rest;
  let winners = 1;
  const w = /^(\d{1,2})\s*(?:winners?|w)\b\s*/i.exec(rest);
  if (w) {
    winners = Number(w[1]);
    rest = rest.slice(w[0].length);
  }
  const prize = rest.trim();
  if (!prize || winners < 1 || winners > 20) return undefined;
  return { ms: timed.ms, winners, prize };
}

/** "500 stardust" (anywhere in the prize) → 500. */
export function stardustPrize(prize: string): number | undefined {
  const m = /(\d[\d,]{0,7})\s*(?:✨\s*)?stardust\b/i.exec(prize);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ""));
  return n > 0 && n <= 100_000 ? n : undefined;
}

/** Up to `count` different winners, picked at random. */
export function drawWinners(entrants: readonly string[], count: number, random: () => number = Math.random): string[] {
  const pool = [...new Set(entrants)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, count));
}
