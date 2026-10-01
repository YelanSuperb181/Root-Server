// Wisp's physics. The server runs it as the source of truth and every open
// domain runs the same code to predict motion between updates, so a fling
// lands in the same place on every screen.
//
// Units: the bubble is a circle of radius 1 centered on (0, 0) (see arena.ts).
// Speeds are in radii per second, time in seconds. Rendering scales
// everything to pixels.

import { LIMIT, OPEN_HALF_H, OPEN_HALF_W, ORB_RADIUS, Point, arenaScale, clampToArena } from "./arena";
import { Trick, trickTarget } from "./tricks";

/** Fixed simulation step. Variable frame times are split into these. */
export const STEP = 1 / 120;
/** Fastest throw allowed, in radii per second. */
export const MAX_FLING = 11;
/** Throws faster than this coast before the drift takes over again. */
export const FLING_SPEED = 2.8;
/** How long a fast throw coasts, in seconds. */
export const FLING_COAST = 1.4;
/** Rim hits slower than these make no splash (free / being held). */
export const IMPACT_MIN_FREE = 0.28;
export const IMPACT_MIN_HELD = 0.56;
/** A poke's push, in radii per second. */
export const POKE_SPEED = 1.7;
/** Seconds without interaction before Wisp dozes off. */
export const SLEEP_AFTER = 50;
/** Seconds without interaction before a burst bubble re-forms around Wisp. */
export const OPEN_FOR = 120;
/** How hard the bursting bubble launches Wisp, and how long it coasts afterwards. */
export const BURST_SPEED = 7.5;
export const BURST_COAST = 2.2;

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /**
   * How close the bubble's wall is to bursting, 0 to 1. It builds while
   * someone holds Wisp pressed into the wall, and heals slowly otherwise.
   */
  strain?: number;
}

export interface Forces {
  /** Shared clock (seconds). The drift and tricks are functions of it, so all screens agree. */
  t: number;
  /** Where the holder's pointer is, when someone is holding Wisp. */
  target?: Point;
  asleep: boolean;
  /** Until this time the drift barely pulls: Wisp is still flying from a throw. */
  flingUntil: number;
  /** A trick Wisp is doing (or about to do). Ignored while held or asleep. */
  trick?: Trick;
  /** The bubble has burst: Wisp has the whole open arena. */
  open?: boolean;
}

export interface Impact {
  /** Outward normal at the hit point (unit vector). */
  nx: number;
  ny: number;
  /** Speed into the wall. */
  speed: number;
  held: boolean;
  /** Wisp wasn't touching the wall a moment ago: a real hit, not a hand pressing it there. */
  fresh: boolean;
}

const SPRING = 520;
const SPRING_DAMPING = 2 * Math.sqrt(SPRING) * 0.75;
const TRICK_SPRING = 210;
const TRICK_DAMPING = 2 * Math.sqrt(TRICK_SPRING) * 0.72;
const BOUNCE_FREE = 0.82;
const BOUNCE_HELD = 0.3;

/** Strain per second while pressed into the wall: a base, plus more the harder the push. */
const STRAIN_BASE = 0.2;
const STRAIN_PUSH = 0.4;
/** Pushes shallower than this don't count; the wall needs a real shove. */
const STRAIN_MIN_PUSH = 0.04;
/** How fast cracks heal once nobody's pushing, per second. */
const STRAIN_HEAL = 0.18;
/** Thrown hits can crack the wall a little, but never this far on their own. */
const STRAIN_FREE_CAP = 0.5;

/** The slowly moving point Wisp drifts around when nobody is holding it. */
export function wanderPoint(t: number, open = false): Point {
  const k = arenaScale(open);
  return {
    x: (0.32 * Math.sin(t * 0.13 + 1.3) + 0.12 * Math.sin(t * 0.41)) * k.x,
    y: (0.26 * Math.cos(t * 0.17 + 0.4) + 0.1 * Math.cos(t * 0.37 + 2)) * k.y,
  };
}

