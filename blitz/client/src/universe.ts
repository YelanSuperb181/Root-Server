// The universe beyond the bubble: deep space that goes on forever. A handful
// of textures are painted once (star fields, nebulae, galaxies, a ringed
// planet) and laid out in layers that slide past at different speeds as the
// camera follows Blitz, so it reads as deep and endless. The same universe
// shows through the bubble's glass, so bursting it reveals more of what was
// already there. Decoration only: none of it touches Blitz's physics.

import { hash32, unit } from "@blitz/shared";
import { Cam, RGB, glowStamp, rgba, stampAt } from "./fx";
import { FAR_PALETTE, RockArt, RockLight, SUN, drawRockArt, makeRockArt } from "./rockart";

/** The distant rocks are lit only by the far-off sun. */
const FAR_LIGHT: RockLight = { lx: SUN.x, ly: SUN.y, glow: 0, tint: [0, 0, 0], gx: 0, gy: 0, flash: 0 };

/** Pixels per domain unit the parallax is tuned for, whatever the zoom. */
const REF = 300;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The same cell always gets the same contents, wherever and whenever it's
 * drawn: seedCell starts cellRnd's numbers for a cell (one shared generator,
 * rather than a new one for every cell of every layer, every frame).
 */
let cellState = 0;
function seedCell(ix: number, iy: number, layer: number): void {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(layer, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  cellState = (h ^ (h >>> 16)) >>> 0;
}
/** The next number in [0, 1) for the cell last seeded (the same numbers mulberry32 gives). */
function cellRnd(): number {
  cellState = (cellState + 0x6d2b79f5) >>> 0;
  let t = cellState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A canvas to paint on. An opaque one (for things that fill every pixel) is quicker to copy from. */
function canvas(w: number, h = w, opaque = false): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d", { alpha: !opaque })!];
}

function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB, a: number): void {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, rgba(c, a));
  grad.addColorStop(1, rgba(c, 0));
  g.fillStyle = grad;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

/** The color washes: where they sit on the deep layer (at zoom 1) and their color. */
const WASHES: Array<[number, number, RGB]> = [
  [-620, -300, [40, 140, 170]],
  [700, 220, [110, 70, 200]],
  [80, 640, [50, 60, 170]],
  [-200, 420, [160, 60, 140]],
];

/** Passing dust. */
const DUST: RGB = [200, 225, 255];

const NEBULA_COLORS: RGB[] = [
  [64, 196, 220],
  [150, 110, 255],
  [230, 90, 190],
  [80, 120, 255],
  [255, 150, 110],
  [90, 230, 190],
];

interface StarLayer {
  /** paintStars' arguments: count, smallest and largest radius, glow above this radius, seed. */
  stars: [number, number, number, number, number];
  /** How fast it slides, as a share of the camera's movement. */
  p: number;
  /** The tile, painted for each pixel density it's been drawn at (the bubble's and open space's). */
  tiles: Map<number, HTMLCanvasElement>;
}

/**
 * The deep sky (the color washes, galaxies, nebulae and the faintest stars)
 * slides at one slow speed, so it's painted in tiles, once each, and every
 * frame just copies the tiles on screen pixel for pixel. New tiles are
 * painted a few at a time as the camera travels.
 */
const DEEP_P = 0.06;
/** A deep tile's size, in screen pixels at 1x. */
const DEEP_TILE = 256;
/** Tiles kept painted at once: a full screen and the ring around it, with room to turn around. */
const DEEP_KEEP = 100;
/** New tiles painted per frame, at most: more would stall the frame. */
const DEEP_PER_FRAME = 6;
/** The color of empty space, under everything. */
const SPACE = "#0B1334";
/** The faintest star layer, painted into the deep tiles. */
const FAINT_STARS: [number, number, number, number, number] = [650, 0.3, 0.8, 9, 11];

/**
 * Browsers put off actually painting a canvas until it's first shown; copying
 * it onto a pixel of a scratch canvas makes them do it now, while there's
 * time. The scratch is big enough that browsers drawing with the graphics
 * card keep it there too: copying onto a tiny canvas could make them read the
 * whole picture back from the card first, which stalls.
 */
let scratch: CanvasRenderingContext2D | undefined;
export function finishPainting(c: HTMLCanvasElement): void {
  scratch ??= canvas(256)[1];
  scratch.drawImage(c, 0, 0, 1, 1);
}

/** Rounds a canvas x (or y) so it lands on a whole device pixel under `m`, which keeps copies crisp and cheap. */
function snapX(m: DOMMatrix, x: number): number {
  return (Math.round(m.a * x + m.e) - m.e) / m.a;
}
function snapY(m: DOMMatrix, y: number): number {
  return (Math.round(m.d * y + m.f) - m.f) / m.d;
}

