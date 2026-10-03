import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ModCase,
  activeWarnings,
  caseLine,
  customNameProblem,
  matchRole,
  outranks,
  parseLeadingDuration,
  parseTarget,
  parseWordList,
} from "../src/logic/moderation";

const ID = "AbCdEfGhIjKlMnOpQrStUv";

test("a command's target is a mention or a user ID, with the rest left over", () => {
  assert.deepEqual(parseTarget(`[@Sam](root://user/${ID}) spamming links`), { userId: ID, rest: "spamming links" });
  assert.deepEqual(parseTarget(`${ID} old account`), { userId: ID, rest: "old account" });
  assert.deepEqual(parseTarget("123e4567-e89b-12d3-a456-426614174000"), { userId: "123e4567-e89b-12d3-a456-426614174000", rest: "" });
  assert.equal(parseTarget("just a reason"), undefined);
  assert.equal(parseTarget(`${ID}x`), undefined, "not quite an ID");
});

test("times at the start of a message, in short or long form", () => {
  assert.deepEqual(parseLeadingDuration("2h take a break"), { ms: 7_200_000, rest: "take a break" });
  assert.deepEqual(parseLeadingDuration("in 30 minutes check the oven"), { ms: 1_800_000, rest: "check the oven" });
  assert.deepEqual(parseLeadingDuration("1d12h renew it"), { ms: 129_600_000, rest: "renew it" });
  assert.deepEqual(parseLeadingDuration("2 hours and 15 min to call mom"), { ms: 8_100_000, rest: "call mom" });
  assert.deepEqual(parseLeadingDuration("1 week"), { ms: 604_800_000, rest: "" });
  assert.equal(parseLeadingDuration("5 dogs are cute"), undefined);
  assert.equal(parseLeadingDuration("spamming"), undefined);
  assert.equal(parseLeadingDuration("0m"), undefined);
});

test("staff only act on people ranked below them", () => {
  assert.ok(outranks("mod", "everyone"));
  assert.ok(outranks("admin", "mod"));
  assert.ok(!outranks("mod", "mod"));
  assert.ok(!outranks("mod", "admin"));
  assert.ok(!outranks("everyone", "everyone"));
});

test("history lines read well, and taken-back warnings don't count", () => {
  const now = Date.UTC(2026, 0, 10);
  const warn: ModCase = { id: 3, kind: "warn", userId: ID, modId: "m", reason: "spam [@x](root://user/y)", at: now - 3 * 86_400_000 };
  assert.equal(caseLine(warn, "Alex", now), "**#3** ⚠️ Warning · 3d ago · by Alex: spam @x");
  const mute: ModCase = { id: 4, kind: "mute", userId: ID, modId: "m", at: now, durationMs: 1_800_000 };
  assert.equal(caseLine(mute, "Alex", now), "**#4** 🔇 Mute · 30m · just now · by Alex");
  assert.match(caseLine({ ...warn, revoked: true }, "Alex", now), /^~~.*~~ _\(taken back\)_$/);
  assert.equal(activeWarnings([warn, { ...warn, id: 5, revoked: true }, mute]), 1);
});

test("blocked word lists split on commas and new lines", () => {
  assert.deepEqual(parseWordList("spam, scam*\nfree nitro;; spam"), ["spam", "scam*", "free nitro"]);
  assert.deepEqual(parseWordList(undefined), []);
});

test("roles match by name, start or part, and say when it's ambiguous", () => {
  const roles = [
    { id: "1", name: "Gamer" },
    { id: "2", name: "Artist" },
    { id: "3", name: "Art Club" },
    { id: "4", name: "she/her" },
  ];
  assert.equal((matchRole("gamer", roles) as { id: string }).id, "1");
  assert.equal((matchRole("@Gam", roles) as { id: string }).id, "1");
  assert.equal((matchRole("her", roles) as { id: string }).id, "4");
  assert.equal((matchRole("art", roles) as unknown[]).length, 2);
  assert.equal(matchRole("music", roles), undefined);
});

test("custom command names are checked", () => {
  const builtIn = (n: string) => n === "help";
  assert.equal(customNameProblem("rules", builtIn), undefined);
  assert.equal(customNameProblem("how-to-join", builtIn), undefined);
  assert.match(customNameProblem("help", builtIn) ?? "", /already/);
  assert.match(customNameProblem("Rules!", builtIn) ?? "", /lowercase/);
});
