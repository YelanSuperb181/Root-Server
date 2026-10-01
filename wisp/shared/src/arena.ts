// The space Wisp lives in. Normally a round bubble of radius 1 centered on
// (0, 0); once someone bursts it, a wide open rectangle around where the
// bubble was. Everything is in domain units: the bubble's radius is 1.

/** Wisp's own radius. */
export const ORB_RADIUS = 0.085;
/** Furthest Wisp's center can get from the middle of the bubble before touching the rim. */
export const LIMIT = 1 - ORB_RADIUS;
/** Half the width and height of the open arena, after the bubble bursts. */
export const OPEN_HALF_W = 2;
export const OPEN_HALF_H = 1.25;
/** How much further than the wall a holder's pointer counts (that's how you slam Wisp). */
export const REACH = 0.6;

export interface Point {
  x: number;
  y: number;
}

/** Keeps a point inside the space Wisp's center can reach, with an optional margin past the wall. */
export function clampToArena(p: Point, open: boolean, margin = 0): Point {
  const x = Number.isFinite(p.x) ? p.x : 0;
  const y = Number.isFinite(p.y) ? p.y : 0;
  if (open) {
    const mx = OPEN_HALF_W - ORB_RADIUS + margin;
    const my = OPEN_HALF_H - ORB_RADIUS + margin;
    return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  }
  const max = LIMIT + margin;
  const d = Math.hypot(x, y);
  return d > max ? { x: (x * max) / d, y: (y * max) / d } : { x, y };
}

/** Where a holder's pointer may pull Wisp to: past the wall a little, not absurdly far. */
export function clampTarget(p: Point, open = false): Point {
  return clampToArena(p, open, REACH);
}

/** How far the open arena stretches a path drawn for the bubble. */
export function arenaScale(open: boolean): Point {
  return open ? { x: 1.9, y: 1.2 } : { x: 1, y: 1 };
}
