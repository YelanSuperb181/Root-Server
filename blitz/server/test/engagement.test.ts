import { test } from "node:test";
import assert from "node:assert/strict";
import { chatEarning, claimDaily, levelUpReward, nextDailyAt } from "../src/logic/stardust";
import { drawWinners, parseGiveaway, stardustPrize } from "../src/logic/giveaways";
import { DayCounts, dayKey, healthScore, summarize } from "../src/logic/pulse";
import { COSMETICS, findCosmetic, hexToRgb } from "@blitz/shared";

const DAY = 86_400_000;
const NOON = Date.UTC(2026, 9, 3, 12);

test("the daily gift grows with a streak and resets after a missed day", () => {
  const first = claimDaily(undefined, 0, NOON);
  assert.deepEqual(first, { ok: true, amount: 50, streak: 1, weekBonus: false });
  assert.equal(claimDaily(dayKey(NOON), 1, NOON + 3_600_000).ok, false, "once a day");
  const second = claimDaily(dayKey(NOON), 1, NOON + DAY);
  assert.equal(second.streak, 2);
  assert.equal(second.amount, 60);
  const seventh = claimDaily(dayKey(NOON), 6, NOON + DAY);
  assert.equal(seventh.weekBonus, true);
  assert.equal(seventh.amount, 50 + 60 + 100);
  assert.equal(claimDaily(dayKey(NOON), 30, NOON + 3 * DAY).streak, 1, "missed days start over");
  assert.equal(claimDaily(dayKey(NOON), 21, NOON + DAY).amount, 150, "capped at 150 (day 22 isn't a 7th day)");
});

test("the next gift is ready at the next UTC midnight", () => {
  assert.equal(nextDailyAt(NOON), Date.UTC(2026, 9, 4));
});

test("chatting and levelling pay small, bounded amounts", () => {
  assert.equal(chatEarning(() => 0), 2);
  assert.equal(chatEarning(() => 0.999), 4);
  assert.equal(levelUpReward(3), 60);
  assert.equal(levelUpReward(99), 500);
});

test("the shop finds items by id or name, and every item is complete", () => {
  assert.equal(findCosmetic("crown")?.id, "crown");
  assert.equal(findCosmetic("Wizard")?.id, "wizard");
  assert.equal(findCosmetic("golden glow")?.id, "gold");
  assert.equal(findCosmetic("nope"), undefined);
  assert.equal(new Set(COSMETICS.map((c) => c.id)).size, COSMETICS.length, "ids are unique");
  for (const c of COSMETICS) {
    assert.ok(c.price > 0 && c.name && c.icon, c.id);
    if (c.slot === "glow") assert.ok(c.color, `${c.id} needs a color`);
  }
  assert.deepEqual(hexToRgb("#ff8fc7"), [255, 143, 199]);
});

test("giveaways: reading the command and the prize", () => {
  assert.deepEqual(parseGiveaway("1d 2 winners Nitro Classic"), { ms: DAY, winners: 2, prize: "Nitro Classic" });
  assert.deepEqual(parseGiveaway("2h a cool hoodie"), { ms: 2 * 3_600_000, winners: 1, prize: "a cool hoodie" });
  assert.equal(parseGiveaway("hoodie"), undefined, "needs a length");
  assert.equal(parseGiveaway("30s hoodie"), undefined, "at least a minute");
  assert.equal(parseGiveaway("1h 50 winners x"), undefined, "up to 20 winners");
  assert.equal(stardustPrize("500 stardust"), 500);
  assert.equal(stardustPrize("a hoodie + 1,000 ✨ Stardust"), 1000);
  assert.equal(stardustPrize("a hoodie"), undefined);
});

test("winners are different people, as many as asked (or as entered)", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const winners = drawWinners(["a", "b", "c", "d", "a"], 3, random);
  assert.equal(winners.length, 3);
  assert.equal(new Set(winners).size, 3);
  assert.deepEqual(drawWinners(["a"], 3).sort(), ["a"]);
  assert.deepEqual(drawWinners([], 2), []);
});

function day(date: string, messages: number, people: string[], extra: Partial<DayCounts> = {}): DayCounts {
  return { date, messages, people, channels: {}, hours: Array(24).fill(0), joins: 0, leaves: 0, mod: {}, caught: {}, ...extra };
}

test("pulse: weeks compare, channels and hours add up", () => {
  const days: DayCounts[] = [];
  for (let i = 0; i < 14; i++) {
    const hours = Array(24).fill(0);
    hours[20] = i < 7 ? 10 : 20;
    days.push(day(dayKey(NOON + i * DAY), i < 7 ? 10 : 20, i < 7 ? ["a", "b"] : ["a", "b", "c"], { channels: { general: i < 7 ? 10 : 15, art: i < 7 ? 0 : 5 }, hours, joins: 1 }));
  }
  const s = summarize(days);
  assert.equal(s.week.messages, 140);
  assert.equal(s.week.people, 3);
  assert.equal(s.change.messages, 1, "doubled");
  assert.equal(s.change.people, 0.5);
  assert.deepEqual(s.topChannels[0], { channelId: "general", messages: 175 });
  assert.equal(s.hours[20], 210);
  assert.equal(s.series.length, 14);
  assert.ok(s.health >= 70, `a growing, calm community scores well (${s.health})`);
});

test("pulse: health drops with trouble and people leaving", () => {
  const calm = healthScore({ messages: 500, people: 40, joins: 10, leaves: 2, mod: 1, caught: 2 }, 0.1);
  const rough = healthScore({ messages: 500, people: 40, joins: 2, leaves: 10, mod: 30, caught: 40 }, -0.4);
  assert.ok(calm > rough + 30, `${calm} vs ${rough}`);
  assert.equal(healthScore({ messages: 0, people: 0, joins: 0, leaves: 0, mod: 0, caught: 0 }, undefined), 50, "no data yet: neutral");
});
