import { test } from "node:test";
import assert from "node:assert/strict";
import { AutomodRules, addStrike, checkContent, checkRate, emptyHistory, findBlockedWord } from "../src/logic/automod";
import { roleMention, userMention } from "../src/logic/text";

const rules: AutomodRules = {
  maxMentions: 3,
  spam: { messages: 4, seconds: 5 },
  duplicates: { count: 3, seconds: 30 },
  blockInviteLinks: true,
  blockedWords: ["badword", "scam*"],
};

test("mass mentions count users and roles", () => {
  const three = [1, 2, 3].map((i) => userMention(`u${i}`, `U${i}`)).join(" ");
  assert.equal(checkContent(three, rules), undefined);
  assert.equal(checkContent(`${three} ${roleMention("Gamer", "R1")}`, rules)?.kind, "mentions");
});

test("invite links to other platforms are caught", () => {
  assert.equal(checkContent("join us https://discord.gg/abc123", rules)?.kind, "invite");
  assert.equal(checkContent("discord.com/invite/xyz", rules)?.kind, "invite");
  assert.equal(checkContent("t.me/joinchat/abc", rules)?.kind, "invite");
  assert.equal(checkContent("I love discord.gg", rules), undefined, "no path, not an invite");
  assert.equal(checkContent("see https://example.com/invite", rules), undefined);
  assert.equal(checkContent("discord.gg/abc", { ...rules, blockInviteLinks: false }), undefined);
});

test("blocked words match whole words, with * as a suffix wildcard", () => {
  assert.equal(findBlockedWord("that is a BADWORD!", rules.blockedWords), "badword");
  assert.equal(findBlockedWord("badwords are fine", rules.blockedWords), undefined);
  assert.equal(findBlockedWord("notbadword", rules.blockedWords), undefined);
  assert.equal(findBlockedWord("total scammer", rules.blockedWords), "scam*");
  assert.equal(findBlockedWord("ascam", rules.blockedWords), undefined);
  assert.equal(findBlockedWord("anything", ["", "  "]), undefined);
  assert.equal(findBlockedWord("a.b c", ["a.b"]), "a.b", "regex characters are literal");
});

test("flooding: more than N messages inside the window", () => {
  const h = emptyHistory();
  for (let i = 0; i < 4; i++) assert.equal(checkRate(h, `msg ${i}`, 1000 + i * 100, rules), undefined);
  assert.equal(checkRate(h, "msg 5", 1500, rules)?.kind, "spam");
  // Long after, the window has emptied.
  assert.equal(checkRate(h, "hello again", 100_000, rules), undefined);
  assert.equal(h.times.length, 1, "old entries are trimmed");
});

test("duplicates: the same text N times", () => {
  const h = emptyHistory();
  assert.equal(checkRate(h, "BUY NOW", 0, rules), undefined);
  assert.equal(checkRate(h, "buy  now", 10_000, rules), undefined);
  assert.equal(checkRate(h, "Buy now", 20_000, rules)?.kind, "duplicate");
});

test("addStrike keeps only strikes inside the window", () => {
  assert.deepEqual(addStrike([0, 50, 100], 120, 100), [50, 100, 120]);
});
