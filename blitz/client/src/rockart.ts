// How space rocks are drawn: flat and cartoony, to sit next to Blitz. A
// lumpy, rounded outline, one crisp shadow on the side away from the light, a
// bright edge on the side toward it, a few craters, and a dark ink outline.
// The light is the far-off sun (upper left, like the planet) until Blitz
// comes close, then Blitz's own glow takes over and the shadow swings away
// from it as it passes.

import { RGB, rgba } from "./fx";

export interface RockPalette {
  body: string;
  /** The bright edge on the lit side. */
  light: string;
  /** Crater floors, and the shaded inner wall of a crater. */
  floor: string;
  wall: string;
  /** The shadow laid over the side away from the light. */
  shadow: string;
  ink: string;
}

export const ROCK_PALETTES: RockPalette[] = [
  // Slate
  { body: "#5D6485", light: "#A3ACD2", floor: "#4E5574", wall: "#363B59", shadow: "rgba(17, 14, 44, 0.55)", ink: "rgba(9, 10, 30, 0.75)" },
  // Mauve
  { body: "#6B5C7C", light: "#BBA6CB", floor: "#5B4D6B", wall: "#3E3352", shadow: "rgba(20, 12, 42, 0.55)", ink: "rgba(12, 8, 30, 0.75)" },
  // Dusky blue
  { body: "#4F6580", light: "#97B8D2", floor: "#43576F", wall: "#2D3C53", shadow: "rgba(12, 16, 42, 0.55)", ink: "rgba(7, 11, 28, 0.75)" },
];

/** Far-off rocks, half lost in the dark: low contrast and no outline. */
export const FAR_PALETTE: RockPalette = {
  body: "#2C3150",
  light: "#545D88",
  floor: "#262A45",
  wall: "#1B1F36",
  shadow: "rgba(8, 9, 26, 0.5)",
  ink: "rgba(0, 0, 0, 0)",
};

export interface RockArt {
  /** The outline: how far out the edge is (times the radius) at evenly spaced angles. */
  verts: number[];
  /** A little oblong, along the rock's own x axis. */
  long: number;
  /** Angle and distance from the middle (times the radius), and size (times the radius). */
  craters: Array<[number, number, number]>;
  /** Crystal clusters: angle around the edge, size (times the radius), cyan or violet. */
  crystals: Array<[number, number, boolean]>;
  palette: RockPalette;
}

/** A rock's looks, from a source of numbers in [0, 1) that's the same every time for that rock. */
export function makeRockArt(u: (n: number) => number, crystal: boolean, palette?: RockPalette): RockArt {
  const n = 9;
  const raw = Array.from({ length: n }, (_, i) => 0.8 + 0.3 * u(i));
  // A bite or two out of it, for character.
  raw[Math.floor(u(20) * n)] -= 0.14;
  if (u(22) < 0.5) raw[Math.floor(u(21) * n)] -= 0.1;
  const verts = raw.map((v, i) => (raw[(i + n - 1) % n] + 4 * v + raw[(i + 1) % n]) / 6);
  const craters: Array<[number, number, number]> = [];
  const want = 1 + Math.floor(u(40) * 3);
  for (let k = 0; k < want * 3 && craters.length < want; k++) {
    const c: [number, number, number] = [u(41 + k) * Math.PI * 2, 0.15 + 0.45 * u(60 + k), 0.13 + 0.13 * u(80 + k)];
    // Craters don't overlap each other.
    const overlaps = craters.some(([a, d, r]) => {
      const dx = Math.cos(a) * d - Math.cos(c[0]) * c[1];
      const dy = Math.sin(a) * d - Math.sin(c[0]) * c[1];
      return Math.hypot(dx, dy) < (r + c[2]) * 1.15;
    });
    if (!overlaps) craters.push(c);
  }
  const crystals: Array<[number, number, boolean]> = crystal
    ? Array.from({ length: 1 + Math.floor(u(100) * 2) }, (_, k) => [u(101 + k) * Math.PI * 2 + k * Math.PI, 0.5 + 0.2 * u(110 + k), u(120) < 0.55] as [number, number, boolean])
    : [];
  return {
    verts,
    long: 1 + 0.22 * u(130),
    craters,
    crystals,
    palette: palette ?? ROCK_PALETTES[Math.floor(u(131) * ROCK_PALETTES.length)],
  };
}

