import { test } from "node:test";
import assert from "node:assert/strict";
import { ownerAllowed, rootIdHex } from "../src/logic/owner";

// A person's ID, written both ways Root uses.
const BYTES = Buffer.from("00319b9fd15c8301a40e3fa7754da96a", "hex");
const SHORT = BYTES.toString("base64url");
const UUID = "00319b9f-d15c-8301-a40e-3fa7754da96a";

test("Root IDs compare by their bytes, however they're written", () => {
  assert.equal(SHORT.length, 22);
  assert.equal(rootIdHex(SHORT), rootIdHex(UUID));
  assert.equal(rootIdHex(UUID.toUpperCase()), rootIdHex(UUID));
  assert.equal(rootIdHex("not an id"), undefined);
  assert.equal(rootIdHex(""), undefined);
});

test("only the listed owners' communities may use Blitz", () => {
  assert.ok(ownerAllowed(SHORT, [UUID]));
  assert.ok(ownerAllowed(UUID, ["someone-else", SHORT]));
  const stranger = Buffer.from("00319b9fd15c8301a40e3fa7754da96b", "hex").toString("base64url");
  assert.ok(!ownerAllowed(stranger, [SHORT]));
  assert.ok(!ownerAllowed(undefined, [SHORT]));
  assert.ok(!ownerAllowed(SHORT, []));
  assert.ok(!ownerAllowed("garbage", ["garbage"]), "only real IDs ever match");
});
