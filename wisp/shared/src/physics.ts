// Wisp's physics. The server runs it as the source of truth and every open
// domain runs the same code to predict motion between updates, so a fling
// lands in the same place on every screen.
//
// Units: the domain is a circle of radius 1 centered on (0, 0). Speeds are in
// radii per second, time in seconds. Rendering scales everything to pixels.

/** Wisp's own radius. */
export const ORB_RADIUS = 0.085;
/** Furthest Wisp's center can get from the middle before touching the rim. */
export const LIMIT = 1 - ORB_RADIUS;
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
export const SLEEP_AFTER = 22;

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Forces {
  /** Shared clock (seconds). The drift is a function of it, so all screens agree. */
  t: number;
  /** Where the holder's pointer is, when someone is holding Wisp. */
  target?: { x: number; y: number };
  asleep: boolean;
  /** Until this time the drift barely pulls: Wisp is still flying from a throw. */
  flingUntil: number;
}

export interface Impact {
  /** Outward normal at the hit point (unit vector). */
  nx: number;
  ny: number;
  /** Speed into the rim. */
  speed: number;
  held: boolean;
}

const SPRING = 520;
const SPRING_DAMPING = 2 * Math.sqrt(SPRING) * 0.75;
const BOUNCE_FREE = 0.82;
const BOUNCE_HELD = 0.3;

/** The slowly moving point Wisp drifts around when nobody is holding it. */
export function wanderPoint(t: number): { x: number; y: number } {
  return {
    x: 0.32 * Math.sin(t * 0.13 + 1.3) + 0.12 * Math.sin(t * 0.41),
    y: 0.26 * Math.cos(t * 0.17 + 0.4) + 0.1 * Math.cos(t * 0.37 + 2),
  };
}

/**
 * Advances `body` by one fixed step (mutates it). Returns the rim hit, if
 * Wisp touched the wall while moving into it.
 */
export function step(body: Body, f: Forces): Impact | undefined {
  const dt = STEP;
  const held = f.target !== undefined;
  if (f.target) {
    // A spring toward the pointer, even past the rim, so a hard shove slams Wisp into the wall.
    body.vx += ((f.target.x - body.x) * SPRING - body.vx * SPRING_DAMPING) * dt;
    body.vy += ((f.target.y - body.y) * SPRING - body.vy * SPRING_DAMPING) * dt;
  } else {
    const calm = f.asleep ? 0.25 : 1;
    const pull = f.t < f.flingUntil ? 0.08 : 1;
    const w = wanderPoint(f.t);
    body.vx += (w.x - body.x) * 0.55 * calm * pull * dt;
    body.vy += ((w.y - body.y) * 0.55 * calm * pull + Math.sin(f.t * 1.6) * 0.024 * calm) * dt;
    const drag = Math.exp(-(f.asleep ? 1.8 : 0.9) * dt);
    body.vx *= drag;
    body.vy *= drag;
  }
  body.x += body.vx * dt;
  body.y += body.vy * dt;

  const d = Math.hypot(body.x, body.y);
  if (d <= LIMIT) return undefined;
  const nx = body.x / d;
  const ny = body.y / d;
  body.x = nx * LIMIT;
  body.y = ny * LIMIT;
  const vn = body.vx * nx + body.vy * ny;
  if (vn <= 0) return undefined;
  const e = held ? BOUNCE_HELD : BOUNCE_FREE;
  body.vx -= (1 + e) * vn * nx;
  body.vy -= (1 + e) * vn * ny;
  if (held) {
    // Pinned against the wall by a hand: let it slide only a little.
    const keep = Math.exp(-6 * dt);
    const vt = -body.vx * ny + body.vy * nx;
    body.vx += -ny * vt * (keep - 1);
    body.vy += nx * vt * (keep - 1);
  }
  return { nx, ny, speed: vn, held };
}

/** True when the impact is hard enough to deserve a splash. */
export function isSplash(impact: Impact): boolean {
  return impact.speed > (impact.held ? IMPACT_MIN_HELD : IMPACT_MIN_FREE);
}

/**
 * Advances `body` from time `from` to `to` in fixed steps (mutates it).
 * Returns the hardest impact on the way, if any. Long gaps are capped so a
 * stale state can't stall a frame.
 */
export function advance(body: Body, from: number, to: number, forces: Omit<Forces, "t">, maxSeconds = 2): Impact | undefined {
  const span = Math.min(maxSeconds, Math.max(0, to - from));
  const steps = Math.floor(span / STEP);
  let hardest: Impact | undefined;
  for (let i = 0; i < steps; i++) {
    const hit = step(body, { ...forces, t: from + i * STEP });
    if (hit && (!hardest || hit.speed > hardest.speed)) hardest = hit;
  }
  return hardest;
}

/** Clamps a throw to MAX_FLING and a position to inside the domain. */
export function sanitize(body: Body): Body {
  const out = { ...body };
  for (const k of ["x", "y", "vx", "vy"] as const) if (!Number.isFinite(out[k])) out[k] = 0;
  const d = Math.hypot(out.x, out.y);
  if (d > LIMIT) {
    out.x *= LIMIT / d;
    out.y *= LIMIT / d;
  }
  const s = Math.hypot(out.vx, out.vy);
  if (s > MAX_FLING) {
    out.vx *= MAX_FLING / s;
    out.vy *= MAX_FLING / s;
  }
  return out;
}

/** The push a poke gives, at an angle. */
export function pokeImpulse(angle: number): { vx: number; vy: number } {
  return { vx: Math.cos(angle) * POKE_SPEED, vy: Math.sin(angle) * POKE_SPEED };
}
