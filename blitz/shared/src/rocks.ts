// Space rocks: an endless field of them out in open space, slowly drifting
// and tumbling, for Blitz to crash into. Nothing is stored: each patch of
// space (a grid cell) gets its rocks from a hash of where it is, and where a
// rock is at any moment is a function of the clock.

import { Point } from "./arena";

/** Size of one patch of space, in domain units. */
export const ROCK_CELL = 3;
/** No rocks this close to where the bubble was, so the burst has room. */
export const ROCK_CLEAR = 2.4;
/** The biggest a rock gets, and the furthest it drifts from its home spot. */
export const ROCK_MAX_R = 0.38;
const ROCK_MIN_R = 0.08;
const DRIFT_MAX = 0.22;
/**
 * Rocks sit in the middle of their patch (this far in from each side), so
 * rocks in neighboring patches can never drift into each other.
 */
const INSET = 0.22;

export interface Rock {
  /** Stable for the life of the rock (its looks come from it). */
  id: number;
  x: number;
  y: number;
  /** How it's drifting right now, domain units per second. */
  vx: number;
  vy: number;
  r: number;
  /** Which way round it has tumbled, radians. */
  spin: number;
  /** A few rocks glitter with crystal. */
  crystal: boolean;
}

/** A well-mixed 32-bit hash of integers; the same everywhere. */
export function hash32(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A number in [0, 1) from a hash. */
export const unit = (h: number) => h / 4294967296;

/** What never changes about a rock: where its drift is centred, how it drifts and tumbles. */
interface RockPlan {
  id: number;
  bx: number;
  by: number;
  r: number;
  amp: number;
  w: number;
  phase: number;
  spin: number;
  spinRate: number;
  crystal: boolean;
}

/** Recently used patches' plans (asked for many times a second, by the physics and the drawing). */
const plans = new Map<number, RockPlan[]>();

/** The rocks a patch of space holds, worked out from a hash of where it is. */
function cellPlans(ix: number, iy: number): RockPlan[] {
  const key = ix * 1_000_003 + iy;
  let cell = plans.get(key);
  if (cell) return cell;
  cell = [];
  const roll = unit(hash32(ix, iy, 0));
  const count = roll < 0.25 ? 0 : roll < 0.8 ? 1 : 2;
  for (let k = 0; k < count; k++) {
    const u = (n: number) => unit(hash32(ix, iy, 1 + k * 16 + n));
    const bx = (ix + INSET + (1 - 2 * INSET) * u(0)) * ROCK_CELL;
    const by = (iy + INSET + (1 - 2 * INSET) * u(1)) * ROCK_CELL;
    // Mostly small and middling, now and then a big one.
    const r = ROCK_MIN_R + (ROCK_MAX_R - ROCK_MIN_R) * u(2) * u(2);
    const amp = 0.08 + (DRIFT_MAX - 0.08) * u(3);
    if (Math.hypot(bx, by) < ROCK_CLEAR + r + amp) continue;
    // Two rocks in one patch keep their distance, wherever they drift.
    if (cell.some((h) => Math.hypot(h.bx - bx, h.by - by) < h.r + h.amp + r + amp + 0.12)) continue;
    cell.push({
      id: hash32(ix, iy, 1000 + k),
      bx,
      by,
      r,
      amp,
      w: (u(4) < 0.5 ? -1 : 1) * (0.05 + 0.12 * u(5)),
      phase: u(6) * Math.PI * 2,
      spinRate: ((u(7) < 0.5 ? -1 : 1) * (0.08 + 0.4 * u(8))) / (0.5 + r * 2),
      spin: u(9) * Math.PI * 2,
      crystal: u(10) < 0.18,
    });
  }
  if (plans.size >= 1024) plans.clear();
  plans.set(key, cell);
  return cell;
}

/** Where a planned rock is at time `t`. */
function rockAt(p: RockPlan, t: number): Rock {
  const a = p.w * t + p.phase;
  return {
    id: p.id,
    x: p.bx + p.amp * Math.cos(a),
    y: p.by + p.amp * 0.6 * Math.sin(a),
    vx: -p.amp * p.w * Math.sin(a),
    vy: p.amp * 0.6 * p.w * Math.cos(a),
    r: p.r,
    spin: p.spin + p.spinRate * t,
    crystal: p.crystal,
  };
}

/** The rocks in one patch of space at time `t`. */
export function cellRocks(ix: number, iy: number, t: number): Rock[] {
  return cellPlans(ix, iy).map((p) => rockAt(p, t));
}

/** Every rock that could be within `reach` of (x, y) at time `t`. */
export function rocksNear(x: number, y: number, reach: number, t: number): Rock[] {
  const margin = reach + ROCK_MAX_R + DRIFT_MAX;
  const x0 = Math.floor((x - margin) / ROCK_CELL);
  const x1 = Math.floor((x + margin) / ROCK_CELL);
  const y0 = Math.floor((y - margin) / ROCK_CELL);
  const y1 = Math.floor((y + margin) / ROCK_CELL);
  const out: Rock[] = [];
  for (let ix = x0; ix <= x1; ix++) {
    for (let iy = y0; iy <= y1; iy++) {
      for (const p of cellPlans(ix, iy)) {
        // Far enough that even its widest drift can't bring it in reach: no need to work out where it is.
        if (Math.hypot(p.bx - x, p.by - y) > reach + p.r + p.amp) continue;
        const rock = rockAt(p, t);
        if (Math.hypot(rock.x - x, rock.y - y) <= reach + rock.r) out.push(rock);
      }
    }
  }
  return out;
}

/** The point on a rock's surface nearest `p`. */
export function rockSurface(rock: Rock, p: Point): Point {
  const d = Math.hypot(p.x - rock.x, p.y - rock.y) || 1;
  return { x: rock.x + ((p.x - rock.x) / d) * rock.r, y: rock.y + ((p.y - rock.y) / d) * rock.r };
}
