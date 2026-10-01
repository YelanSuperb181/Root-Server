import { test } from "node:test";
import assert from "node:assert/strict";
import { CommunityFacts, MOODS, MOOD_EMOJI, REACTION_EMOJI, THOUGHT_SCHEMA, TRICKS, personaPrompt, readThought, situationPrompt } from "@blitz/shared";

const facts: CommunityFacts = {
  name: "Test Place",
  prefix: "!",
  groups: [{ name: "Social", channels: [{ name: "general-yap", topic: "✨ talk here" }, { name: "games" }] }],
  commands: [{ name: "rank", summary: "Your level." }],
};

test("Claude's answer is checked and cleaned before Blitz acts on it", () => {
  const r = readThought({ mood: "love", trick: "heart", say: "  ♡   hi   ♡ ", reply: "ily too *spins*", emoji: "two_hearts" });
  assert.ok(r);
  assert.equal(r.mood, "love");
  assert.equal(r.trick, "heart");
  assert.equal(r.say, "♡ hi ♡");
  assert.equal(r.reply, "ily too *spins*");
  assert.deepEqual(r.emoji, { code: "two_hearts", glyph: "💕" });
});

test("unknown moods, tricks and emoji fall back to safe ones", () => {
  const r = readThought({ mood: "furious", trick: "teleport", say: "hm", reply: "", emoji: "not_an_emoji" });
  assert.ok(r);
  assert.equal(r.mood, "happy");
  assert.equal(r.trick, undefined);
  assert.equal(r.reply, undefined, "an empty reply means no chat reply");
  assert.deepEqual(r.emoji, MOOD_EMOJI.happy);
  assert.equal(readThought({ mood: "happy", trick: "none", say: "x", reply: "", emoji: "eyes" })?.trick, undefined);
});

test("long lines are cut, a missing line borrows from the reply, and junk is rejected", () => {
  const long = readThought({ mood: "happy", trick: "none", say: "a".repeat(500), reply: "b".repeat(5000), emoji: "sparkles" });
  assert.ok(long && long.say.length <= 160 && (long.reply ?? "").length <= 700);
  const borrowed = readThought({ mood: "happy", trick: "none", say: "", reply: "paris!! the capital of france", emoji: "sparkles" });
  assert.equal(borrowed?.say, "paris!! the capital of france");
  assert.equal(readThought({ mood: "happy", trick: "none", say: "", reply: "", emoji: "sparkles" }), undefined);
  assert.equal(readThought("not json"), undefined);
  assert.equal(readThought(null), undefined);
});

test("the answer format offers exactly Blitz's moods, tricks and chat emoji", () => {
  assert.deepEqual([...THOUGHT_SCHEMA.properties.mood.enum], [...MOODS]);
  assert.deepEqual([...THOUGHT_SCHEMA.properties.trick.enum], [...Object.keys(TRICKS), "none"]);
  for (const code of THOUGHT_SCHEMA.properties.emoji.enum) assert.match(code, /^[a-z0-9_+-]+$/);
  assert.equal(THOUGHT_SCHEMA.properties.emoji.enum.length, Object.keys(REACTION_EMOJI).length);
});

test("Blitz's persona knows the community and stays the same between calls (so it caches)", () => {
  const a = personaPrompt(facts);
  assert.equal(a, personaPrompt(facts));
  assert.match(a, /Test Place/);
  assert.match(a, /#general-yap \(✨ talk here\)/);
  assert.match(a, /!rank: Your level\./);
});

test("the situation names who's talking, where, and what was said before", () => {
  const chat = situationPrompt({
    from: "Ana",
    text: "blitz what do you think?",
    channel: "general-yap",
    chat: [{ from: "Bee", text: "pineapple on pizza is elite" }],
    memory: [{ from: "Ana", text: "hi blitz", blitz: "hii ana!!" }],
    asleep: false,
    open: true,
    watching: 2,
  });
  assert.match(chat, /#general-yap/);
  assert.match(chat, /Bee: pineapple on pizza is elite/);
  assert.match(chat, /You: hii ana!!/);
  assert.match(chat, /burst open/);
  assert.match(chat, /New message to you from Ana:\n"""\nblitz what do you think\?\n"""/);
  const domain = situationPrompt({ from: "Ana", text: "hi", channel: "", chat: [], memory: [], asleep: true, open: false, watching: 1 });
  assert.match(domain, /your domain/);
  assert.match(domain, /dozing/);
  assert.doesNotMatch(domain, /Recent messages/);
});
