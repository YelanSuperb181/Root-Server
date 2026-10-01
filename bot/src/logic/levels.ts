// XP and level math. The curve is the familiar one from Discord level bots:
// reaching level n+1 from level n costs 5n² + 50n + 100 XP, so early levels
// come quickly and later ones take real activity.

export function xpToNext(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

/** Total XP needed to reach `level` from zero. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let n = 0; n < level; n++) total += xpToNext(n);
  return total;
}

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level takes in total. */
  needed: number;
  fraction: number;
}

export function levelFromXp(xp: number): LevelProgress {
  let level = 0;
  let left = Math.max(0, Math.floor(xp));
  while (left >= xpToNext(level)) {
    left -= xpToNext(level);
    level++;
  }
  const needed = xpToNext(level);
  return { level, into: left, needed, fraction: left / needed };
}

export interface XpRecord {
  xp: number;
  /** Epoch ms of the last message that earned XP. */
  lastAt: number;
  messages: number;
}

export const EMPTY_XP: XpRecord = { xp: 0, lastAt: 0, messages: 0 };

export interface XpRules {
  minXp: number;
  maxXp: number;
  cooldownMs: number;
}

/**
 * Applies one message to a record. XP is only granted once per cooldown, so
 * spamming doesn't level anyone up; the message count always goes up.
 */
export function applyMessage(record: XpRecord, now: number, rules: XpRules, random: () => number = Math.random): XpRecord {
  const messages = record.messages + 1;
  if (now - record.lastAt < rules.cooldownMs) return { ...record, messages };
  const gain = rules.minXp + Math.floor(random() * (rules.maxXp - rules.minXp + 1));
  return { xp: record.xp + gain, lastAt: now, messages };
}

export interface LevelReward {
  level: number;
  role: string;
}

/** The reward roles a member at `level` should hold: every reached reward, or only the highest. */
export function rewardsForLevel(level: number, rewards: readonly LevelReward[], stack: boolean): LevelReward[] {
  const reached = rewards.filter((r) => r.level <= level).sort((a, b) => a.level - b.level);
  if (stack) return reached;
  return reached.length > 0 ? [reached[reached.length - 1]] : [];
}

export interface Ranked {
  userId: string;
  xp: number;
}

/** Sorted by XP (desc), ties broken by user ID so the order is stable. */
export function rankEntries(entries: readonly Ranked[]): Ranked[] {
  return [...entries].sort((a, b) => b.xp - a.xp || a.userId.localeCompare(b.userId));
}
