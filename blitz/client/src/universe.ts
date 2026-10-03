// The universe beyond the bubble: deep space that goes on forever. A handful
// of textures are painted once (star fields, nebulae, galaxies, a ringed
// planet) and laid out in layers that slide past at different speeds as the
// camera follows Blitz, so it reads as deep and endless. The same universe
// shows through the bubble's glass, so bursting it reveals more of what was
// already there. Decoration only: none of it touches Blitz's physics.

import { hash32, unit } from "@blitz/shared";
import { Cam, RGB, glowSprite, rgba } from "./fx";
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

/** The same cell always gets the same contents, wherever and whenever it's drawn. */
function cellRandom(ix: number, iy: number, layer: number): () => number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(layer, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return mulberry32(h ^ (h >>> 16));
}

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
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
  /** The tile, painted for the current pixel density `k`. */
  tile?: { k: number; canvas: HTMLCanvasElement };
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

/** Rounds a canvas x (or y) so it lands on a whole device pixel under `m`, which keeps copies crisp and cheap. */
function snapX(m: DOMMatrix, x: number): number {
  return (Math.round(m.a * x + m.e) - m.e) / m.a;
}
function snapY(m: DOMMatrix, y: number): number {
  return (Math.round(m.d * y + m.f) - m.f) / m.d;
}

/** Darkened edges for full-screen views, painted once per size, at full resolution. */
interface Vignette {
  canvas: HTMLCanvasElement;
  W: number;
  H: number;
  k: number;
  /** The middle, which the vignette leaves untouched (canvas pixels). */
  clear: { x: number; y: number; w: number; h: number };
}

const VIGNETTE_FROM = 0.32;

function paintVignette(W: number, H: number, k: number): Vignette {
  const [c, g] = canvas(Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k)));
  g.scale(k, k);
  const d = Math.hypot(W, H);
  const v = g.createRadialGradient(W / 2, H / 2, d * VIGNETTE_FROM, W / 2, H / 2, d * 0.62);
  v.addColorStop(0, "rgba(2, 3, 10, 0)");
  v.addColorStop(1, "rgba(2, 3, 10, 0.75)");
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  // Inside the gradient's inner circle nothing is darkened; the largest
  // screen-shaped box in there can be skipped when drawing.
  const hw = Math.floor(W * VIGNETTE_FROM * k) - 1;
  const hh = Math.floor(H * VIGNETTE_FROM * k) - 1;
  const cx = Math.round((W * k) / 2);
  const cy = Math.round((H * k) / 2);
  return { canvas: c, W, H, k, clear: { x: cx - hw, y: cy - hh, w: hw * 2, h: hh * 2 } };
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
  /** Darken the edges (full-screen views). */
  vignette: boolean;
  /** Occasional shooting stars. */
  shooting: boolean;
  /** How much of the lively layer shows at a screen point (seen through the bubble's tinted glass); 1 when unset. */
  dim?: (x: number, y: number) => number;
}

