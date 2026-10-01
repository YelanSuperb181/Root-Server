import { test } from "node:test";
import assert from "node:assert/strict";
import { MOOD_EMOJI, Mood, TRICKS, cleanForReading, readMessage } from "@blitz/shared";

const first = () => 0;

test("Blitz reads the mood of what people say to it", () => {
  const cases: Array<[string, Mood]> = [
    ["hi blitz!", "happy"],
    ["[@Blitz](root://user/abc) i love you", "love"],
    ["blitz ur so cute", "shy"],
    ["gn blitz", "sleepy"],
    ["blitz you are stupid", "grumpy"],
    ["blitz go away", "sad"],
    ["lmaooo blitz", "laugh"],
    ["blitz 😭😭", "laugh"],
    ["BLITZ LETS GOOOO", "excited"],
    ["HELLO BLITZ", "excited"],
    ["blitz?", "curious"],
    ["blitz", "curious"],
    ["blitz i'm so sad today", "comfort"],
    ["boo!", "scared"],
    ["thanks blitz", "happy"],
    ["blitz <3", "love"],
  ];
  for (const [text, mood] of cases) assert.equal(readMessage(text, first).mood, mood, text);
});

test("asked-for tricks happen, unless Blitz is sulking or sleepy", () => {
  assert.equal(readMessage("blitz spin!", first).trick, "spin");
  assert.equal(readMessage("blitz do a loop", first).trick, "loop");
  assert.equal(readMessage("blitz draw a heart", first).trick, "heart");
  assert.equal(readMessage("zoomies blitz!!", first).trick, "zoom");
  assert.equal(readMessage("spin, stupid", first).trick, "dash", "grumpy Blitz darts off instead");
  assert.equal(readMessage("gn blitz, spin", first).trick, undefined);
});

test("every reaction has a line, a chat emoji and a known trick", () => {
  for (const text of ["hi", "ily", "cute", "lol", "omg", "?", "sad", "stupid", "go away", "boo", "gn", "", "random words"]) {
    const r = readMessage(text, Math.random);
    assert.ok(r.say.length > 0 && r.action.length > 0, text);
    assert.match(r.emoji.code, /^[a-z0-9_+-]+$/);
    if (r.trick) assert.ok(r.trick in TRICKS);
  }
  for (const e of Object.values(MOOD_EMOJI)) assert.match(e.code, /^[a-z0-9_+-]+$/);
});

test("mentions, links and Blitz's own name don't count toward the mood", () => {
  assert.equal(cleanForReading("[@Blitz](root://user/123) look https://example.com/sad blitzy"), "look");
});

test("none of Blitz's lines would turn into a quote block in chat", () => {
  for (let i = 0; i < 200; i++) {
    const r = readMessage(["stupid", "cute", "hi", "ily", "boo", "sad", "go away", "gn", "lol", "omg", "?"][i % 11], Math.random);
    assert.ok(!r.say.startsWith(">"), r.say);
  }
});
