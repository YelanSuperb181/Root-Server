import { test } from "node:test";
import assert from "node:assert/strict";
import { PollRecord, pollEmojis, pollLabels, renderPoll, resultLine, tally, winners } from "../src/logic/polls";
import { birthdaysOn, celebratesOn, daysUntil, nextDailyRun, upcomingBirthdays, utcDateKey } from "../src/logic/dates";

const poll: PollRecord = {
  id: 7,
  channelId: "C",
  messageId: "M",
  authorId: "U",
  question: "Snack?",
  options: ["Chips", "Fruit", "Cake"],
  createdAt: 0,
  closesAt: 3_600_000,
  closed: false,
};

test("yes/no polls use check and cross", () => {
  assert.deepEqual(pollLabels([]), ["Yes", "No"]);
  assert.deepEqual(
    pollEmojis([]).map((e) => e.code),
    ["white_check_mark", "x"],
  );
  assert.deepEqual(
    pollEmojis(["a", "b", "c"]).map((e) => e.code),
    ["one", "two", "three"],
  );
});

test("tally counts each member once per option and ignores bots", () => {
  const reactions = [
    { shortcode: ":one:", userId: "a" },
    { shortcode: ":one:", userId: "a" },
    { shortcode: ":one:", userId: "b" },
    { shortcode: ":two:", userId: "a" },
    { shortcode: ":three:", userId: "bot" },
    { shortcode: ":star:", userId: "c" },
  ];
  assert.deepEqual(tally(reactions, pollEmojis(poll.options), (u) => u === "bot"), [2, 1, 0]);
});

test("winners handles ties and empty polls", () => {
  assert.deepEqual(winners([2, 1, 0]), [0]);
  assert.deepEqual(winners([2, 2, 0]), [0, 1]);
  assert.deepEqual(winners([0, 0]), []);
});

test("renderPoll shows options while open and bars when closed", () => {
  const open = renderPoll(poll, "@U", 0);
  assert.ok(open.includes("**Poll #7**"));
  assert.ok(open.includes("3️⃣  Cake"));
  assert.ok(open.includes("closes in **1h**"));
  const closed = renderPoll(poll, "@U", 0, [3, 1, 0]);
  assert.ok(closed.includes("Chips 👑"));
  assert.ok(closed.includes("75% · 3 votes"));
  assert.ok(closed.includes("4 votes in total"));
});

test("resultLine announces a winner, a tie, or silence", () => {
  assert.ok(resultLine(poll, [0, 5, 1]).includes("**Fruit**"));
  assert.ok(resultLine(poll, [2, 2, 0]).includes("tie"));
  assert.ok(resultLine(poll, [0, 0, 0]).includes("no votes"));
});

test("utcDateKey and nextDailyRun work in UTC", () => {
  const t = Date.UTC(2026, 9, 1, 15, 30);
  assert.equal(utcDateKey(t), "2026-10-01");
  assert.equal(nextDailyRun(t, 16).toISOString(), "2026-10-01T16:00:00.000Z");
  assert.equal(nextDailyRun(t, 9).toISOString(), "2026-10-02T09:00:00.000Z");
  assert.equal(nextDailyRun(Date.UTC(2026, 9, 1, 16), 16).toISOString(), "2026-10-02T16:00:00.000Z", "strictly after now");
});

test("Feb 29 birthdays move to Feb 28 outside leap years", () => {
  assert.deepEqual(celebratesOn({ month: 2, day: 29 }, 2027), { month: 2, day: 28 });
  assert.deepEqual(celebratesOn({ month: 2, day: 29 }, 2028), { month: 2, day: 29 });
  const entries = [
    { userId: "leap", birthday: { month: 2, day: 29 } },
    { userId: "other", birthday: { month: 3, day: 1 } },
  ];
  assert.deepEqual(
    birthdaysOn(entries, Date.UTC(2027, 1, 28)).map((e) => e.userId),
    ["leap"],
  );
  assert.deepEqual(
    birthdaysOn(entries, Date.UTC(2028, 1, 28)).map((e) => e.userId),
    [],
  );
});

test("daysUntil wraps into next year and upcoming sorts by it", () => {
  const nov1 = Date.UTC(2026, 10, 1, 20);
  assert.equal(daysUntil({ month: 11, day: 1 }, nov1), 0);
  assert.equal(daysUntil({ month: 11, day: 3 }, nov1), 2);
  assert.equal(daysUntil({ month: 1, day: 1 }, nov1), 61);
  const list = upcomingBirthdays(
    [
      { userId: "jan", birthday: { month: 1, day: 1 } },
      { userId: "today", birthday: { month: 11, day: 1 } },
      { userId: "soon", birthday: { month: 11, day: 5 } },
    ],
    nov1,
    2,
  );
  assert.deepEqual(
    list.map((e) => [e.userId, e.inDays]),
    [
      ["today", 0],
      ["soon", 4],
    ],
  );
});
