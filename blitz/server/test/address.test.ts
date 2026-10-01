import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChannelMessageCreatedEvent } from "@rootsdk/server-app";
import { addressedToBlitz } from "../src/logic/address";

const SELF = "app-blitz";
const msg = (messageContent: string, extra: Partial<ChannelMessageCreatedEvent> = {}) =>
  ({ messageContent, parentMessages: [], ...extra }) as ChannelMessageCreatedEvent;

test("messages that say Blitz's name are for Blitz", () => {
  assert.ok(addressedToBlitz(msg("hi blitz!"), SELF));
  assert.ok(addressedToBlitz(msg("BLITZY spin"), SELF));
  assert.ok(addressedToBlitz(msg("where's blitz?"), undefined), "works before Blitz knows its own ID");
  assert.ok(!addressedToBlitz(msg("a blitzier cloud, whisper"), SELF));
  assert.ok(!addressedToBlitz(msg("just chatting"), SELF));
});

test("@mentions and replies to Blitz count too", () => {
  assert.ok(addressedToBlitz(msg(`hey [@Sprite](root://user/${SELF})`), SELF));
  assert.ok(addressedToBlitz(msg("thanks!", { parentMessages: [{ id: "m1", userId: SELF }] } as never), SELF));
  assert.ok(!addressedToBlitz(msg("thanks!", { parentMessages: [{ id: "m1", userId: "someone" }] } as never), SELF));
});
