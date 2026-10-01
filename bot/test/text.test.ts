import { test } from "node:test";
import assert from "node:assert/strict";
import {
  channelMention,
  defuseMentions,
  fillTemplate,
  mentionedChannelIds,
  mentionedRoleIds,
  mentionedUserIds,
  pick,
  progressBar,
  quote,
  roleMention,
  sameName,
  sanitizeChannelName,
  truncate,
  userMention,
} from "../src/logic/text";
import { E, emojiKey, isEmoji } from "../src/logic/emoji";

test("mentions round-trip through the parsers", () => {
  const text = `hi ${userMention("Ann", "U1")} and ${userMention("Bo [admin]", "U2")} see ${channelMention("general", "C1")} ${roleMention("Gamer", "R1")}`;
  assert.deepEqual(mentionedUserIds(text), ["U1", "U2"]);
  assert.deepEqual(mentionedChannelIds(text), ["C1"]);
  assert.deepEqual(mentionedRoleIds(text), ["R1"]);
  assert.ok(text.includes("[@Bo admin](root://user/U2)"), "brackets in names are stripped so the link stays valid");
});

test("defuseMentions keeps the text but removes the links", () => {
  assert.equal(defuseMentions(`yo ${userMention("Ann", "U1")}!`), "yo @Ann!");
  assert.equal(defuseMentions("[a link](https://example.com)"), "[a link](https://example.com)");
});

test("truncate adds an ellipsis only when needed", () => {
  assert.equal(truncate("short", 10), "short");
  assert.equal(truncate("exactly10!", 10), "exactly10!");
  assert.equal(truncate("this is too long", 8), "this is…");
});

test("quote prefixes every line", () => {
  assert.equal(quote("a\nb"), "> a\n> b");
});

test("fillTemplate is case-insensitive and leaves unknown keys alone", () => {
  assert.equal(fillTemplate("Hi {User}, level {level} {nope}", { user: "Ann", LEVEL: "5" }), "Hi Ann, level 5 {nope}");
});

test("progressBar clamps and rounds", () => {
  assert.equal(progressBar(0), "▱▱▱▱▱▱▱▱▱▱");
  assert.equal(progressBar(0.5), "▰▰▰▰▰▱▱▱▱▱");
  assert.equal(progressBar(2), "▰▰▰▰▰▰▰▰▰▰");
  assert.equal(progressBar(Number.NaN), "▱▱▱▱▱▱▱▱▱▱");
  assert.equal(progressBar(0.5, 4), "▰▰▱▱");
});

test("sanitizeChannelName follows Root's channel name rules", () => {
  assert.equal(sanitizeChannelName("General Chat!"), "General-Chat");
  assert.equal(sanitizeChannelName("--café  au   lait--"), "cafe-au-lait");
  assert.equal(sanitizeChannelName("👋・welcome"), "welcome");
  assert.equal(sanitizeChannelName("🎉🎉"), undefined);
  assert.equal(sanitizeChannelName("a".repeat(150))?.length, 100);
});

test("sameName ignores case, emoji and punctuation", () => {
  assert.ok(sameName("General", "general"));
  assert.ok(sameName("👋・welcome", "welcome"));
  assert.ok(sameName("Feedback and Help", "feedback-and-help"));
  assert.ok(!sameName("general", "general-2"));
});

test("pick uses the injected random source", () => {
  assert.equal(pick(["a", "b", "c"], () => 0), "a");
  assert.equal(pick(["a", "b", "c"], () => 0.999), "c");
  assert.throws(() => pick([]));
});

test("emojiKey normalizes Root's reaction shortcodes", () => {
  assert.equal(emojiKey(":star:"), "star");
  assert.equal(emojiKey(":Star:"), "star");
  assert.equal(emojiKey(":partyparrot:abc123:"), "partyparrot");
  assert.equal(emojiKey(":thumbsup:"), "+1");
  assert.ok(isEmoji(":thumbsup:", E.thumbsUp));
  assert.ok(isEmoji(":+1:", E.thumbsUp));
  assert.ok(!isEmoji(":star2:", E.star));
});
