import { test } from "node:test";
import assert from "node:assert/strict";

// Pretend to be Node 20: take away the methods Root's SDK needs, then load the
// polyfill and check it puts back working ones.
const SET_METHODS = ["union", "intersection", "difference", "symmetricDifference", "isSubsetOf", "isSupersetOf", "isDisjointFrom"];
const ITER_METHODS = ["map", "filter", "flatMap", "take", "drop", "toArray", "forEach", "some", "every", "find", "reduce"];
const iterProto = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
for (const name of SET_METHODS) delete (Set.prototype as any)[name];
for (const name of ITER_METHODS) delete iterProto[name];
require("../src/polyfills");

const s = (...v: number[]) => new Set(v) as any;
const sorted = (set: Set<number>) => [...set].sort();

test("Set methods work without Node 22", () => {
  assert.deepEqual(sorted(s(1, 2, 3).difference(s(2, 4))), [1, 3]);
  assert.deepEqual(sorted(s(1, 2).union(s(2, 3))), [1, 2, 3]);
  assert.deepEqual(sorted(s(1, 2, 3).intersection(s(2, 3, 4))), [2, 3]);
  assert.deepEqual(sorted(s(1, 2).symmetricDifference(s(2, 3))), [1, 3]);
  assert.ok(s(1).isSubsetOf(s(1, 2)) && !s(1, 5).isSubsetOf(s(1, 2)));
  assert.ok(s(1, 2).isSupersetOf(s(1)) && !s(1).isSupersetOf(s(1, 2)));
  assert.ok(s(1).isDisjointFrom(s(2)) && !s(1).isDisjointFrom(s(1)));
});

test("iterator helpers work without Node 22", () => {
  const m = new Map([["a", 1], ["b", 2], ["c", 3]]);
  const vals = () => m.values() as any;
  assert.deepEqual([...vals().filter((v: number) => v > 1)], [2, 3]);
  assert.deepEqual(vals().map((v: number) => v * 2).toArray(), [2, 4, 6]);
  assert.deepEqual(vals().drop(1).take(1).toArray(), [2]);
  assert.deepEqual(vals().flatMap((v: number) => [v, v]).toArray(), [1, 1, 2, 2, 3, 3]);
  assert.equal(vals().reduce((a: number, v: number) => a + v), 6);
  assert.equal(vals().find((v: number) => v === 2), 2);
  assert.ok(vals().some((v: number) => v === 3) && vals().every((v: number) => v > 0));
});
