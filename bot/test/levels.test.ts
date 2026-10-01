import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_XP, applyMessage, levelFromXp, rankEntries, rewardsForLevel, totalXpForLevel, xpToNext } from "../src/logic/levels";

test("the XP curve matches the classic level-bot formula", () => {
  assert.equal(xpToNext(0), 100);
  assert.equal(xpToNext(1), 155);
  assert.equal(xpToNext(10), 1100);
  assert.equal(totalXpForLevel(0), 0);
  assert.equal(totalXpForLevel(1), 100);
  assert.equal(totalXpForLevel(2), 255);
});

test("levelFromXp lands exactly on level boundaries", () => {
  assert.deepEqual(levelFromXp(0), { level: 0, into: 0, needed: 100, fraction: 0 });
  assert.equal(levelFromXp(99).level, 0);
  assert.equal(levelFromXp(100).level, 1);
  assert.equal(levelFromXp(totalXpForLevel(30)).level, 30);
  assert.equal(levelFromXp(totalXpForLevel(30) - 1).level, 29);
  const mid = levelFromXp(100 + 155 / 2);
  assert.equal(mid.level, 1);
  assert.ok(Math.abs(mid.fraction - 0.5) < 0.01);
  assert.equal(levelFromXp(-50).level, 0);
});

test("applyMessage grants XP once per cooldown but always counts messages", () => {
  const rules = { minXp: 15, maxXp: 25, cooldownMs: 60_000 };
  const first = applyMessage(EMPTY_XP, 1_000_000, rules, () => 0);
  assert.deepEqual(first, { xp: 15, lastAt: 1_000_000, messages: 1 });
  const spam = applyMessage(first, 1_030_000, rules, () => 0.99);
  assert.deepEqual(spam, { xp: 15, lastAt: 1_000_000, messages: 2 });
  const later = applyMessage(spam, 1_060_000, rules, () => 0.99);
  assert.deepEqual(later, { xp: 40, lastAt: 1_060_000, messages: 3 });
});

test("rewardsForLevel stacks or keeps only the highest", () => {
  const rewards = [
    { level: 15, role: "veteran" },
    { level: 5, role: "regular" },
    { level: 30, role: "legend" },
  ];
  assert.deepEqual(rewardsForLevel(4, rewards, false), []);
  assert.deepEqual(rewardsForLevel(5, rewards, false), [{ level: 5, role: "regular" }]);
  assert.deepEqual(rewardsForLevel(20, rewards, false), [{ level: 15, role: "veteran" }]);
  assert.deepEqual(
    rewardsForLevel(20, rewards, true).map((r) => r.role),
    ["regular", "veteran"],
  );
});

test("rankEntries sorts by XP with a stable tie-break", () => {
  const ranked = rankEntries([
    { userId: "b", xp: 10 },
    { userId: "a", xp: 10 },
    { userId: "c", xp: 50 },
  ]);
  assert.deepEqual(
    ranked.map((r) => r.userId),
    ["c", "a", "b"],
  );
});
