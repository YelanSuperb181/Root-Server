import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChannelMessageCreatedEvent } from "@rootsdk/server-app";
import { addressedToWisp } from "../src/logic/address";

const SELF = "app-wisp";
const msg = (messageContent: string, extra: Partial<ChannelMessageCreatedEvent> = {}) =>
  ({ messageContent, parentMessages: [], ...extra }) as ChannelMessageCreatedEvent;

test("messages that say Wisp's name are for Wisp", () => {
  assert.ok(addressedToWisp(msg("hi wisp!"), SELF));
  assert.ok(addressedToWisp(msg("WISPY spin"), SELF));
  assert.ok(addressedToWisp(msg("where's wisp?"), undefined), "works before Wisp knows its own ID");
  assert.ok(!addressedToWisp(msg("a wispier cloud, whisper"), SELF));
  assert.ok(!addressedToWisp(msg("just chatting"), SELF));
});

test("@mentions and replies to Wisp count too", () => {
  assert.ok(addressedToWisp(msg(`hey [@Sprite](root://user/${SELF})`), SELF));
  assert.ok(addressedToWisp(msg("thanks!", { parentMessages: [{ id: "m1", userId: SELF }] } as never), SELF));
  assert.ok(!addressedToWisp(msg("thanks!", { parentMessages: [{ id: "m1", userId: "someone" }] } as never), SELF));
});
