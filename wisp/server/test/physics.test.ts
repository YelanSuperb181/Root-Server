import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BURST_SPEED,
  Body,
  LIMIT,
  MAX_FLING,
  OPEN_LIMIT,
  ORB_RADIUS,
  REACH,
  STEP,
  TRICKS,
  Trick,
  TrickKind,
  advance,
  burstLaunch,
  clampTarget,
  idleTrick,
  isBursting,
  isSplash,
  landingPoint,
  pokeImpulse,
  sanitize,
  step,
  trickTarget,
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

test("a slow touch isn't a splash, and neither is a hand pressing Wisp into the wall", () => {
  assert.equal(isSplash({ nx: 1, ny: 0, speed: 0.1, held: false, fresh: true }), false);
  assert.equal(isSplash({ nx: 1, ny: 0, speed: 0.4, held: true, fresh: true }), false, "held hits need more force");
  assert.equal(isSplash({ nx: 1, ny: 0, speed: 0.4, held: false, fresh: true }), true);
  assert.equal(isSplash({ nx: 1, ny: 0, speed: 3, held: true, fresh: false }), false);
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

/** Holds Wisp pressed into the right-hand wall, `push` past it, until it bursts. Returns how long that took. */
function pressUntilBurst(push: number, maxSeconds = 10): number {
  const body: Body = { x: 0, y: 0, vx: 0, vy: 0 };
  let t = 0;
  while (!isBursting(body) && t < maxSeconds) {
    step(body, { t, target: { x: LIMIT + push, y: 0 }, asleep: false, flingUntil: 0 });
    t += STEP;
  }
  return t;
}

test("holding Wisp against the wall cracks it until the bubble bursts", () => {
  const hard = pressUntilBurst(REACH);
  const gentle = pressUntilBurst(0.1);
  assert.ok(hard > 1.5 && hard < 2.6, `a hard shove bursts it in about two seconds (took ${hard.toFixed(2)})`);
  assert.ok(gentle > hard && gentle < 4.5, `a gentle press takes longer (took ${gentle.toFixed(2)})`);
});

test("cracks heal once nobody's pushing", () => {
  const body: Body = { x: 0, y: 0, vx: 0, vy: 0 };
  advance(body, 0, 1.2, { target: { x: LIMIT + 0.4, y: 0 }, asleep: false, flingUntil: 0 });
  const cracked = body.strain ?? 0;
  assert.ok(cracked > 0.2);
  advance(body, 1.2, 3, { asleep: false, flingUntil: 0 });
  assert.ok((body.strain ?? 0) < cracked - 0.2, "healing");
});

test("throwing Wisp at the wall cracks it a little but never bursts it", () => {
  const body: Body = { x: 0, y: 0, vx: 0, vy: 0 };
  for (let i = 0; i < 40; i++) {
    body.vx = MAX_FLING * (i % 2 ? -1 : 1);
    advance(body, i * 0.4, (i + 1) * 0.4, { asleep: false, flingUntil: (i + 1) * 0.4 });
  }
  assert.ok((body.strain ?? 0) > 0, "some cracks");
  assert.ok(!isBursting(body));
});

test("the burst launches Wisp out through the wall into open space with no walls", () => {
  const body: Body = { x: LIMIT, y: 0, vx: 0, vy: 0, strain: 1 };
  burstLaunch(body);
  assert.ok(body.vx > BURST_SPEED * 0.99 && Math.abs(body.vy) < 1e-9);
  assert.equal(body.strain, 0);
  const anchor = landingPoint(body);
  assert.ok(anchor.x > 5, "it will settle far out");
  let furthest = 0;
  for (let i = 0; i < 120 * 3; i++) {
    const hit = step(body, { t: i * STEP, asleep: false, flingUntil: 2.2, open: true, anchor });
    assert.equal(hit, undefined, "nothing to hit out here");
    furthest = Math.max(furthest, body.x);
  }
  assert.ok(furthest > LIMIT + 4, `flew well past where the bubble was (${furthest.toFixed(2)})`);
  advance(body, 3, 40, { asleep: false, flingUntil: 0, open: true, anchor }, 40);
  assert.ok(Math.hypot(body.x - anchor.x, body.y - anchor.y) < 1.5, "drifts around where it landed");
});

test("open space has a far-off safety limit and drifts home gently", () => {
  const body: Body = { x: 0, y: 0, vx: 0, vy: 0 };
  advance(body, 0, 2, { target: { x: 500, y: 0 }, asleep: false, flingUntil: 0, open: true }, 30);
  assert.ok(Math.hypot(body.x, body.y) <= OPEN_LIMIT + 1e-9);
  const lost: Body = { x: 50, y: 0, vx: 0, vy: 0 };
  let top = 0;
  for (let i = 0; i < 120 * 5; i++) {
    step(lost, { t: i * STEP, asleep: false, flingUntil: 0, open: true });
    top = Math.max(top, Math.hypot(lost.vx, lost.vy));
  }
  assert.ok(top < 1.2, `a gentle drift, not a rocket (${top.toFixed(2)})`);
  assert.ok(lost.x < 50, "heading home");
});

test("a gentle release in open space settles right there", () => {
  const p = landingPoint({ x: 3, y: -2, vx: 0.5, vy: 0 });
  assert.deepEqual(p, { x: 3, y: -2 });
});

test("targets and throws are clamped to the bubble or the open arena", () => {
  const far = clampTarget({ x: 10, y: 0 });
  assert.ok(Math.abs(far.x - (LIMIT + REACH)) < 1e-9);
  const wide = clampTarget({ x: 10, y: 10 }, true);
  assert.ok(wide.x > LIMIT + REACH && wide.y > 1);
  const inOpen = sanitize({ x: 1.5, y: 0, vx: 0, vy: 0 }, true);
  assert.equal(inOpen.x, 1.5, "fine in the open arena");
  const backInBubble = sanitize({ x: 1.5, y: 0, vx: 0, vy: 0 });
  assert.ok(Math.abs(backInBubble.x - LIMIT) < 1e-9, "pulled back inside the bubble");
});

test("every trick stays inside, ends on time, and flies the same on every screen", () => {
  for (const open of [false, true]) {
    for (const kind of Object.keys(TRICKS) as TrickKind[]) {
      for (const dir of [1, -1]) {
        const trick: Trick = { kind, start: 5, x: 0.7, y: -0.5, dir };
        assert.equal(trickTarget(trick, 4.99, open), undefined, "not before it starts");
        assert.equal(trickTarget(trick, 5 + TRICKS[kind] + 0.01, open), undefined, "not after it ends");
        const a: Body = { x: 0.7, y: -0.5, vx: 0, vy: 0 };
        const b: Body = { ...a };
        for (let t = 5; t < 5 + TRICKS[kind]; t += STEP) {
          const p = trickTarget(trick, t, open)!;
          if (open) assert.ok(Math.hypot(p.x, p.y) < OPEN_LIMIT, `${kind} target left open space`);
          else assert.ok(Math.hypot(p.x, p.y) < LIMIT, `${kind} target left the bubble`);
        }
        advance(a, 5, 5 + TRICKS[kind], { asleep: false, flingUntil: 0, trick, open });
        advance(b, 5, 5 + TRICKS[kind], { asleep: false, flingUntil: 0, trick, open });
        assert.deepEqual(a, b, `${kind} is deterministic`);
      }
    }
  }
});

test("a zoom is fast and a sleeping Wisp ignores tricks", () => {
  const trick: Trick = { kind: "zoom", start: 0, x: 0, y: 0, dir: 1 };
  const body: Body = { x: 0, y: 0, vx: 0, vy: 0 };
  let top = 0;
  for (let t = 0; t < TRICKS.zoom; t += STEP) {
    step(body, { t, asleep: false, flingUntil: 0, trick });
    top = Math.max(top, Math.hypot(body.vx, body.vy));
  }
  assert.ok(top > 3, `zooming at ${top.toFixed(2)}`);
  const sleeper: Body = { x: 0, y: 0, vx: 0, vy: 0 };
  advance(sleeper, 0, 1, { asleep: true, flingUntil: 0, trick });
  assert.ok(Math.hypot(sleeper.x, sleeper.y) < 0.1);
});

test("idle tricks come from the trick list", () => {
  for (let i = 0; i < 50; i++) assert.ok(idleTrick(() => i / 50) in TRICKS);
  assert.ok(idleTrick(() => 0.9999) in TRICKS);
});
