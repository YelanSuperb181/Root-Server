// Space rocks: an endless field of them out in open space, slowly drifting
// and tumbling, for Blitz to crash into. The field is the same on every
// screen without anyone sending it: each patch of space (a grid cell) gets
// its rocks from a hash of where it is, and where a rock is at any moment
// is a function of the shared clock.

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

/** The rocks in one patch of space at time `t`. */
export function cellRocks(ix: number, iy: number, t: number): Rock[] {
  const roll = unit(hash32(ix, iy, 0));
  const count = roll < 0.25 ? 0 : roll < 0.8 ? 1 : 2;
  const rocks: Rock[] = [];
  const homes: Array<{ x: number; y: number; reach: number }> = [];
  for (let k = 0; k < count; k++) {
    const u = (n: number) => unit(hash32(ix, iy, 1 + k * 16 + n));
    const bx = (ix + INSET + (1 - 2 * INSET) * u(0)) * ROCK_CELL;
    const by = (iy + INSET + (1 - 2 * INSET) * u(1)) * ROCK_CELL;
    // Mostly small and middling, now and then a big one.
    const r = ROCK_MIN_R + (ROCK_MAX_R - ROCK_MIN_R) * u(2) * u(2);
    const amp = 0.08 + (DRIFT_MAX - 0.08) * u(3);
    if (Math.hypot(bx, by) < ROCK_CLEAR + r + amp) continue;
    // Two rocks in one patch keep their distance, wherever they drift.
    if (homes.some((h) => Math.hypot(h.x - bx, h.y - by) < h.reach + r + amp + 0.12)) continue;
    homes.push({ x: bx, y: by, reach: r + amp });
    const w = (u(4) < 0.5 ? -1 : 1) * (0.05 + 0.12 * u(5));
    const phase = u(6) * Math.PI * 2;
    const a = w * t + phase;
    const spinRate = (u(7) < 0.5 ? -1 : 1) * (0.08 + 0.4 * u(8)) / (0.5 + r * 2);
    rocks.push({
      id: hash32(ix, iy, 1000 + k),
      x: bx + amp * Math.cos(a),
      y: by + amp * 0.6 * Math.sin(a),
      vx: -amp * w * Math.sin(a),
      vy: amp * 0.6 * w * Math.cos(a),
      r,
      spin: u(9) * Math.PI * 2 + spinRate * t,
      crystal: u(10) < 0.18,
    });
  }
  return rocks;
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
      for (const rock of cellRocks(ix, iy, t)) {
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
