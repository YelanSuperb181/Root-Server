// Guardian bookkeeping: spotting raids from how fast people join, slowmode
// timing, and the warning ladder (how a member's standing warnings turn into
// a mute, a kick or a ban). Pure, so it's unit tested without Root.

/** Joins within this window count toward a raid. */
export const RAID_WINDOW_MS = 60_000;
/** Raid mode lasts this long after the last burst of joins. */
export const RAID_HOLD_MS = 15 * 60_000;

/** Join times kept for spotting raids (mutated, trimmed to the window). Returns how many joined within the window, this one included. */
export function recordJoin(times: number[], now: number, windowMs = RAID_WINDOW_MS): number {
  while (times.length > 0 && now - times[0] > windowMs) times.shift();
  times.push(now);
  return times.length;
}

export interface RaidState {
  /** Raid mode is on until then (0: off). */
  until: number;
  /** Who joined while it was on (they're held to newcomer rules for longer). */
  joined: string[];
  /** Turned on by hand (a mod's !raid on), so it waits for !raid off. */
  manual?: boolean;
  startedAt?: number;
}

export function raidActive(state: RaidState, now: number): boolean {
  return state.manual === true || state.until > now;
}

/**
 * A join happened: returns the new state, and whether raid mode just
 * started (so the team gets told once, not per join).
 */
export function onJoin(state: RaidState, userId: string, joinsInWindow: number, threshold: number, now: number): { state: RaidState; started: boolean } {
  const wasActive = raidActive(state, now);
  if (joinsInWindow >= threshold || wasActive) {
    const until = joinsInWindow >= threshold ? Math.max(state.until, now + RAID_HOLD_MS) : state.until;
    const joined = [...state.joined.slice(-499), userId];
    return { state: { ...state, until, joined, startedAt: wasActive ? state.startedAt : now }, started: !wasActive };
  }
  return { state, started: false };
}

/** Slowmode: may someone post again? `last` is when they last posted there. */
export function slowmodeWait(last: number | undefined, intervalMs: number, now: number): number {
  if (last === undefined) return 0;
  return Math.max(0, last + intervalMs - now);
}

export interface Ladder {
  /** Standing warnings that bring an automatic mute (0: never). */
  muteAt: number;
  kickAt: number;
  banAt: number;
}

export type LadderStep = { action: "mute"; ms: number } | { action: "kick" } | { action: "ban" };

/** Mute lengths as warnings keep coming past the mute step: 1 hour, then 6, a day, 3 days, a week. */
const MUTE_STEPS_MS = [3_600_000, 6 * 3_600_000, 86_400_000, 3 * 86_400_000, 7 * 86_400_000];

/** What a member's new warning count brings, if anything. The harshest step reached wins. */
export function ladderStep(warnings: number, ladder: Ladder): LadderStep | undefined {
  if (ladder.banAt > 0 && warnings >= ladder.banAt) return { action: "ban" };
  if (ladder.kickAt > 0 && warnings >= ladder.kickAt && (ladder.banAt <= 0 || warnings < ladder.banAt)) {
    // A kick happens once, at its step; after that, more warnings mute until the ban step.
    if (warnings === ladder.kickAt) return { action: "kick" };
  }
  if (ladder.muteAt > 0 && warnings >= ladder.muteAt) {
    const step = Math.min(MUTE_STEPS_MS.length - 1, warnings - ladder.muteAt);
    return { action: "mute", ms: MUTE_STEPS_MS[step] };
  }
  return undefined;
}

/** "3 warnings → 1h mute · 5 → kick · 7 → ban", or "off". */
export function describeLadder(ladder: Ladder): string {
  const parts: string[] = [];
  if (ladder.muteAt > 0) parts.push(`${ladder.muteAt} warnings → mute (1h, growing)`);
  if (ladder.kickAt > 0) parts.push(`${ladder.kickAt} → kick`);
  if (ladder.banAt > 0) parts.push(`${ladder.banAt} → ban`);
  return parts.length ? parts.join(" · ") : "off";
}

/** A lockdown or slowmode length typed by a mod, kept sane (1 minute to 7 days). */
export function clampHold(ms: number | undefined): number | undefined {
  if (ms === undefined) return undefined;
  return Math.min(7 * 86_400_000, Math.max(60_000, ms));
}
