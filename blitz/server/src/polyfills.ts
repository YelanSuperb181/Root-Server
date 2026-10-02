// Root's SDK uses a few JavaScript features that arrived in Node 22: the new
// Set methods (a.difference(b) and friends, used when it syncs App settings)
// and iterator helpers (map.values().filter(...)). On Node 20 those calls
// crash with "t.difference is not a function", so this fills them in when
// they're missing. It changes nothing on Node 22 or newer. main.ts imports it
// before anything else.

/* eslint-disable @typescript-eslint/no-explicit-any */

interface SetLike {
  size: number;
  has(value: unknown): boolean;
  keys(): Iterator<unknown>;
}

function define(target: object, name: string, fn: (...args: any[]) => unknown): void {
  if (typeof (target as any)[name] === "function") return;
  Object.defineProperty(target, name, { value: fn, writable: true, configurable: true, enumerable: false });
}

function each(other: SetLike, visit: (value: unknown) => boolean | void): void {
  const it = other.keys();
  for (let step = it.next(); !step.done; step = it.next()) {
    if (visit(step.value) === false) return;
  }
}

const SetProto = Set.prototype as any;

define(SetProto, "union", function (this: Set<unknown>, other: SetLike) {
  const out = new Set(this);
  each(other, (v) => void out.add(v));
  return out;
});
define(SetProto, "intersection", function (this: Set<unknown>, other: SetLike) {
  const out = new Set();
  for (const v of this) if (other.has(v)) out.add(v);
  return out;
});
define(SetProto, "difference", function (this: Set<unknown>, other: SetLike) {
  const out = new Set(this);
  for (const v of this) if (other.has(v)) out.delete(v);
  return out;
});
define(SetProto, "symmetricDifference", function (this: Set<unknown>, other: SetLike) {
  const out = new Set(this);
  each(other, (v) => void (this.has(v) ? out.delete(v) : out.add(v)));
  return out;
});
define(SetProto, "isSubsetOf", function (this: Set<unknown>, other: SetLike) {
  for (const v of this) if (!other.has(v)) return false;
  return true;
});
define(SetProto, "isSupersetOf", function (this: Set<unknown>, other: SetLike) {
  let result = true;
  each(other, (v) => (this.has(v) ? undefined : (result = false)));
  return result;
});
define(SetProto, "isDisjointFrom", function (this: Set<unknown>, other: SetLike) {
  for (const v of this) if (other.has(v)) return false;
  return true;
});

// Iterator helpers live on the prototype every built-in iterator (and
// generator) shares.
const IteratorProto = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]())) as any;
type Fn = (value: any, index: number) => any;

define(IteratorProto, "map", function* (this: Iterator<unknown>, fn: Fn) {
  let i = 0;
  for (let s = this.next(); !s.done; s = this.next()) yield fn(s.value, i++);
});
define(IteratorProto, "filter", function* (this: Iterator<unknown>, fn: Fn) {
  let i = 0;
  for (let s = this.next(); !s.done; s = this.next()) if (fn(s.value, i++)) yield s.value;
});
define(IteratorProto, "flatMap", function* (this: Iterator<unknown>, fn: Fn) {
  let i = 0;
  for (let s = this.next(); !s.done; s = this.next()) yield* fn(s.value, i++);
});
define(IteratorProto, "take", function* (this: Iterator<unknown>, limit: number) {
  for (let n = 0; n < limit; n++) {
    const s = this.next();
    if (s.done) return;
    yield s.value;
  }
});
define(IteratorProto, "drop", function* (this: Iterator<unknown>, count: number) {
  for (let n = 0; n < count; n++) if (this.next().done) return;
  for (let s = this.next(); !s.done; s = this.next()) yield s.value;
});
define(IteratorProto, "toArray", function (this: Iterator<unknown>) {
  const out: unknown[] = [];
  for (let s = this.next(); !s.done; s = this.next()) out.push(s.value);
  return out;
});
define(IteratorProto, "forEach", function (this: Iterator<unknown>, fn: Fn) {
  let i = 0;
  for (let s = this.next(); !s.done; s = this.next()) fn(s.value, i++);
});
define(IteratorProto, "some", function (this: Iterator<unknown>, fn: Fn) {
  let i = 0;
  for (let s = this.next(); !s.done; s = this.next()) if (fn(s.value, i++)) return true;
  return false;
});
define(IteratorProto, "every", function (this: Iterator<unknown>, fn: Fn) {
  let i = 0;
  for (let s = this.next(); !s.done; s = this.next()) if (!fn(s.value, i++)) return false;
  return true;
});
define(IteratorProto, "find", function (this: Iterator<unknown>, fn: Fn) {
  let i = 0;
  for (let s = this.next(); !s.done; s = this.next()) if (fn(s.value, i++)) return s.value;
  return undefined;
});
define(IteratorProto, "reduce", function (this: Iterator<unknown>, fn: (acc: any, value: any, index: number) => any, ...init: any[]) {
  let i = 0;
  let acc: any;
  if (init.length > 0) acc = init[0];
  else {
    const first = this.next();
    if (first.done) throw new TypeError("Reduce of empty iterator with no initial value");
    acc = first.value;
    i = 1;
  }
  for (let s = this.next(); !s.done; s = this.next()) acc = fn(acc, s.value, i++);
  return acc;
});

export {};
