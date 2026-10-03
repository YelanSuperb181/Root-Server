import { test } from "node:test";
import assert from "node:assert/strict";
import { remember } from "../src/core/memo";

test("a remembered answer is shared until it's old or forgotten, and failures aren't kept", async () => {
  let runs = 0;
  let fail = false;
  const board = remember(50, async () => {
    runs++;
    if (fail) throw new Error("store unavailable");
    return runs;
  });
  assert.equal(await board(), 1);
  assert.equal(await board(), 1, "asked again straight away: the same answer, no new scan");
  board.forget();
  assert.equal(await board(), 2, "forgotten: worked out again");
  await new Promise((resolve) => setTimeout(resolve, 60));
  fail = true;
  await assert.rejects(board(), /unavailable/);
  fail = false;
  assert.equal(await board(), 4, "a failure isn't remembered");
});