export interface RockLight {
  /** Unit vector pointing toward where the light comes from, on screen. */
  lx: number;
  ly: number;
  /** Blitz's glow: how strong (0..1), its color, and which way it is (unit vector). */
  glow: number;
  tint: RGB;
  gx: number;
  gy: number;
  /** A white flash when Blitz has just hit it (0..1). */
  flash: number;
}

/** Where the far-off sun is, as seen from any rock. */
export const SUN = { x: -0.6, y: -0.8 };

const CYAN_SHARD = ["#C9F7FF", "#62CDEA", [120, 230, 255]] as const;
const VIOLET_SHARD = ["#EBDDFF", "#9E7FE3", [190, 150, 255]] as const;

/** Draws a rock with its middle at (x, y), radius `R` px, turned by `angle`. */
export function drawRockArt(ctx: CanvasRenderingContext2D, art: RockArt, x: number, y: number, R: number, angle: number, light: RockLight, t: number): void {
  const { verts, palette } = art;
  const n = verts.length;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // The outline's corner points, turned with the rock.
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const px = Math.cos(a) * R * verts[i] * art.long;
    const py = Math.sin(a) * R * verts[i];
    pts.push([x + px * cos - py * sin, y + px * sin + py * cos]);
  }
  const body = new Path2D();
  outline(body, pts, 0, 0);
  // Everything outside the outline shifted by (dx, dy): a crescent once clipped to the rock.
  const crescent = (dx: number, dy: number) => {
    const p = new Path2D();
    p.rect(x - R * 3, y - R * 3, R * 6, R * 6);
    outline(p, pts, dx, dy);
    return p;
  };

  ctx.save();
  // Crystals first, so the rock hides their roots and they seem to grow out of it.
  for (const [a, size, cyan] of art.crystals) drawCrystals(ctx, art, x, y, R, angle, a, size, cyan ? CYAN_SHARD : VIOLET_SHARD, t);

  ctx.fillStyle = palette.body;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  const { lx, ly } = light;
  for (const [a, d, cr] of art.craters) {
    const ca = a + angle;
    const cx = x + Math.cos(ca) * d * R * art.long;
    const cy = y + Math.sin(ca) * d * R;
    // Seen at a slant near the edge, so squashed toward the middle.
    const rx = cr * R * (0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - d * d)));
    const ry = cr * R;
    const crater = new Path2D();
    crater.ellipse(cx, cy, rx, ry, ca, 0, Math.PI * 2);
    ctx.fillStyle = palette.wall;
    ctx.fill(crater);
    // The floor, pushed away from the light: the wall nearest the light stays in shade.
    ctx.save();
    ctx.clip(crater);
    ctx.fillStyle = palette.floor;
    ctx.beginPath();
    ctx.ellipse(cx - lx * ry * 0.38, cy - ly * ry * 0.38, rx, ry, ca, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // The far lip catches the light.
    const far = Math.atan2(-ly, -lx) - ca;
    ctx.strokeStyle = palette.light;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = Math.max(1, ry * 0.16);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, ca, far - 0.9, far + 0.9);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // The shadow side: everything the rock, nudged toward the light, doesn't cover.
  ctx.fillStyle = palette.shadow;
  ctx.fill(crescent(lx * R * 0.3, ly * R * 0.3), "evenodd");
  // The bright edge on the lit side.
  ctx.fillStyle = palette.light;
  ctx.globalAlpha = 0.55;
  ctx.fill(crescent(-lx * R * 0.09, -ly * R * 0.09), "evenodd");
  ctx.globalAlpha = 1;
  if (light.glow > 0.01) {
    // Blitz's glow: a soft wash of its color, and a bright rim on the side facing it.
    ctx.globalCompositeOperation = "screen";
    const wash = ctx.createRadialGradient(x + light.gx * R, y + light.gy * R, 0, x + light.gx * R, y + light.gy * R, R * 1.6);
    wash.addColorStop(0, rgba(light.tint, 0.4 * light.glow));
    wash.addColorStop(1, rgba(light.tint, 0));
    ctx.fillStyle = wash;
    ctx.fillRect(x - R * 1.5, y - R * 1.5, R * 3, R * 3);
    ctx.fillStyle = rgba(light.tint, 0.85 * light.glow);
    ctx.fill(crescent(-light.gx * R * 0.1, -light.gy * R * 0.1), "evenodd");
  }
  if (light.flash > 0.01) {
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * light.flash})`;
    ctx.fill(body);
  }
  ctx.restore();

  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = Math.max(1.2, R * 0.045);
  ctx.lineJoin = "round";
  ctx.stroke(body);
  ctx.restore();
}

/** A rounded closed curve through the midpoints of `pts`, shifted by (dx, dy). */
function outline(path: Path2D, pts: Array<[number, number]>, dx: number, dy: number): void {
  const n = pts.length;
  const mid = (i: number): [number, number] => {
    const [ax, ay] = pts[i % n];
    const [bx, by] = pts[(i + 1) % n];
    return [(ax + bx) / 2 + dx, (ay + by) / 2 + dy];
  };
  const [sx, sy] = mid(n - 1);
  path.moveTo(sx, sy);
  for (let i = 0; i < n; i++) {
    const [mx, my] = mid(i);
    path.quadraticCurveTo(pts[i][0] + dx, pts[i][1] + dy, mx, my);
  }
  path.closePath();
}

/** A little cluster of crystal shards poking out of the rock's edge at angle `a`. */
function drawCrystals(
  ctx: CanvasRenderingContext2D,
  art: RockArt,
  x: number,
  y: number,
  R: number,
  angle: number,
  a: number,
  size: number,
  [lightFace, darkFace, glow]: readonly [string, string, readonly [number, number, number]],
  t: number,
): void {
  const n = art.verts.length;
  const edge = art.verts[Math.round((a / (Math.PI * 2)) * n) % n] * 0.84;
  const ca = a + angle;
  const bx = x + Math.cos(ca) * R * edge * art.long;
  const by = y + Math.sin(ca) * R * edge;
  const h = size * R;
  const pulse = 0.75 + 0.25 * Math.sin(t * 2 + a * 5);
  ctx.save();
  // A small, soft glow around the cluster.
  const g = ctx.createRadialGradient(bx, by, 0, bx, by, h * 1.3);
  g.addColorStop(0, rgba(glow, 0.32 * pulse));
  g.addColorStop(1, rgba(glow, 0));
  ctx.fillStyle = g;
  ctx.fillRect(bx - h * 1.3, by - h * 1.3, h * 2.6, h * 2.6);
  ctx.translate(bx, by);
  ctx.rotate(ca);
  for (const [lean, len] of [
    [-0.62, 0.8],
    [0.55, 0.88],
    [0, 1.12],
  ] as const) {
    const L = h * len;
    const w = L * 0.3;
    ctx.save();
    ctx.rotate(lean);
    // Two faces, light and dark, meeting along the shard's spine.
    ctx.fillStyle = lightFace;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(L * 0.62, -w);
    ctx.lineTo(L, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = darkFace;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(L * 0.62, w);
    ctx.lineTo(L, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = art.palette.ink;
    ctx.lineWidth = Math.max(1, R * 0.03);
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(L * 0.62, -w);
    ctx.lineTo(L, 0);
    ctx.lineTo(L * 0.62, w);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
