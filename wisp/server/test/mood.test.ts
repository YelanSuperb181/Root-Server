import { test } from "node:test";
import assert from "node:assert/strict";
import { MOOD_EMOJI, Mood, TRICKS, cleanForReading, readMessage } from "@wisp/shared";

const first = () => 0;

test("Wisp reads the mood of what people say to it", () => {
  const cases: Array<[string, Mood]> = [
    ["hi wisp!", "happy"],
    ["[@Wisp](root://user/abc) i love you", "love"],
    ["wisp ur so cute", "shy"],
    ["gn wisp", "sleepy"],
    ["wisp you are stupid", "grumpy"],
    ["wisp go away", "sad"],
    ["lmaooo wisp", "laugh"],
    ["wisp 😭😭", "laugh"],
    ["WISP LETS GOOOO", "excited"],
    ["HELLO WISP", "excited"],
    ["wisp?", "curious"],
    ["wisp", "curious"],
    ["wisp i'm so sad today", "comfort"],
    ["boo!", "scared"],
    ["thanks wisp", "happy"],
    ["wisp <3", "love"],
  ];
  for (const [text, mood] of cases) assert.equal(readMessage(text, first).mood, mood, text);
});

test("asked-for tricks happen, unless Wisp is sulking or sleepy", () => {
  assert.equal(readMessage("wisp spin!", first).trick, "spin");
  assert.equal(readMessage("wisp do a loop", first).trick, "loop");
  assert.equal(readMessage("wisp draw a heart", first).trick, "heart");
  assert.equal(readMessage("zoomies wisp!!", first).trick, "zoom");
  assert.equal(readMessage("spin, stupid", first).trick, "dash", "grumpy Wisp darts off instead");
  assert.equal(readMessage("gn wisp, spin", first).trick, undefined);
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

test("mentions, links and Wisp's own name don't count toward the mood", () => {
  assert.equal(cleanForReading("[@Wisp](root://user/123) look https://example.com/sad wispy"), "look");
});

test("none of Wisp's lines would turn into a quote block in chat", () => {
  for (let i = 0; i < 200; i++) {
    const r = readMessage(["stupid", "cute", "hi", "ily", "boo", "sad", "go away", "gn", "lol", "omg", "?"][i % 11], Math.random);
    assert.ok(!r.say.startsWith(">"), r.say);
  }
});
