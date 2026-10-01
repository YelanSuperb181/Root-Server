import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatDuration,
  formatMonthDay,
  parseChoices,
  parseCommand,
  parseDice,
  parseDuration,
  parseMonthDay,
  parsePoll,
} from "../src/logic/parse";

test("parseCommand splits name, args and rest", () => {
  assert.deepEqual(parseCommand("!Poll  Best snack? | chips", "!"), {
    name: "poll",
    args: ["Best", "snack?", "|", "chips"],
    rest: "Best snack? | chips",
  });
  assert.deepEqual(parseCommand("  !help", "!"), { name: "help", args: [], rest: "" });
  assert.equal(parseCommand("hello !help", "!"), undefined);
  assert.equal(parseCommand("!", "!"), undefined);
  assert.equal(parseCommand("! help", "!"), undefined);
  assert.equal(parseCommand("!!!", "!"), undefined);
  assert.equal(parseCommand("!say hi\nthere", "!")?.rest, "hi\nthere");
});

test("parseDuration understands compound durations", () => {
  assert.equal(parseDuration("90m"), 90 * 60_000);
  assert.equal(parseDuration("1d12h"), 36 * 3_600_000);
  assert.equal(parseDuration("2W"), 14 * 86_400_000);
  assert.equal(parseDuration("soon"), undefined);
  assert.equal(parseDuration("0m"), undefined);
  assert.equal(parseDuration("5"), undefined);
});

test("formatDuration shows the two largest units", () => {
  assert.equal(formatDuration(5_400_000), "1h 30m");
  assert.equal(formatDuration(90_061_000), "1d 1h");
  assert.equal(formatDuration(0), "0s");
  assert.equal(formatDuration(-5), "0s");
});

test("parseDice handles common notations and rejects nonsense", () => {
  assert.deepEqual(parseDice(""), { count: 1, sides: 6, modifier: 0 });
  assert.deepEqual(parseDice("d20"), { count: 1, sides: 20, modifier: 0 });
  assert.deepEqual(parseDice("3d8+2"), { count: 3, sides: 8, modifier: 2 });
  assert.deepEqual(parseDice("D100-5"), { count: 1, sides: 100, modifier: -5 });
  assert.deepEqual(parseDice("100"), { count: 1, sides: 100, modifier: 0 });
  assert.equal(parseDice("0d6"), undefined);
  assert.equal(parseDice("50d6"), undefined);
  assert.equal(parseDice("d1"), undefined);
  assert.equal(parseDice("1"), undefined);
  assert.equal(parseDice("banana"), undefined);
});

test("parseChoices accepts pipes, commas or 'or'", () => {
  assert.deepEqual(parseChoices("pizza | tacos |  sushi"), ["pizza", "tacos", "sushi"]);
  assert.deepEqual(parseChoices("pizza, tacos"), ["pizza", "tacos"]);
  assert.deepEqual(parseChoices("pizza or tacos OR sushi"), ["pizza", "tacos", "sushi"]);
  assert.deepEqual(parseChoices("just one"), ["just one"]);
});

test("parsePoll reads an optional duration, a question and options", () => {
  assert.deepEqual(parsePoll("1h Pizza or tacos? | Pizza | Tacos"), {
    durationMs: 3_600_000,
    question: "Pizza or tacos?",
    options: ["Pizza", "Tacos"],
  });
  assert.deepEqual(parsePoll("Is it Friday yet?"), { durationMs: undefined, question: "Is it Friday yet?", options: [] });
  assert.equal(typeof parsePoll(""), "string");
  assert.equal(typeof parsePoll("Q? | only one"), "string");
  assert.equal(typeof parsePoll(`Q? | ${Array.from({ length: 11 }, (_, i) => i).join(" | ")}`), "string");
  assert.equal(typeof parsePoll("30s Q? | a | b"), "string", "too short");
  assert.equal(typeof parsePoll("60d Q? | a | b"), "string", "too long");
});

test("parseMonthDay accepts month-day and month names, rejects ambiguity", () => {
  assert.deepEqual(parseMonthDay("07-14"), { month: 7, day: 14 });
  assert.deepEqual(parseMonthDay("7-4"), { month: 7, day: 4 });
  assert.deepEqual(parseMonthDay("July 14"), { month: 7, day: 14 });
  assert.deepEqual(parseMonthDay("jul 14th"), { month: 7, day: 14 });
  assert.deepEqual(parseMonthDay("Sept. 3"), { month: 9, day: 3 });
  assert.deepEqual(parseMonthDay("14 July"), { month: 7, day: 14 });
  assert.deepEqual(parseMonthDay("1st of March"), { month: 3, day: 1 });
  assert.deepEqual(parseMonthDay("Feb 29"), { month: 2, day: 29 });
  assert.equal(parseMonthDay("Feb 30"), undefined);
  assert.equal(parseMonthDay("13-01"), undefined);
  assert.equal(parseMonthDay("03/04"), undefined);
  assert.equal(parseMonthDay("Ju 4"), undefined, "two letters is too ambiguous");
  assert.equal(parseMonthDay("tomorrow"), undefined);
});

test("formatMonthDay", () => {
  assert.equal(formatMonthDay({ month: 12, day: 25 }), "December 25");
});
