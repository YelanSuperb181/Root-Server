import { test } from "node:test";
import assert from "node:assert/strict";
import { serialize } from "../src/core/lock";

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

test("work that fails (say, too little Stardust) doesn't leave a failure nobody handles", async () => {
  const stray: unknown[] = [];
  const note = (reason: unknown) => stray.push(reason);
  process.on("unhandledRejection", note);
  try {
    await assert.rejects(
      serialize("dust:someone", async () => {
        throw new Error("The Crown costs 400 ✨ and you have 12");
      }),
      /costs 400/,
    );
    await tick();
    assert.deepEqual(stray, [], "a refused purchase would have stopped the whole server");
  } finally {
    process.off("unhandledRejection", note);
  }
});

test("work for one key runs one at a time, in order, and carries on after a failure", async () => {
  const order: string[] = [];
  const slow = (label: string, ms: number) => async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    order.push(label);
    return label;
  };
  const first = serialize("dust:a", slow("first", 30));
  const second = serialize("dust:a", async () => {
    order.push("second");
    throw new Error("refused");
  });
  const third = serialize("dust:a", slow("third", 1));
  await first;
  await assert.rejects(second);
  assert.equal(await third, "third");
  assert.deepEqual(order, ["first", "second", "third"]);
});
