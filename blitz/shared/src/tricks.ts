// Blitz's tricks: little flights it does on its own, or when someone talks to
// it. Each trick is a path in time; Blitz chases a point moving along it. The
// path depends only on the trick (kind, start time, where Blitz was, which way
// round), so it flies the same however fast the screen draws.

import { Point, arenaScale, clampToArena } from "./arena";

/** Each trick and how long it lasts, in seconds. */
export const TRICKS = {
  /** Laps around the domain, fast. */
  zoom: 1.9,
  /** A loop-de-loop. */
  loop: 1.3,
  /** Spins on the spot. */
  spin: 1.1,
  /** Happy bounces. */
  hop: 1.3,
  /** A little shimmy. */
  wiggle: 1,
  /** Side to side, with hops. */
  dance: 2.2,
  /** Zigzags across the domain. */
  zigzag: 1.8,
  /** Draws a heart in the air. */
  heart: 2.8,
  /** Darts to the far side and stays there. */
  dash: 1.1,
  /** Ducks to the edge, then peeks out. */
  shy: 1.8,
  /** Comes to the middle and bobs there. */
  approach: 1.4,
} as const;

export type TrickKind = keyof typeof TRICKS;

export interface Trick {
  kind: TrickKind;
  /** Shared clock time the trick starts (it may be a moment in the future). */
  start: number;
  /** Where Blitz was when the trick was chosen. */
  x: number;
  y: number;
  /** Which way round: 1 or -1. */
  dir: number;
}

export function isTrick(kind: string): kind is TrickKind {
  return Object.prototype.hasOwnProperty.call(TRICKS, kind);
}

/** Seconds since the trick started, or undefined when it isn't running at time `t`. */
export function trickAge(trick: Trick, t: number): number | undefined {
  const age = t - trick.start;
  return age >= 0 && age < TRICKS[trick.kind] ? age : undefined;
}

const smooth = (u: number) => u * u * (3 - 2 * u);
const lerp = (a: Point, b: Point, k: number): Point => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
/** -1..1 triangle wave with period 1. */
const tri = (v: number) => 1 - 4 * Math.abs(v - Math.floor(v + 0.5));

/** A path that starts somewhere else: Blitz first swoops from where it was to the start (the lead). */
function led(o: Point, u: number, lead: number, path: (v: number) => Point): Point {
  if (u < lead) return lerp(o, path(0), smooth(u / lead));
  return path((u - lead) / (1 - lead));
}

/**
 * The point Blitz is chasing during a trick at time `t`, or undefined when no
 * trick is running. Paths that roam the whole domain are drawn around
 * `center`: the middle of the bubble, or in open space wherever Blitz has
 * settled.
 */
export function trickTarget(trick: Trick, t: number, open: boolean, center: Point = { x: 0, y: 0 }): Point | undefined {
  const age = trickAge(trick, t);
  if (age === undefined) return undefined;
  const u = age / TRICKS[trick.kind];
  const k = arenaScale(open);
  const c = open ? center : { x: 0, y: 0 };
  const o = { x: trick.x - c.x, y: trick.y - c.y };
  const d = trick.dir < 0 ? -1 : 1;
  const TAU = Math.PI * 2;
  let p: Point;
  switch (trick.kind) {
    case "zoom": {
      const a0 = Math.hypot(o.x, o.y) > 0.05 ? Math.atan2(o.y, o.x) : 0;
      p = led(o, u, 0.12, (v) => {
        const a = a0 + d * TAU * 1.5 * smooth(v);
        return { x: Math.cos(a) * 0.62 * k.x, y: Math.sin(a) * 0.62 * k.y };
      });
      break;
    }
    case "loop": {
      const r = 0.2 * k.y;
      p = { x: o.x + d * r * Math.sin(TAU * u), y: o.y - r + r * Math.cos(TAU * u) };
      break;
    }
    case "spin": {
      const a = d * TAU * 3 * u;
      p = { x: o.x + 0.05 * (Math.cos(a) - 1), y: o.y + 0.05 * Math.sin(a) };
      break;
    }
    case "hop":
      p = { x: o.x, y: o.y - 0.2 * k.y * Math.abs(Math.sin(3 * Math.PI * u)) * (1 - 0.5 * u) };
      break;
    case "wiggle":
      p = { x: o.x + 0.07 * Math.sin(TAU * 5 * u) * (1 - u), y: o.y };
      break;
    case "dance":
      p = { x: o.x + d * 0.18 * k.x * Math.sin(TAU * 2 * u), y: o.y - 0.1 * k.y * Math.abs(Math.sin(TAU * 4 * u)) };
      break;
    case "zigzag":
      p = led(o, u, 0.15, (v) => ({ x: d * (-0.6 + 1.2 * v) * k.x, y: 0.3 * k.y * tri(4 * v) }));
      break;
    case "heart":
      p = led(o, u, 0.12, (v) => {
        const s = TAU * v;
        const hx = 16 * Math.sin(s) ** 3;
        const hy = -(13 * Math.cos(s) - 5 * Math.cos(2 * s) - 2 * Math.cos(3 * s) - Math.cos(4 * s));
        return { x: d * hx * 0.031 * k.y, y: hy * 0.031 * k.y + 0.06 };
      });
      break;
    case "dash": {
      const r = Math.hypot(o.x, o.y);
      const away = r > 0.15 ? { x: -o.x / r, y: -o.y / r } : { x: d, y: 0 };
      p = led(o, u, 0.35, () => ({ x: away.x * 0.68 * k.x, y: away.y * 0.68 * k.y }));
      break;
    }
    case "shy": {
      const edge = { x: d * 0.66 * k.x, y: 0.32 * k.y };
      p = led(o, u, 0.3, (v) => ({ x: edge.x - d * 0.09 * Math.max(0, Math.sin(Math.PI * v)), y: edge.y }));
      break;
    }
    case "approach":
      p = led(o, u, 0.45, (v) => ({ x: 0, y: 0.08 * k.y + 0.03 * Math.sin(TAU * 2 * v) }));
      break;
  }
  return clampToArena({ x: p.x + c.x, y: p.y + c.y }, open, -0.03);
}

/** Blitz's own idea of what to do next, when nobody's playing with it. Weighted toward small things. */
export function idleTrick(rand: () => number = Math.random): TrickKind {
  const pool: Array<[TrickKind, number]> = [
    ["hop", 3],
    ["loop", 3],
    ["spin", 2],
    ["wiggle", 2],
    ["zoom", 2],
    ["dance", 1],
    ["zigzag", 1],
    ["heart", 0.5],
  ];
  const total = pool.reduce((n, [, w]) => n + w, 0);
  let r = rand() * total;
  for (const [kind, w] of pool) {
    r -= w;
    if (r < 0) return kind;
  }
  return "hop";
}
