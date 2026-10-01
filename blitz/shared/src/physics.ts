// Blitz's physics. The server runs it as the source of truth and every open
// domain runs the same code to predict motion between updates, so a fling
// lands in the same place on every screen.
//
// Units: the bubble is a circle of radius 1 centered on (0, 0) (see arena.ts).
// Speeds are in radii per second, time in seconds. Rendering scales
// everything to pixels.

import { LIMIT, OPEN_LIMIT, Point, arenaScale, clampToArena } from "./arena";
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
/** Seconds without interaction before Blitz dozes off. */
export const SLEEP_AFTER = 50;
/** Seconds without interaction before a burst bubble re-forms around Blitz. */
export const OPEN_FOR = 120;
/** How hard the bursting bubble launches Blitz, and how long it coasts afterwards. */
export const BURST_SPEED = 7.5;
export const BURST_COAST = 2.2;

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /**
   * How close the bubble's wall is to bursting, 0 to 1. It builds while
   * someone holds Blitz pressed into the wall, and heals slowly otherwise.
   */
  strain?: number;
}

export interface Forces {
  /** Shared clock (seconds). The drift and tricks are functions of it, so all screens agree. */
  t: number;
  /** Where the holder's pointer is, when someone is holding Blitz. */
  target?: Point;
  asleep: boolean;
  /** Until this time the drift barely pulls: Blitz is still flying from a throw. */
  flingUntil: number;
  /** A trick Blitz is doing (or about to do). Ignored while held or asleep. */
  trick?: Trick;
  /** The bubble has burst: Blitz is loose in open space. */
  open?: boolean;
  /** In open space, the spot Blitz drifts around (where it was last flung or let go). */
  anchor?: Point;
}

export interface Impact {
  /** Outward normal at the hit point (unit vector). */
  nx: number;
  ny: number;
  /** Speed into the wall. */
  speed: number;
  held: boolean;
  /** Blitz wasn't touching the wall a moment ago: a real hit, not a hand pressing it there. */
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
/** In open space the drift pulls gently, however far Blitz is from its anchor. */
const OPEN_PULL_MAX = 0.9;
/** How far a throw in open space carries, as seconds of its speed: where Blitz will settle. */
const OPEN_CARRY = 0.8;

/** The slowly moving point Blitz drifts around when nobody is holding it. */
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
  return !open && Math.hypot(body.x, body.y) >= LIMIT - 1e-9;
}

/** Keeps Blitz inside its space; returns the hit if it was moving into a wall. */
function contain(body: Body, open: boolean, held: boolean, fresh: boolean): Impact | undefined {
  const e = held ? BOUNCE_HELD : BOUNCE_FREE;
  let nx = 0;
  let ny = 0;
  if (open) {
    // No walls out here; only a far-off limit that quietly stops Blitz drifting forever.
    const far = Math.hypot(body.x, body.y);
    if (far > OPEN_LIMIT) {
      body.x *= OPEN_LIMIT / far;
      body.y *= OPEN_LIMIT / far;
      const out = (body.vx * body.x + body.vy * body.y) / OPEN_LIMIT;
      if (out > 0) {
        body.vx -= (out * body.x) / OPEN_LIMIT;
        body.vy -= (out * body.y) / OPEN_LIMIT;
      }
    }
    return undefined;
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

/** How far past the wall the holder is shoving Blitz, measured straight out from where Blitz touches it. */
export function wallPush(body: Body, target: Point | undefined): number {
  if (!target) return 0;
  const d = Math.hypot(body.x, body.y);
  if (d < LIMIT - 0.002) return 0;
  return (target.x * body.x + target.y * body.y) / d - LIMIT;
}

/**
 * Advances `body` by one fixed step (mutates it). Returns the wall hit, if
 * Blitz touched a wall while moving into it.
 */
export function step(body: Body, f: Forces): Impact | undefined {
  const dt = STEP;
  const open = f.open === true;
  const held = f.target !== undefined;
  const center = open && f.anchor ? f.anchor : { x: 0, y: 0 };
  const trickAt = !held && !f.asleep && f.trick ? trickTarget(f.trick, f.t, open, center) : undefined;
  const wasTouching = touchingWall(body, open);
  if (f.target) {
    // A spring toward the pointer, even past the rim, so a hard shove slams Blitz into the wall.
    springTo(body, f.target, SPRING, SPRING_DAMPING, dt);
  } else if (trickAt) {
    springTo(body, trickAt, TRICK_SPRING, TRICK_DAMPING, dt);
  } else {
    const calm = f.asleep ? 0.25 : 1;
    const pull = f.t < f.flingUntil ? 0.08 : 1;
    const w = wanderPoint(f.t, open);
    let ax = (w.x + center.x - body.x) * 0.55 * calm * pull;
    let ay = (w.y + center.y - body.y) * 0.55 * calm * pull;
    const a = Math.hypot(ax, ay);
    if (open && a > OPEN_PULL_MAX) {
      ax *= OPEN_PULL_MAX / a;
      ay *= OPEN_PULL_MAX / a;
    }
    body.vx += ax * dt;
    body.vy += (ay + Math.sin(f.t * 1.6) * 0.024 * calm) * dt;
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
 * The bubble bursts: Blitz shoots out through where the wall was (mutates
 * `body`). The caller opens the arena and lets go of Blitz.
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
 * Where Blitz will settle in open space after being let go: a hard throw
 * carries it far, a gentle release leaves it where it is.
 */
export function landingPoint(body: Body): Point {
  const fast = Math.hypot(body.vx, body.vy) > FLING_SPEED;
  return clampToArena(fast ? { x: body.x + body.vx * OPEN_CARRY, y: body.y + body.vy * OPEN_CARRY } : { x: body.x, y: body.y }, true);
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
    // Real hits beat a hand pressing Blitz into the wall, whatever the speed.
    if (hit && (!hardest || (hit.fresh && !hardest.fresh) || (hit.fresh === hardest.fresh && hit.speed > hardest.speed))) hardest = hit;
  }
  return hardest;
}

/** Clamps a throw to MAX_FLING and a position to inside Blitz's space. */
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