function springTo(body: Body, p: Point, k: number, damping: number, dt: number): void {
  body.vx += ((p.x - body.x) * k - body.vx * damping) * dt;
  body.vy += ((p.y - body.y) * k - body.vy * damping) * dt;
}

function touchingWall(body: Body, open: boolean): boolean {
  if (open) return Math.abs(body.x) >= OPEN_HALF_W - ORB_RADIUS - 1e-9 || Math.abs(body.y) >= OPEN_HALF_H - ORB_RADIUS - 1e-9;
  return Math.hypot(body.x, body.y) >= LIMIT - 1e-9;
}

/** Keeps Wisp inside its space; returns the hit if it was moving into a wall. */
function contain(body: Body, open: boolean, held: boolean, fresh: boolean): Impact | undefined {
  const e = held ? BOUNCE_HELD : BOUNCE_FREE;
  let nx = 0;
  let ny = 0;
  if (open) {
    const mx = OPEN_HALF_W - ORB_RADIUS;
    const my = OPEN_HALF_H - ORB_RADIUS;
    if (Math.abs(body.x) > mx) {
      nx = Math.sign(body.x);
      body.x = nx * mx;
    }
    if (Math.abs(body.y) > my) {
      ny = Math.sign(body.y);
      body.y = ny * my;
    }
    if (nx === 0 && ny === 0) return undefined;
    const into = Math.max(nx * body.vx, ny * body.vy, 0);
    if (nx !== 0 && nx * body.vx > 0) body.vx = -e * body.vx;
    if (ny !== 0 && ny * body.vy > 0) body.vy = -e * body.vy;
    if (into <= 0) return undefined;
    const n = Math.hypot(nx, ny);
    return { nx: nx / n, ny: ny / n, speed: into, held, fresh };
  }

  const d = Math.hypot(body.x, body.y);
  if (d <= LIMIT) return undefined;
  nx = body.x / d;
  ny = body.y / d;
  body.x = nx * LIMIT;
  body.y = ny * LIMIT;
  const vn = body.vx * nx + body.vy * ny;
  if (vn <= 0) return undefined;
  body.vx -= (1 + e) * vn * nx;
  body.vy -= (1 + e) * vn * ny;
  if (held) {
    // Pinned against the wall by a hand: let it slide only a little.
    const keep = Math.exp(-6 * STEP);
    const vt = -body.vx * ny + body.vy * nx;
    body.vx += -ny * vt * (keep - 1);
    body.vy += nx * vt * (keep - 1);
  }
  return { nx, ny, speed: vn, held, fresh };
}

/** How far past the wall the holder is shoving Wisp, measured straight out from where Wisp touches it. */
export function wallPush(body: Body, target: Point | undefined): number {
  if (!target) return 0;
  const d = Math.hypot(body.x, body.y);
  if (d < LIMIT - 0.002) return 0;
  return (target.x * body.x + target.y * body.y) / d - LIMIT;
}

/**
 * Advances `body` by one fixed step (mutates it). Returns the wall hit, if
 * Wisp touched a wall while moving into it.
 */
