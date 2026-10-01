import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Body,
  LIMIT,
  MAX_FLING,
  ORB_RADIUS,
  STEP,
  advance,
  isSplash,
  pokeImpulse,
  sanitize,
  step,
  wanderPoint,
} from "@wisp/shared";

const free = (t: number) => ({ t, asleep: false, flingUntil: 0 });

test("the drift point always stays well inside the domain", () => {
  for (let t = 0; t < 2000; t += 0.37) {
    const w = wanderPoint(t);
    assert.ok(Math.hypot(w.x, w.y) < 0.65, `wander left the middle at t=${t}`);
  }
});

test("Wisp never leaves the domain, however hard it's thrown", () => {
  const body: Body = { x: 0, y: 0, vx: MAX_FLING, vy: -MAX_FLING * 0.7 };
  for (let i = 0; i < 120 * 30; i++) {
    step(body, free(i * STEP));
    assert.ok(Math.hypot(body.x, body.y) <= LIMIT + 1e-9);
  }
});

test("a free bounce reverses the speed into the wall and reports the hit", () => {
  const body: Body = { x: LIMIT - 0.001, y: 0, vx: 4, vy: 0 };
  let hit;
  for (let i = 0; i < 5 && !hit; i++) hit = step(body, free(0));
  assert.ok(hit, "expected an impact");
  assert.equal(hit.held, false);
  assert.ok(hit.nx > 0.99);
  assert.ok(isSplash(hit));
  assert.ok(body.vx < 0, "bounced back");
  assert.ok(Math.abs(body.vx) > 2.5 && Math.abs(body.vx) < 4, "lost some speed, kept most");
});

test("a slow touch isn't a splash", () => {
  assert.equal(isSplash({ nx: 1, ny: 0, speed: 0.1, held: false }), false);
  assert.equal(isSplash({ nx: 1, ny: 0, speed: 0.4, held: true }), false, "held hits need more force");
  assert.equal(isSplash({ nx: 1, ny: 0, speed: 0.4, held: false }), true);
});

test("holding pulls Wisp to the pointer", () => {
  const body: Body = { x: 0, y: 0, vx: 0, vy: 0 };
  advance(body, 0, 1, { target: { x: 0.4, y: -0.2 }, asleep: false, flingUntil: 0 });
  assert.ok(Math.hypot(body.x - 0.4, body.y + 0.2) < 0.02);
});

test("shoving a held Wisp past the rim slams it into the wall and pins it there", () => {
  const body: Body = { x: 0, y: 0, vx: 0, vy: 0 };
  const hit = advance(body, 0, 0.6, { target: { x: 1.5, y: 0 }, asleep: false, flingUntil: 0 });
  assert.ok(hit, "expected a slam");
  assert.equal(hit.held, true);
  assert.ok(isSplash(hit), `slam speed ${hit.speed} should splash`);
  assert.ok(Math.abs(Math.hypot(body.x, body.y) - LIMIT) < 0.01, "pinned against the rim");
  assert.ok(Math.abs(body.y) < 0.01, "didn't slide along the wall");
});

test("the same inputs give the same flight on every screen", () => {
  const a: Body = { x: 0.1, y: -0.2, vx: 6.3, vy: 2.1 };
  const b: Body = { ...a };
  const forces = { asleep: false, flingUntil: 12.4 };
  advance(a, 11, 13, forces);
  advance(b, 11, 13, forces);
  assert.deepEqual(a, b);
});

test("a fast throw coasts before the drift pulls it back", () => {
  const coasting: Body = { x: 0, y: 0, vx: 0.9, vy: 0 };
  const pulled: Body = { ...coasting };
  advance(coasting, 0, 0.5, { asleep: false, flingUntil: 5 });
  advance(pulled, 0, 0.5, { asleep: false, flingUntil: 0 });
  assert.notDeepEqual(coasting, pulled);
});

test("advance caps long gaps so a stale state can't freeze a frame", () => {
  const body: Body = { x: 0, y: 0, vx: 0, vy: 0 };
  const started = Date.now();
  advance(body, 0, 10_000, { asleep: false, flingUntil: 0 }, 2);
  assert.ok(Date.now() - started < 500);
});

test("sanitize clamps throws, positions and garbage", () => {
  const fast = sanitize({ x: 0, y: 0, vx: 100, vy: 0 });
  assert.ok(Math.abs(Math.hypot(fast.vx, fast.vy) - MAX_FLING) < 1e-9);
  const outside = sanitize({ x: 3, y: 4, vx: 0, vy: 0 });
  assert.ok(Math.abs(Math.hypot(outside.x, outside.y) - LIMIT) < 1e-9);
  assert.deepEqual(sanitize({ x: NaN, y: Infinity, vx: 0, vy: 0 }), { x: 0, y: 0, vx: 0, vy: 0 });
});

test("pokes push at the requested angle", () => {
  const p = pokeImpulse(Math.PI / 2);
  assert.ok(Math.abs(p.vx) < 1e-9 && p.vy > 0);
  assert.ok(ORB_RADIUS > 0 && ORB_RADIUS < 0.2);
});
