import { test } from "node:test";
import assert from "node:assert/strict";
import { Body, ORB_RADIUS, ROCK_CELL, ROCK_CLEAR, STEP, cellRocks, isSplash, rocksNear, step } from "@blitz/shared";

test("the rock field is the same on every screen and drifts smoothly", () => {
  assert.deepEqual(cellRocks(4, -3, 12.5), cellRocks(4, -3, 12.5));
  const a = cellRocks(5, 2, 10);
  const b = cellRocks(5, 2, 10.1);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].id, b[i].id, "the same rocks");
    assert.ok(Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y) < 0.05, "moved only a little in a tenth of a second");
  }
});

test("there's room around where the bubble was, and rocks out beyond it", () => {
  let count = 0;
  for (let ix = -8; ix < 8; ix++) {
    for (let iy = -8; iy < 8; iy++) {
      for (const t of [0, 100, 1000]) {
        for (const rock of cellRocks(ix, iy, t)) {
          assert.ok(Math.hypot(rock.x, rock.y) - rock.r >= ROCK_CLEAR - 1e-9, "nothing in the clear zone");
          if (t === 0) count++;
        }
      }
    }
  }
  const perPatch = count / 256;
  assert.ok(perPatch > 0.5 && perPatch < 1.5, `a field, not a wall or a desert (${perPatch} per patch)`);
});

test("rocks never drift into each other", () => {
  for (const t of [0, 7.3, 55, 400]) {
    const rocks = rocksNear(0, 0, 9 * ROCK_CELL, t);
    for (let i = 0; i < rocks.length; i++) {
      for (let j = i + 1; j < rocks.length; j++) {
        const [a, b] = [rocks[i], rocks[j]];
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r + 0.05, "a gap between every pair");
      }
    }
  }
});

test("Blitz bounces off a rock and never ends up inside one", () => {
  const rock = rocksNear(7, 0, 4, 0).sort((a, b) => a.x - b.x)[0];
  assert.ok(rock, "a rock to aim at");
  const body: Body = { x: rock.x - rock.r - ORB_RADIUS - 0.5, y: rock.y, vx: 5, vy: 0 };
  let hit;
  let t = 0;
  for (let i = 0; i < 240; i++) {
    const h = step(body, { t, asleep: false, flingUntil: 99, open: true, anchor: { x: body.x, y: body.y } });
    t += STEP;
    if (h && isSplash(h)) hit ??= h;
    for (const r of rocksNear(body.x, body.y, 1, t - STEP)) {
      assert.ok(Math.hypot(body.x - r.x, body.y - r.y) >= r.r + ORB_RADIUS - 1e-6, "never inside a rock");
    }
  }
  assert.ok(hit, "it hit");
  assert.equal(hit.rock, rock.id);
  assert.ok(hit.at, "knows where");
  assert.ok(body.x < rock.x, "bounced back the way it came");
});

test("a long flight through the field stays out of every rock", () => {
  const body: Body = { x: 3, y: 0.4, vx: 9, vy: 3.2 };
  let t = 0;
  let hits = 0;
  for (let i = 0; i < 120 * 12; i++) {
    const h = step(body, { t, asleep: false, flingUntil: 99, open: true, anchor: { x: 25, y: 8 } });
    if (h?.rock !== undefined && isSplash(h)) hits++;
    for (const r of rocksNear(body.x, body.y, 1, t)) assert.ok(Math.hypot(body.x - r.x, body.y - r.y) >= r.r + ORB_RADIUS - 1e-6);
    t += STEP;
  }
  assert.ok(hits >= 0);
});