export function step(body: Body, f: Forces): Impact | undefined {
  const dt = STEP;
  const open = f.open === true;
  const held = f.target !== undefined;
  const trickAt = !held && !f.asleep && f.trick ? trickTarget(f.trick, f.t, open) : undefined;
  const wasTouching = touchingWall(body, open);
  if (f.target) {
    // A spring toward the pointer, even past the rim, so a hard shove slams Wisp into the wall.
    springTo(body, f.target, SPRING, SPRING_DAMPING, dt);
  } else if (trickAt) {
    springTo(body, trickAt, TRICK_SPRING, TRICK_DAMPING, dt);
  } else {
    const calm = f.asleep ? 0.25 : 1;
    const pull = f.t < f.flingUntil ? 0.08 : 1;
    const w = wanderPoint(f.t, open);
    body.vx += (w.x - body.x) * 0.55 * calm * pull * dt;
    body.vy += ((w.y - body.y) * 0.55 * calm * pull + Math.sin(f.t * 1.6) * 0.024 * calm) * dt;
    const drag = Math.exp(-(f.asleep ? 1.8 : 0.9) * dt);
    body.vx *= drag;
    body.vy *= drag;
  }
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  const hit = contain(body, open, held, !wasTouching);

  if (open) {
    if (body.strain) body.strain = 0;
  } else {
    let s = body.strain ?? 0;
    const push = wallPush(body, f.target);
    if (push > STRAIN_MIN_PUSH) s += (STRAIN_BASE + STRAIN_PUSH * Math.min(push, 0.6)) * dt;
    else s -= STRAIN_HEAL * dt;
    if (hit && isSplash(hit)) {
      if (held) s += Math.min(0.1, hit.speed * 0.02);
      else s = Math.min(s + Math.min(0.1, hit.speed * 0.012), Math.max(s, STRAIN_FREE_CAP));
    }
    s = Math.max(0, Math.min(1, s));
    if (s > 0 || body.strain !== undefined) body.strain = s;
  }
  return hit;
}

/** True when the impact is a real hit, hard enough to deserve a splash. */
export function isSplash(impact: Impact): boolean {
  return impact.fresh && impact.speed > (impact.held ? IMPACT_MIN_HELD : IMPACT_MIN_FREE);
}

/** True once the wall has taken all it can: the bubble bursts. */
export function isBursting(body: Body): boolean {
  return (body.strain ?? 0) >= 1;
}

/**
 * The bubble bursts: Wisp shoots out through where the wall was (mutates
 * `body`). The caller opens the arena and lets go of Wisp.
 */
export function burstLaunch(body: Body): void {
  const d = Math.hypot(body.x, body.y) || 1;
  const nx = d > 0.01 ? body.x / d : 1;
  const ny = d > 0.01 ? body.y / d : 0;
  body.vx = nx * BURST_SPEED;
  body.vy = ny * BURST_SPEED;
  body.strain = 0;
}

/**
 * Advances `body` from time `from` to `to` in fixed steps (mutates it).
 * Returns the hardest impact on the way, if any (real hits first). Long gaps are capped so a
 * stale state can't stall a frame.
 */
export function advance(body: Body, from: number, to: number, forces: Omit<Forces, "t">, maxSeconds = 2): Impact | undefined {
  const span = Math.min(maxSeconds, Math.max(0, to - from));
  const steps = Math.floor(span / STEP);
  let hardest: Impact | undefined;
  for (let i = 0; i < steps; i++) {
    const hit = step(body, { ...forces, t: from + i * STEP });
    // Real hits beat a hand pressing Wisp into the wall, whatever the speed.
    if (hit && (!hardest || (hit.fresh && !hardest.fresh) || (hit.fresh === hardest.fresh && hit.speed > hardest.speed))) hardest = hit;
  }
  return hardest;
}

/** Clamps a throw to MAX_FLING and a position to inside Wisp's space. */
export function sanitize(body: Body, open = false): Body {
  const out = { ...body };
  for (const k of ["x", "y", "vx", "vy"] as const) if (!Number.isFinite(out[k])) out[k] = 0;
  const p = clampToArena(out, open);
  out.x = p.x;
  out.y = p.y;
  const s = Math.hypot(out.vx, out.vy);
  if (s > MAX_FLING) {
    out.vx *= MAX_FLING / s;
    out.vy *= MAX_FLING / s;
  }
  if (out.strain !== undefined) out.strain = Number.isFinite(out.strain) ? Math.max(0, Math.min(1, out.strain)) : 0;
  return out;
}

/** The push a poke gives, at an angle. */
export function pokeImpulse(angle: number): { vx: number; vy: number } {
  return { vx: Math.cos(angle) * POKE_SPEED, vy: Math.sin(angle) * POKE_SPEED };
}