/** A 512-px tile of stars, painted at `pixels` device pixels square so it can be drawn 1:1, sharp and cheap. */
function paintStars(count: number, minR: number, maxR: number, glowAbove: number, seed: number, pixels = 512): HTMLCanvasElement {
  const [c, g] = canvas(pixels);
  g.scale(pixels / 512, pixels / 512);
  const rnd = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const r = minR + rnd() * (maxR - minR);
    const tint = rnd();
    const color: RGB = tint < 0.15 ? [255, 228, 196] : tint < 0.35 ? [196, 220, 255] : [235, 242, 255];
    const a = 0.35 + rnd() * 0.6;
    if (r > glowAbove) blob(g, x, y, r * 4, color, a * 0.25);
    g.fillStyle = rgba(color, a);
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function paintNebula(seed: number): HTMLCanvasElement {
  const [c, g] = canvas(512);
  const rnd = mulberry32(seed);
  const pick = () => NEBULA_COLORS[Math.floor(rnd() * NEBULA_COLORS.length)];
  const colors = [pick(), pick(), pick()];
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 4; i++) blob(g, 160 + rnd() * 192, 160 + rnd() * 192, 120 + rnd() * 100, colors[i % 2], 0.06 + rnd() * 0.05);
  // Filaments: a wandering trail of soft blobs.
  for (let strand = 0; strand < 3; strand++) {
    let x = 256 + (rnd() - 0.5) * 120;
    let y = 256 + (rnd() - 0.5) * 120;
    let a = rnd() * Math.PI * 2;
    for (let i = 0; i < 70; i++) {
      a += (rnd() - 0.5) * 0.7;
      const stepLen = 5 + rnd() * 6;
      x += Math.cos(a) * stepLen;
      y += Math.sin(a) * stepLen;
      if (Math.hypot(x - 256, y - 256) > 185) a = Math.atan2(256 - y, 256 - x);
      blob(g, x, y, 8 + rnd() * 36, colors[(i + strand) % 3], 0.025 + rnd() * 0.04);
    }
  }
  for (let i = 0; i < 6; i++) blob(g, 140 + rnd() * 232, 140 + rnd() * 232, 8 + rnd() * 18, [235, 240, 255], 0.08 + rnd() * 0.08);
  // Dark dust lanes carved through it.
  g.globalCompositeOperation = "destination-out";
  let x = 256 + (rnd() - 0.5) * 160;
  let y = 256 + (rnd() - 0.5) * 160;
  let a = rnd() * Math.PI * 2;
  for (let i = 0; i < 50; i++) {
    a += (rnd() - 0.5) * 0.5;
    x += Math.cos(a) * 7;
    y += Math.sin(a) * 7;
    blob(g, x, y, 6 + rnd() * 16, [0, 0, 0], 0.08 + rnd() * 0.08);
  }
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(240, 246, 255, ${0.4 + rnd() * 0.5})`;
    g.beginPath();
    g.arc(110 + rnd() * 292, 110 + rnd() * 292, 0.5 + rnd(), 0, Math.PI * 2);
    g.fill();
  }
  // Fade the edges so nothing ever shows a seam.
  g.globalCompositeOperation = "destination-in";
  const edge = g.createRadialGradient(256, 256, 60, 256, 256, 256);
  edge.addColorStop(0, "rgba(0,0,0,1)");
  edge.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = edge;
  g.fillRect(0, 0, 512, 512);
  return c;
}

function paintGalaxy(seed: number): HTMLCanvasElement {
  const [c, g] = canvas(256);
  const rnd = mulberry32(seed);
  g.globalCompositeOperation = "lighter";
  blob(g, 128, 128, 46, [255, 236, 214], 0.75);
  blob(g, 128, 128, 110, [170, 180, 255], 0.12);
  for (let i = 0; i < 900; i++) {
    const arm = i % 2;
    const t = rnd() * 4.6;
    const theta = t + arm * Math.PI + (rnd() - 0.5) * 0.35;
    const r = 8 + t * 22 + (rnd() - 0.5) * 9;
    const knot = rnd() < 0.06;
    g.fillStyle = knot ? `rgba(255, 150, 210, ${0.5 + rnd() * 0.4})` : `rgba(205, 220, 255, ${0.15 + rnd() * 0.4})`;
    g.beginPath();
    g.arc(128 + Math.cos(theta) * r, 128 + Math.sin(theta) * r, knot ? 1.4 : 0.5 + rnd() * 1.1, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function paintPlanet(): HTMLCanvasElement {
  const [c, g] = canvas(600);
  g.translate(300, 300);
  g.rotate(-0.35);
  const ring = (front: boolean) => {
    for (let k = 0; k < 22; k++) {
      const rr = 168 + k * 4.5;
      const gap = k === 9 || k === 10;
      g.strokeStyle = `rgba(${200 + k * 2}, ${210 + k}, 255, ${gap ? 0.03 : 0.08 + (k % 3) * 0.05})`;
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(0, 0, rr, rr * 0.26, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      g.stroke();
    }
  };
  ring(false);
  // The planet: a cool gas giant, lit from the upper left.
  const body = g.createRadialGradient(-55, -60, 10, 0, 0, 132);
  body.addColorStop(0, "#E3F6FF");
  body.addColorStop(0.45, "#93A9EA");
  body.addColorStop(1, "#2B2766");
  g.fillStyle = body;
  g.beginPath();
  g.arc(0, 0, 130, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.clip();
  for (let i = 0; i < 15; i++) {
    const y = -130 + i * 18.5;
    g.fillStyle = i % 2 ? "rgba(255, 255, 255, 0.07)" : "rgba(40, 30, 110, 0.09)";
    g.beginPath();
    g.moveTo(-140, y);
    for (let x = -140; x <= 140; x += 20) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
    g.lineTo(140, y + 12);
    g.lineTo(-140, y + 12);
    g.closePath();
    g.fill();
  }
  const night = g.createRadialGradient(70, 70, 40, 40, 40, 230);
  night.addColorStop(0, "rgba(4, 6, 20, 0)");
  night.addColorStop(0.45, "rgba(4, 6, 20, 0.35)");
  night.addColorStop(1, "rgba(4, 6, 20, 0.92)");
  g.fillStyle = night;
  g.fillRect(-140, -140, 280, 280);
  g.restore();
  g.strokeStyle = "rgba(170, 225, 255, 0.45)";
  g.lineWidth = 2;
  g.shadowColor = "rgba(127, 227, 255, 0.9)";
  g.shadowBlur = 18;
  g.beginPath();
  g.arc(0, 0, 130, Math.PI * 0.75, Math.PI * 1.75);
  g.stroke();
  g.shadowBlur = 0;
  ring(true);
  // A small moon.
  const moon = g.createRadialGradient(222, -168, 2, 230, -160, 20);
  moon.addColorStop(0, "#F2F4FF");
  moon.addColorStop(1, "#5D5F8C");
  g.fillStyle = moon;
  g.beginPath();
  g.arc(230, -160, 18, 0, Math.PI * 2);
  g.fill();
  return c;
}

interface Shooting {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
}

export interface UniverseView {
  /** Fade the whole universe in and out. */
  alpha: number;
  /** Occasional shooting stars. */
  shooting: boolean;
  /** The distant rocks, when drawStill left them out (they drift by too quickly to keep in a painted copy). */
  farRocks?: boolean;
  /** How much of the lively layer shows at a screen point (seen through the bubble's tinted glass); 1 when unset. */
  dim?: (x: number, y: number) => number;
}

/** Layers that only drift: everything except the twinkling stars, dust and shooting stars. */
const FAR_ROCK_P = 0.5;
/** drawStill's layers, back to front: deep sky, the two star fields, the planet, the distant rocks. */
export const STILL_PARTS = 5;
/** Bright stars start to streak above this camera speed (screen px/s at their depth) and are fully streaks above STREAK_FULL. */
const STREAK_FROM = 35;
const STREAK_FULL = 160;
const PLANET_P = 0.11;

export class Universe {
  /** Hears where each new shooting star appears (screen pixels), so Blitz can look. */
  onShootingStar: ((x: number, y: number) => void) | undefined;
  private layers: StarLayer[] = [];
  /** Painted deep-sky tiles, by "tx,ty", most recently used last. */
  private deep = new Map<string, HTMLCanvasElement>();
  /** What the deep tiles were painted for: pixel density and zoom. */
  private deepFor = "";
  /** Canvases of tiles that scrolled away, to paint new tiles on. */
  private deepSpare: HTMLCanvasElement[] = [];
  /**
   * The tiles from before the sharpness last changed, shown (slightly
   * stretched) wherever a new tile isn't painted yet, so the sky never
   * flashes empty squares while it catches up.
   */
  private deepPrev: Map<string, HTMLCanvasElement> | undefined;
  private faint: { k: number; pattern: CanvasPattern } | undefined;
  private nebulae: HTMLCanvasElement[] = [];
  private galaxies: HTMLCanvasElement[] = [];
  private planet: HTMLCanvasElement | undefined;
  /** The planet painted at the size and pixel density it's drawn at, so it's copied pixel for pixel. */
  private planetSized: { k: number; zoom: number; canvas: HTMLCanvasElement } | undefined;
  private farRocks = new Map<string, RockArt>();
  /** Each distant rock, painted once at the size it's drawn: per pixel density, by cell. */
  private farSprites = new Map<string, Map<string, { canvas: HTMLCanvasElement; half: number }>>();
  private shooting: Shooting[] = [];
  private nextShooting = 2.5;
  private lastFocus: { x: number; y: number } | undefined;
  private camVel = { x: 0, y: 0 };
  /** How far the bright stars have turned into streaks, 0 to 1 (eased; see drawLively). */
  private streak = 0;
  /** How long each kind of piece prewarm paints takes on this computer, roughly (ms). */
  private pieceMs = { stars: 6, planet: 2, deep: 2 };

  constructor(private reduced: boolean) {
    this.layers = [
      { stars: [reduced ? 110 : 200, 0.5, 1.2, 1.05, 23], p: 0.2, tiles: new Map() },
      { stars: [reduced ? 30 : 55, 0.8, 1.8, 1.1, 37], p: 0.42, tiles: new Map() },
    ];
    this.nebulae = [101, 202, 303, 404, 505].map(paintNebula);
    this.galaxies = [7, 8, 9].map(paintGalaxy);
    this.planet = paintPlanet();
  }

  /**
   * How long space has been drifting, in seconds. Out in the open the layers
   * creep along slowly; inside the bubble they hold still (and pick up where
   * they left off when it bursts), so the bubble's view never needs repainting.
   */
  private driftT = 0;

  /** Moves the drift on by `dt` while space is open. */
  tick(dt: number, open: boolean): void {
    if (open && !this.reduced) this.driftT += dt;
  }

  /** Where layer point (lx, ly) lands on screen, for a layer moving at `p` times the camera. */
  private offset(cam: Cam, p: number): { x: number; y: number } {
    const driftX = this.driftT * 5;
    const driftY = this.driftT * 2;
    return { x: cam.x - (cam.fx * REF + driftX) * p, y: cam.y - (cam.fy * REF + driftY) * p };
  }

  /** Calls `each` for every cell of a `size`-px grid on layer `p` that could show within the screen (plus `margin`). */
  private cells(cam: Cam, p: number, W: number, H: number, size: number, margin: number, each: (ix: number, iy: number, ox: number, oy: number) => void): void {
    const o = this.offset(cam, p);
    const x0 = Math.floor((-margin - o.x) / size);
    const x1 = Math.floor((W + margin - o.x) / size);
    const y0 = Math.floor((-margin - o.y) / size);
    const y1 = Math.floor((H + margin - o.y) / size);
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) each(ix, iy, o.x + ix * size, o.y + iy * size);
  }

  /**
   * The window's size and open space's pixel density, from the domain. Space
   * is scaled to the window (not to the bubble), and the deep-sky tiles are
   * painted for open space, so the same tiles serve the bubble and carry over
   * when it bursts.
   */
  private screen = { w: 1280, h: 800, k: 1 };

  setScreen(w: number, h: number, k: number): void {
    this.screen = { w, h, k };
  }

  private zoom(): number {
    return Math.max(0.6, Math.min(1.6, Math.min(this.screen.w, this.screen.h) / 800));
  }

  /**
   * Paints one more thing open space will need when the bubble bursts (its
   * star tiles, planet and deep-sky tiles for `cam`), so the burst doesn't
   * have to: only if it's likely to take less than `budget` ms. "done" once
   * there's nothing left, "wait" when the next piece wouldn't fit.
   */
  prewarm(W: number, H: number, cam: Cam, budget: number): "more" | "wait" | "done" {
    const k = this.screen.k;
    const piece = (kind: keyof Universe["pieceMs"], paint: () => HTMLCanvasElement): "more" | "wait" => {
      if (this.pieceMs[kind] > budget) return "wait";
      const t0 = performance.now();
      finishPainting(paint());
      this.pieceMs[kind] += (performance.now() - t0 - this.pieceMs[kind]) * 0.5;
      return "more";
    };
    for (const layer of this.layers) {
      if (!layer.tiles.has(k)) return piece("stars", () => this.paintStarTile(layer, k));
    }
    const zoom = this.zoom();
    if (this.planetSized?.k !== k || this.planetSized.zoom !== zoom) return piece("planet", () => this.sizedPlanet(k, zoom));
    if (this.deepFor !== `${k}|${zoom}`) return "done"; // the bubble hasn't drawn any sky yet
    const px = Math.round(DEEP_TILE * k);
    const size = px / k;
    const o = this.offset(cam, DEEP_P);
    for (let tx = Math.floor(-o.x / size) - 1; tx <= Math.floor((W - o.x) / size) + 1; tx++) {
      for (let ty = Math.floor(-o.y / size) - 1; ty <= Math.floor((H - o.y) / size) + 1; ty++) {
        const id = `${tx},${ty}`;
        if (this.deep.has(id)) continue;
        if (this.deep.size >= DEEP_KEEP) return "done";
        return piece("deep", () => {
          const tile = this.paintDeepTile(tx, ty, px, k, zoom);
          this.deep.set(id, tile);
          return tile;
        });
      }
    }
    return "done";
  }

  /** Whether every deep-sky tile this view needs is painted (they come a few per frame). */
  skyReady(W: number, H: number, cam: Cam): boolean {
    if (this.deepFor !== `${this.screen.k}|${this.zoom()}`) return false;
    const size = Math.round(DEEP_TILE * this.screen.k) / this.screen.k;
    const o = this.offset(cam, DEEP_P);
    for (let tx = Math.floor(-o.x / size) - 1; tx <= Math.floor((W - o.x) / size) + 1; tx++) {
      for (let ty = Math.floor(-o.y / size) - 1; ty <= Math.floor((H - o.y) / size) + 1; ty++) {
        if (!this.deep.has(`${tx},${ty}`)) return false;
      }
    }
    return true;
  }

  /**
   * Where the camera has the still layers, to a device pixel, leaving out the
   * slow drift: when this is unchanged but stillKey has changed, only the
   * drift has moved them (by a pixel or so).
   */
  camKey(W: number, H: number, cam: Cam, k: number): string {
    return `${W}|${H}|${k}|${Math.round(cam.x * k)}|${Math.round(cam.y * k)}|${Math.round(cam.fx * REF * k)}|${Math.round(cam.fy * REF * k)}`;
  }

  /**
   * Changes whenever drawStill would draw something different (a layer has
   * drifted a whole device pixel, or the far rocks have turned a little), so a
   * painted copy of the still layers can be reused until then.
   */
  stillKey(W: number, H: number, cam: Cam, k: number, farRocks = true): string {
    const at = (p: number) => {
      const o = this.offset(cam, p);
      return `${Math.round(o.x * k)},${Math.round(o.y * k)}`;
    };
    return `${W}|${H}|${k}|${at(DEEP_P)}|${at(this.layers[0].p)}|${at(this.layers[1].p)}|${at(PLANET_P)}${farRocks ? `|${at(FAR_ROCK_P)}` : ""}`;
  }

  /**
   * The layers that only drift: deep sky, star fields, the planet and the
   * distant rocks (parts `from` up to `to` of them, see STILL_PARTS, so a copy
   * can be painted a few layers per frame). False when some deep-sky tiles
   * weren't painted yet (they come a few per frame), so a copy of this would
   * need painting again.
   */
  drawStill(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Cam, alpha = 1, from = 0, to = STILL_PARTS): boolean {
    const zoom = this.zoom();
    ctx.save();
    ctx.globalAlpha = alpha;
    const m = ctx.getTransform();
    // The exact scale: tiles painted for it land on whole device pixels.
    const k = m.a;
    ctx.imageSmoothingEnabled = false;
    let complete = true;
    if (from <= 0 && to > 0) complete = this.drawDeep(ctx, W, H, cam, zoom, m);

    // Star fields, near layers sliding faster than far ones. Each tile is drawn
    // whole and on exact device pixels: far cheaper than a shifted pattern fill.
    for (let i = Math.max(0, from - 1); i < Math.min(this.layers.length, to - 1); i++) {
      const layer = this.layers[i];
      const tile = layer.tiles.get(k) ?? this.paintStarTile(layer, k);
      const size = tile.width / k;
      const o = this.offset(cam, layer.p);
      const x0 = snapX(m, (((o.x % size) + size) % size) - size);
      const y0 = snapY(m, (((o.y % size) + size) % size) - size);
      for (let x = x0; x < W; x += size) {
        for (let y = y0; y < H; y += size) ctx.drawImage(tile, x, y, size, size);
      }
    }

    // A ringed planet hanging off to one side of where the bubble was.
    if (from <= 3 && to > 3 && this.planet) {
      const o = this.offset(cam, PLANET_P);
      const size = 420 * zoom;
      const x = o.x - 560 * zoom - size / 2;
      const y = o.y + 280 * zoom - size / 2;
      if (x < W && y < H && x + size > 0 && y + size > 0) {
        const art = this.sizedPlanet(k, zoom);
        ctx.drawImage(art, snapX(m, x), snapY(m, y), art.width / k, art.height / k);
      }
    }

    // Distant rocks, dim and small, drifting by slower than the ones Blitz can reach.
    if (from <= 4 && to > 4) this.drawFarRocks(ctx, W, H, cam, m);
    ctx.restore();
    return complete;
  }

  /** A star layer's tile for pixel density `k` (keeping the last few densities' too). */
  private paintStarTile(layer: StarLayer, k: number): HTMLCanvasElement {
    const tile = paintStars(...layer.stars, Math.round(512 * k));
    if (layer.tiles.size >= 3) layer.tiles.delete(layer.tiles.keys().next().value as number);
    layer.tiles.set(k, tile);
    return tile;
  }

  /** The planet, painted at `zoom` for pixel density `k`. */
  private sizedPlanet(k: number, zoom: number): HTMLCanvasElement {
    if (this.planetSized?.k !== k || this.planetSized.zoom !== zoom) {
      const px = Math.max(1, Math.round(420 * zoom * k));
      const [c, g] = canvas(px);
      g.drawImage(this.planet!, 0, 0, px, px);
      this.planetSized = { k, zoom, canvas: c };
    }
    return this.planetSized.canvas;
  }

  /** The distant rocks, each a small painting copied onto whole device pixels. */
  private drawFarRocks(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Cam, m: DOMMatrix, dim?: (x: number, y: number) => number): void {
    const zoom = this.zoom();
    const k = m.a;
    const id = `${k}|${zoom}`;
    let sprites = this.farSprites.get(id);
    if (!sprites) {
      // Two at most: the bubble's pixel density and open space's.
      if (this.farSprites.size >= 2) this.farSprites.delete(this.farSprites.keys().next().value as string);
      sprites = new Map();
      this.farSprites.set(id, sprites);
    }
    const alpha = ctx.globalAlpha;
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    this.cells(cam, FAR_ROCK_P, W, H, 360, 40, (ix, iy, cx, cy) => {
      seedCell(ix, iy, 5);
      const rnd = cellRnd;
      if (rnd() > 0.2) return;
      const x = cx + rnd() * 360;
      const y = cy + rnd() * 360;
      const key = `${ix},${iy}`;
      let sprite = sprites!.get(key);
      if (!sprite) {
        const size = (5 + rnd() * 13) * zoom;
        const turn = rnd() * 6.28;
        let art = this.farRocks.get(key);
        if (!art) {
          art = makeRockArt((n) => unit(hash32(ix, iy, 5000 + n)), false, FAR_PALETTE);
          if (this.farRocks.size > 200) this.farRocks.clear();
          this.farRocks.set(key, art);
        }
        // Room for the lumpy outline (up to about 1.4 radii out) and its edge.
        const half = Math.ceil(size * 1.5 * k) + 1;
        const [c, g] = canvas(half * 2);
        g.setTransform(k, 0, 0, k, half, half);
        drawRockArt(g, art, 0, 0, size, turn, FAR_LIGHT, 0);
        if (sprites!.size > 120) sprites!.clear();
        sprite = { canvas: c, half };
        sprites!.set(key, sprite);
      }
      if (dim) ctx.globalAlpha = alpha * dim(x, y);
      const left = snapX(m, x - sprite.half / k);
      const top = snapY(m, y - sprite.half / k);
      ctx.drawImage(sprite.canvas, left, top, sprite.canvas.width / k, sprite.canvas.height / k);
    });
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = smooth;
  }

  /** The layers that change every frame: twinkling bright stars, shooting stars and passing dust (and the distant rocks, when asked). */
  drawLively(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Cam, t: number, dt: number, view: UniverseView): void {
    // How fast the camera is sweeping across space, for star streaks.
    if (this.lastFocus && dt > 0) {
      const kv = Math.min(1, dt * 8);
      this.camVel.x += ((cam.fx - this.lastFocus.x) / dt - this.camVel.x) * kv;
      this.camVel.y += ((cam.fy - this.lastFocus.y) / dt - this.camVel.y) * kv;
    }
    this.lastFocus = { x: cam.fx, y: cam.fy };
    const zoom = this.zoom();
    const dim = view.dim ?? (() => 1);
    // Glows are copied pixel for pixel, in device pixels (see glowStamp).
    const m = ctx.getTransform();
    ctx.save();
    ctx.globalAlpha = view.alpha;
    if (view.farRocks) this.drawFarRocks(ctx, W, H, cam, ctx.getTransform(), view.dim);

    // Bright stars: twinkling, with soft spikes, and streaking when the camera rushes along.
    ctx.globalCompositeOperation = "lighter";
    const speed = Math.hypot(this.camVel.x, this.camVel.y) * REF;
    // Streaks grow out of the stars as the camera picks up speed and shrink back into them as it
    // slows, crossfading between the two looks instead of switching at one speed.
    const u = Math.min(1, Math.max(0, (speed * 0.32 - STREAK_FROM) / (STREAK_FULL - STREAK_FROM)));
    // Quick to appear, slower to melt away: the camera brakes faster than the eye wants the streaks to go.
    const target = u * u * (3 - 2 * u);
    this.streak += (target - this.streak) * Math.min(1, dt * (target > this.streak ? 7 : 2.6));
    if (this.streak < 0.01 && target === 0) this.streak = 0;
    const streak = this.streak;
    const vx = this.camVel.x * REF * 0.32 * 0.07;
    const vy = this.camVel.y * REF * 0.32 * 0.07;
    this.cells(cam, 0.32, W, H, 190, 20, (ix, iy, cx, cy) => {
      seedCell(ix, iy, 3);
      const rnd = cellRnd;
      if (rnd() > 0.24) return;
      const x = cx + rnd() * 190;
      const y = cy + rnd() * 190;
      const r = 0.8 + rnd() * 1.6;
      const tint = rnd();
      const color: RGB = tint < 0.2 ? [255, 214, 170] : tint < 0.5 ? [170, 205, 255] : [235, 242, 255];
      const tw = (this.reduced ? 1 : 0.55 + 0.45 * Math.sin(t * (1 + rnd() * 2.5) + rnd() * 6.28)) * dim(x, y);
      if (streak > 0) {
        ctx.strokeStyle = rgba(color, 0.7 * tw * streak);
        ctx.lineWidth = r;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + vx, y + vy);
        ctx.stroke();
      }
      if (streak >= 1) return;
      const still = 1 - streak;
      const size = r * 7;
      ctx.globalAlpha = view.alpha * tw * still;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      stampAt(ctx, glowStamp(color, size * m.a), m.a * x + m.e, m.d * y + m.f);
      ctx.setTransform(m);
      if (r > 1.6) {
        ctx.strokeStyle = rgba(color, 0.35 * tw * still);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x - r * 7, y);
        ctx.lineTo(x + r * 7, y);
        ctx.moveTo(x, y - r * 7);
        ctx.lineTo(x, y + r * 7);
        ctx.stroke();
      }
      ctx.globalAlpha = view.alpha;
    });

    // Shooting stars, now and then.
    if (view.shooting && !this.reduced) {
      if (t > this.nextShooting) {
        this.nextShooting = t + 3 + Math.random() * 6;
        const fromLeft = Math.random() < 0.5;
        const sp = 900 + Math.random() * 600;
        const a = (fromLeft ? 0.35 : Math.PI - 0.35) + (Math.random() - 0.5) * 0.4;
        const star = { x: fromLeft ? Math.random() * W * 0.5 : W * (0.5 + Math.random() * 0.5), y: Math.random() * H * 0.4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: t, life: 0.75 };
        this.shooting.push(star);
        this.onShootingStar?.(star.x + star.vx * 0.35, star.y + star.vy * 0.35);
      }
      for (let i = this.shooting.length - 1; i >= 0; i--) {
        const s = this.shooting[i];
        const age = t - s.born;
        if (age > s.life) {
          this.shooting.splice(i, 1);
          continue;
        }
        const x = s.x + s.vx * age;
        const y = s.y + s.vy * age;
        const fade = Math.sin((age / s.life) * Math.PI);
        const tail = ctx.createLinearGradient(x, y, x - s.vx * 0.14, y - s.vy * 0.14);
        tail.addColorStop(0, `rgba(240, 250, 255, ${0.9 * fade})`);
        tail.addColorStop(1, "rgba(240, 250, 255, 0)");
        ctx.strokeStyle = tail;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - s.vx * 0.14, y - s.vy * 0.14);
        ctx.stroke();
      }
    }

    // Dust drifting close past the camera, faster than everything else.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.cells(cam, 1.5, W, H, 280, 20, (ix, iy, cx, cy) => {
      seedCell(ix, iy, 4);
      const rnd = cellRnd;
      if (rnd() > 0.22) return;
      const size = (3 + rnd() * 6) * zoom;
      ctx.globalAlpha = view.alpha * (0.1 + rnd() * 0.15);
      const x = cx + rnd() * 280;
      const y = cy + rnd() * 280;
      ctx.globalAlpha *= dim(x, y);
      stampAt(ctx, glowStamp(DUST, size * m.a), m.a * x + m.e, m.d * y + m.f);
    });
    ctx.setTransform(m);
    ctx.restore();
  }

  /** The deep sky: the painted tiles on screen, painting any that are missing (a few per frame). False if some are still missing. */
  private drawDeep(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Cam, zoom: number, m: DOMMatrix): boolean {
    // Tiles are painted for open space's pixel density; drawn anywhere else (the bubble), they're scaled smoothly.
    const k = this.screen.k;
    const scaled = Math.abs(m.a - k) > 1e-3;
    const key = `${k}|${zoom}`;
    if (key !== this.deepFor) {
      // Only the sharpness changed (the same sky, more or fewer pixels): keep the old tiles to fill in with.
      const sameSky = this.deepFor.endsWith(`|${zoom}`);
      this.deepPrev = sameSky && this.deep.size > 0 ? this.deep : undefined;
      this.deep = new Map();
      this.deepSpare = [];
      this.deepFor = key;
    }
    const px = Math.round(DEEP_TILE * k);
    const size = px / k;
    const o = this.offset(cam, DEEP_P);
    const ox = snapX(m, o.x);
    const oy = snapY(m, o.y);
    const x0 = Math.floor(-ox / size);
    const x1 = Math.floor((W - ox) / size);
    const y0 = Math.floor(-oy / size);
    const y1 = Math.floor((H - oy) / size);
    // Missing tiles nearest the middle of the view are painted first (the burst opens out from there).
    const missing: Array<[number, number, number]> = [];
    const mx = (cam.x - ox) / size;
    const my = (cam.y - oy) / size;
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) if (!this.deep.has(`${tx},${ty}`)) missing.push([tx, ty, (tx + 0.5 - mx) ** 2 + (ty + 0.5 - my) ** 2]);
    }
    missing.sort((a, b) => a[2] - b[2]);
    // Where an older tile can stand in (the sharpness just changed), there's no hurry: a couple a frame.
    let budget = missing.some(([tx, ty]) => !this.deepPrev?.has(`${tx},${ty}`)) ? DEEP_PER_FRAME : 2;
    const complete = missing.length <= budget;
    for (const [tx, ty] of missing) {
      if (budget-- <= 0) break;
      this.deep.set(`${tx},${ty}`, this.paintDeepTile(tx, ty, px, k, zoom));
    }
    ctx.fillStyle = SPACE;
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = scaled;
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        const id = `${tx},${ty}`;
        const tile = this.deep.get(id);
        // Edges on whole device pixels, so neighbouring tiles always meet exactly.
        const x = snapX(m, ox + tx * size);
        const y = snapY(m, oy + ty * size);
        const w = snapX(m, ox + (tx + 1) * size) - x;
        const h = snapY(m, oy + (ty + 1) * size) - y;
        if (tile) {
          // Most recently used goes last, so the oldest are dropped first.
          this.deep.delete(id);
          this.deep.set(id, tile);
          ctx.drawImage(tile, x, y, w, h);
        } else {
          const old = this.deepPrev?.get(id);
          if (old) {
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(old, x, y, w, h);
            ctx.imageSmoothingEnabled = scaled;
          } else ctx.fillRect(x, y, w, h);
        }
      }
    }
    ctx.imageSmoothingEnabled = smooth;
    if (complete) this.deepPrev = undefined;
    // Spare time: paint the ring just off screen, so travelling finds it ready. One tile a frame at
    // most (and none while tiles in view are still missing), so travelling never stalls a frame.
    let ahead = missing.length === 0 ? 1 : 0;
    for (let tx = x0 - 1; tx <= x1 + 1 && ahead > 0; tx++) {
      for (let ty = y0 - 1; ty <= y1 + 1 && ahead > 0; ty++) {
        if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) continue;
        const id = `${tx},${ty}`;
        if (this.deep.has(id)) continue;
        ahead--;
        this.deep.set(id, this.paintDeepTile(tx, ty, px, k, zoom));
      }
    }
    while (this.deep.size > DEEP_KEEP) {
      const oldest = this.deep.keys().next().value as string;
      this.deepSpare.push(this.deep.get(oldest)!);
      this.deep.delete(oldest);
    }
    return complete;
  }

  /** Half-resolution scratch canvas for a deep tile's soft light (see paintDeepTile). */
  private soft: [HTMLCanvasElement, CanvasRenderingContext2D] | undefined;

  /**
   * One deep-sky tile, `px` device pixels square, covering layer pixels from
   * (tx, ty) * its size. Its soft light (the color washes and nebulae, blurry
   * by nature) is painted at half resolution and stretched over the tile,
   * which is several times quicker; the faint stars and galaxies stay sharp.
   */
  private paintDeepTile(tx: number, ty: number, px: number, k: number, zoom: number): HTMLCanvasElement {
    const spare = this.deepSpare.pop();
    // Opaque: every pixel is painted, and opaque tiles are quicker to copy.
    const [c, g] = spare ? [spare, spare.getContext("2d")!] : canvas(px, px, true);
    // A reused canvas still has the last tile's settings.
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    const size = px / k;
    const left = tx * size;
    const top = ty * size;

    // The soft light, with a pixel to spare all round so neighbouring tiles blend across their edges.
    const half = k / 2;
    const sp = Math.ceil(px / 2) + 2;
    if (this.soft?.[0].width !== sp) this.soft = canvas(sp, sp, true);
    const [sc, s] = this.soft;
    const m = 1 / half;
    s.setTransform(half, 0, 0, half, -(left - m) * half, -(top - m) * half);
    s.globalCompositeOperation = "source-over";
    s.globalAlpha = 1;
    s.fillStyle = SPACE;
    s.fillRect(left - m, top - m, size + 2 * m, size + 2 * m);
    const near = (x: number, y: number, r: number) => x + r > left - m && x - r < left + size + m && y + r > top - m && y - r < top + size + m;
    s.globalCompositeOperation = "lighter";
    // Huge, faint washes of color: the far depths.
    for (const [lx, ly, color] of WASHES) {
      const r = 900 * zoom;
      const x = lx * zoom;
      const y = ly * zoom;
      if (!near(x, y, r)) continue;
      const grad = s.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, rgba(color, 0.2));
      grad.addColorStop(1, rgba(color, 0));
      s.fillStyle = grad;
      s.fillRect(left - m, top - m, size + 2 * m, size + 2 * m);
    }
    // Nebulae. The cells around the middle always have some, so there's color the moment the bubble bursts.
    this.layerCells(left, top, size, 1500, 1100, (ix, iy) => {
      seedCell(ix, iy, 2);
      const rnd = cellRnd;
      const home = ix === 0 && iy === 0;
      const neighbour = ix === -1 && iy === 0;
      if (!home && !neighbour && rnd() > 0.55) return;
      const sprite = this.nebulae[home ? 0 : neighbour ? 2 : Math.floor(rnd() * this.nebulae.length)];
      const sz = (1000 + rnd() * 800) * zoom;
      const x = ix * 1500 + (home ? 300 : neighbour ? 1100 : rnd() * 1500);
      const y = iy * 1500 + (home ? 200 : neighbour ? -250 : rnd() * 1500);
      // The sprite's soft circle fits inside sz / 2.
      if (!near(x, y, sz / 2)) return;
      s.save();
      s.globalAlpha = 0.55 + rnd() * 0.35;
      s.translate(x, y);
      s.rotate(rnd() * Math.PI * 2);
      s.drawImage(sprite, -sz / 2, -sz / 2, sz, sz);
      s.restore();
    });
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(sc, 1, 1, px / 2, px / 2, 0, 0, px, px);

    g.setTransform(k, 0, 0, k, -left * k, -top * k);
    const overlaps = (x: number, y: number, r: number) => x + r > left && x - r < left + size && y + r > top && y - r < top + size;
    // The faintest stars.
    if (!this.faint || this.faint.k !== k) {
      const tile = paintStars(this.reduced ? 300 : FAINT_STARS[0], FAINT_STARS[1], FAINT_STARS[2], FAINT_STARS[3], FAINT_STARS[4], Math.round(512 * k));
      this.faint = { k, pattern: g.createPattern(tile, "repeat")! };
    }
    this.faint.pattern.setTransform(new DOMMatrix([1 / k, 0, 0, 1 / k, 0, 0]));
    g.fillStyle = this.faint.pattern;
    g.fillRect(left, top, size, size);

    // Faraway galaxies (one is always up and to the right of where the bubble was).
    g.globalCompositeOperation = "lighter";
    this.layerCells(left, top, size, 900, 300, (ix, iy) => {
      seedCell(ix, iy, 1);
      const rnd = cellRnd;
      if (!(ix === 0 && iy === -1) && rnd() > 0.32) return;
      const sprite = this.galaxies[Math.floor(rnd() * this.galaxies.length)];
      const sz = (120 + rnd() * 140) * zoom;
      const x = ix * 900 + rnd() * 900;
      const y = iy * 900 + rnd() * 900;
      if (!overlaps(x, y, sz / 2)) return;
      g.save();
      g.globalAlpha = 0.45 + rnd() * 0.4;
      g.translate(x, y);
      g.rotate(rnd() * Math.PI);
      g.scale(1, 0.38 + rnd() * 0.3);
      g.drawImage(sprite, -sz / 2, -sz / 2, sz, sz);
      g.restore();
    });
    return c;
  }

  /** Calls `each` for every `cell`-sized cell of a layer whose contents could reach into the given square (within `reach`). */
  private layerCells(left: number, top: number, size: number, cell: number, reach: number, each: (ix: number, iy: number) => void): void {
    const x0 = Math.floor((left - reach) / cell);
    const x1 = Math.floor((left + size + reach) / cell);
    const y0 = Math.floor((top - reach) / cell);
    const y1 = Math.floor((top + size + reach) / cell);
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) each(ix, iy);
  }
}