/** Layers that only drift: everything except the twinkling stars, dust and shooting stars. */
const FAR_ROCK_P = 0.5;
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
  private faint: { k: number; pattern: CanvasPattern } | undefined;
  private vignette: Vignette | undefined;
  private nebulae: HTMLCanvasElement[] = [];
  private galaxies: HTMLCanvasElement[] = [];
  private planet: HTMLCanvasElement | undefined;
  private farRocks = new Map<string, RockArt>();
  private shooting: Shooting[] = [];
  private nextShooting = 2.5;
  private lastFocus: { x: number; y: number } | undefined;
  private camVel = { x: 0, y: 0 };

  constructor(private reduced: boolean) {
    this.layers = [
      { stars: [reduced ? 110 : 200, 0.5, 1.2, 1.05, 23], p: 0.2 },
      { stars: [reduced ? 30 : 55, 0.8, 1.8, 1.1, 37], p: 0.42 },
    ];
    this.nebulae = [101, 202, 303, 404, 505].map(paintNebula);
    this.galaxies = [7, 8, 9].map(paintGalaxy);
    this.planet = paintPlanet();
  }

  /** Where layer point (lx, ly) lands on screen, for a layer moving at `p` times the camera. */
  private offset(cam: Cam, p: number, t: number): { x: number; y: number } {
    const driftX = this.reduced ? 0 : t * 5;
    const driftY = this.reduced ? 0 : t * 2;
    return { x: cam.x - (cam.fx * REF + driftX) * p, y: cam.y - (cam.fy * REF + driftY) * p };
  }

  /** Calls `each` for every cell of a `size`-px grid on layer `p` that could show within the screen (plus `margin`). */
  private cells(cam: Cam, p: number, t: number, W: number, H: number, size: number, margin: number, each: (ix: number, iy: number, ox: number, oy: number) => void): void {
    const o = this.offset(cam, p, t);
    const x0 = Math.floor((-margin - o.x) / size);
    const x1 = Math.floor((W + margin - o.x) / size);
    const y0 = Math.floor((-margin - o.y) / size);
    const y1 = Math.floor((H + margin - o.y) / size);
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) each(ix, iy, o.x + ix * size, o.y + iy * size);
  }

  /** Everything: the still layers, then the lively ones. */
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Cam, t: number, dt: number, view: UniverseView): void {
    if (view.alpha <= 0) return;
    this.drawStill(ctx, W, H, cam, t, view.alpha);
    this.drawLively(ctx, W, H, cam, t, dt, view);
  }

  private zoomFor(W: number, H: number): number {
    return Math.max(0.6, Math.min(1.6, Math.min(W, H) / 800));
  }

  /**
   * Changes whenever drawStill would draw something different (a layer has
   * drifted a whole device pixel, or the far rocks have turned a little), so a
   * painted copy of the still layers can be reused until then.
   */
  stillKey(W: number, H: number, cam: Cam, t: number, k: number): string {
    const at = (p: number) => {
      const o = this.offset(cam, p, t);
      return `${Math.round(o.x * k)},${Math.round(o.y * k)}`;
    };
    return [W, H, k, at(DEEP_P), ...this.layers.map((l) => at(l.p)), at(PLANET_P), at(FAR_ROCK_P), this.reduced ? 0 : Math.floor(t * 2)].join("|");
  }

  /** The layers that only drift: deep sky, star fields, the planet and the distant rocks. */
  drawStill(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Cam, t: number, alpha = 1): void {
    const zoom = this.zoomFor(W, H);
    ctx.save();
    ctx.globalAlpha = alpha;
    const m = ctx.getTransform();
    // The exact scale: tiles painted for it land on whole device pixels.
    const k = m.a;
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    this.drawDeep(ctx, W, H, cam, t, zoom, m, k);

    // Star fields, near layers sliding faster than far ones. Each tile is drawn
    // whole and on exact device pixels: far cheaper than a shifted pattern fill.
    for (const layer of this.layers) {
      if (!layer.tile || layer.tile.k !== k) layer.tile = { k, canvas: paintStars(...layer.stars, Math.round(512 * k)) };
      const size = layer.tile.canvas.width / k;
      const o = this.offset(cam, layer.p, t);
      const x0 = snapX(m, (((o.x % size) + size) % size) - size);
      const y0 = snapY(m, (((o.y % size) + size) % size) - size);
      for (let x = x0; x < W; x += size) {
        for (let y = y0; y < H; y += size) ctx.drawImage(layer.tile.canvas, x, y, size, size);
      }
    }
    ctx.imageSmoothingEnabled = smooth;

    // A ringed planet hanging off to one side of where the bubble was.
    if (this.planet) {
      const o = this.offset(cam, PLANET_P, t);
      const size = 420 * zoom;
      ctx.drawImage(this.planet, o.x - 560 * zoom - size / 2, o.y + 280 * zoom - size / 2, size, size);
    }

    // Distant rocks, dim and small, drifting by slower than the ones Blitz can reach.
    this.cells(cam, FAR_ROCK_P, t, W, H, 360, 40, (ix, iy, cx, cy) => {
      const rnd = cellRandom(ix, iy, 5);
      if (rnd() > 0.2) return;
      const x = cx + rnd() * 360;
      const y = cy + rnd() * 360;
      const size = (5 + rnd() * 13) * zoom;
      const turn = rnd() * 6.28 + (this.reduced ? 0 : t * (rnd() - 0.5) * 0.5);
      const key = `${ix},${iy}`;
      let art = this.farRocks.get(key);
      if (!art) {
        art = makeRockArt((n) => unit(hash32(ix, iy, 5000 + n)), false, FAR_PALETTE);
        if (this.farRocks.size > 200) this.farRocks.clear();
        this.farRocks.set(key, art);
      }
      drawRockArt(ctx, art, x, y, size, turn, FAR_LIGHT, t);
    });
    ctx.restore();
  }

  /** The layers that change every frame: twinkling bright stars, shooting stars, passing dust, and the vignette. */
  drawLively(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Cam, t: number, dt: number, view: UniverseView): void {
    // How fast the camera is sweeping across space, for star streaks.
    if (this.lastFocus && dt > 0) {
      const kv = Math.min(1, dt * 8);
      this.camVel.x += ((cam.fx - this.lastFocus.x) / dt - this.camVel.x) * kv;
      this.camVel.y += ((cam.fy - this.lastFocus.y) / dt - this.camVel.y) * kv;
    }
    this.lastFocus = { x: cam.fx, y: cam.fy };
    const zoom = this.zoomFor(W, H);
    const k = ctx.getTransform().a;
    const dim = view.dim ?? (() => 1);
    ctx.save();
    ctx.globalAlpha = view.alpha;

    // Bright stars: twinkling, with soft spikes, and streaking when the camera rushes along.
    ctx.globalCompositeOperation = "lighter";
    const speed = Math.hypot(this.camVel.x, this.camVel.y) * REF;
    this.cells(cam, 0.32, t, W, H, 190, 20, (ix, iy, cx, cy) => {
      const rnd = cellRandom(ix, iy, 3);
      if (rnd() > 0.24) return;
      const x = cx + rnd() * 190;
      const y = cy + rnd() * 190;
      const r = 0.8 + rnd() * 1.6;
      const tint = rnd();
      const color: RGB = tint < 0.2 ? [255, 214, 170] : tint < 0.5 ? [170, 205, 255] : [235, 242, 255];
      const tw = (this.reduced ? 1 : 0.55 + 0.45 * Math.sin(t * (1 + rnd() * 2.5) + rnd() * 6.28)) * dim(x, y);
      if (speed * 0.32 > 90) {
        const vx = this.camVel.x * REF * 0.32 * 0.07;
        const vy = this.camVel.y * REF * 0.32 * 0.07;
        ctx.strokeStyle = rgba(color, 0.7 * tw);
        ctx.lineWidth = r;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + vx, y + vy);
        ctx.stroke();
        return;
      }
      const size = r * 7;
      ctx.globalAlpha = view.alpha * tw;
      ctx.drawImage(glowSprite(color), x - size, y - size, size * 2, size * 2);
      if (r > 1.6) {
        ctx.strokeStyle = rgba(color, 0.35 * tw);
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
    this.cells(cam, 1.5, t, W, H, 280, 20, (ix, iy, cx, cy) => {
      const rnd = cellRandom(ix, iy, 4);
      if (rnd() > 0.22) return;
      const size = (3 + rnd() * 6) * zoom;
      ctx.globalAlpha = view.alpha * (0.1 + rnd() * 0.15);
      const x = cx + rnd() * 280;
      const y = cy + rnd() * 280;
      ctx.globalAlpha *= dim(x, y);
      ctx.drawImage(glowSprite([200, 225, 255]), x - size, y - size, size * 2, size * 2);
    });
    ctx.globalAlpha = view.alpha;
    ctx.globalCompositeOperation = "source-over";

    if (view.vignette) this.drawVignette(ctx, W, H, k);
    ctx.restore();
  }

  /** The darkened edges: four bands around the untouched middle, copied pixel for pixel. */
  private drawVignette(ctx: CanvasRenderingContext2D, W: number, H: number, k: number): void {
    let v = this.vignette;
    if (!v || v.W !== W || v.H !== H || v.k !== k) v = this.vignette = paintVignette(W, H, k);
    const cw = v.canvas.width;
    const ch = v.canvas.height;
    const { x, y, w, h } = v.clear;
    const band = (sx: number, sy: number, sw: number, sh: number) => {
      if (sw > 0 && sh > 0) ctx.drawImage(v!.canvas, sx, sy, sw, sh, sx / k, sy / k, sw / k, sh / k);
    };
    band(0, 0, cw, y); // top
    band(0, y + h, cw, ch - y - h); // bottom
    band(0, y, x, h); // left
    band(x + w, y, cw - x - w, h); // right
  }

  /** The deep sky: the painted tiles on screen, painting any that are missing (a few per frame). */
  private drawDeep(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Cam, t: number, zoom: number, m: DOMMatrix, k: number): void {
    const key = `${k}|${zoom}`;
    if (key !== this.deepFor) {
      this.deep.clear();
      this.deepSpare = [];
      this.deepFor = key;
    }
    const px = Math.round(DEEP_TILE * k);
    const size = px / k;
    const o = this.offset(cam, DEEP_P, t);
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
    let budget = DEEP_PER_FRAME;
    for (const [tx, ty] of missing) {
      if (budget-- <= 0) break;
      this.deep.set(`${tx},${ty}`, this.paintDeepTile(tx, ty, px, k, zoom));
    }
    ctx.fillStyle = SPACE;
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        const id = `${tx},${ty}`;
        const tile = this.deep.get(id);
        const x = ox + tx * size;
        const y = oy + ty * size;
        if (tile) {
          // Most recently used goes last, so the oldest are dropped first.
          this.deep.delete(id);
          this.deep.set(id, tile);
          ctx.drawImage(tile, x, y, size, size);
        } else ctx.fillRect(x, y, size, size);
      }
    }
    // Spare time: paint the ring just off screen, so travelling finds it ready.
    for (let tx = x0 - 1; tx <= x1 + 1 && budget > 0; tx++) {
      for (let ty = y0 - 1; ty <= y1 + 1 && budget > 0; ty++) {
        if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) continue;
        const id = `${tx},${ty}`;
        if (this.deep.has(id)) continue;
        budget--;
        this.deep.set(id, this.paintDeepTile(tx, ty, px, k, zoom));
      }
    }
    while (this.deep.size > DEEP_KEEP) {
      const oldest = this.deep.keys().next().value as string;
      this.deepSpare.push(this.deep.get(oldest)!);
      this.deep.delete(oldest);
    }
  }

  /** One deep-sky tile, `px` device pixels square, covering layer pixels from (tx, ty) * its size. */
  private paintDeepTile(tx: number, ty: number, px: number, k: number, zoom: number): HTMLCanvasElement {
    const spare = this.deepSpare.pop();
    const [c, g] = spare ? [spare, spare.getContext("2d")!] : canvas(px);
    // A reused canvas still has the last tile's settings.
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    const size = px / k;
    const left = tx * size;
    const top = ty * size;
    g.setTransform(k, 0, 0, k, -left * k, -top * k);
    g.fillStyle = SPACE;
    g.fillRect(left, top, size, size);
    const overlaps = (x: number, y: number, r: number) => x + r > left && x - r < left + size && y + r > top && y - r < top + size;

    g.globalCompositeOperation = "lighter";
    // Huge, faint washes of color: the far depths.
    for (const [lx, ly, color] of WASHES) {
      const r = 900 * zoom;
      const x = lx * zoom;
      const y = ly * zoom;
      if (!overlaps(x, y, r)) continue;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, rgba(color, 0.2));
      grad.addColorStop(1, rgba(color, 0));
      g.fillStyle = grad;
      g.fillRect(left, top, size, size);
    }

    // The faintest stars.
    if (!this.faint || this.faint.k !== k) {
      const tile = paintStars(this.reduced ? 300 : FAINT_STARS[0], FAINT_STARS[1], FAINT_STARS[2], FAINT_STARS[3], FAINT_STARS[4], Math.round(512 * k));
      this.faint = { k, pattern: g.createPattern(tile, "repeat")! };
    }
    this.faint.pattern.setTransform(new DOMMatrix([1 / k, 0, 0, 1 / k, 0, 0]));
    g.globalCompositeOperation = "source-over";
    g.fillStyle = this.faint.pattern;
    g.fillRect(left, top, size, size);

    // Faraway galaxies (one is always up and to the right of where the bubble was).
    g.globalCompositeOperation = "lighter";
    this.layerCells(left, top, size, 900, 300, (ix, iy) => {
      const rnd = cellRandom(ix, iy, 1);
      if (!(ix === 0 && iy === -1) && rnd() > 0.32) return;
      const sprite = this.galaxies[Math.floor(rnd() * this.galaxies.length)];
      const s = (120 + rnd() * 140) * zoom;
      const x = ix * 900 + rnd() * 900;
      const y = iy * 900 + rnd() * 900;
      if (!overlaps(x, y, s / 2)) return;
      g.save();
      g.globalAlpha = 0.45 + rnd() * 0.4;
      g.translate(x, y);
      g.rotate(rnd() * Math.PI);
      g.scale(1, 0.38 + rnd() * 0.3);
      g.drawImage(sprite, -s / 2, -s / 2, s, s);
      g.restore();
    });

    // Nebulae. The cells around the middle always have some, so there's color the moment the bubble bursts.
    this.layerCells(left, top, size, 1500, 1100, (ix, iy) => {
      const rnd = cellRandom(ix, iy, 2);
      const home = ix === 0 && iy === 0;
      const neighbour = ix === -1 && iy === 0;
      if (!home && !neighbour && rnd() > 0.55) return;
      const sprite = this.nebulae[home ? 0 : neighbour ? 2 : Math.floor(rnd() * this.nebulae.length)];
      const s = (1000 + rnd() * 800) * zoom;
      const x = ix * 1500 + (home ? 300 : neighbour ? 1100 : rnd() * 1500);
      const y = iy * 1500 + (home ? 200 : neighbour ? -250 : rnd() * 1500);
      // The sprite's soft circle fits inside s / 2.
      if (!overlaps(x, y, s / 2)) return;
      g.save();
      g.globalAlpha = 0.55 + rnd() * 0.35;
      g.translate(x, y);
      g.rotate(rnd() * Math.PI * 2);
      g.drawImage(sprite, -s / 2, -s / 2, s, s);
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
