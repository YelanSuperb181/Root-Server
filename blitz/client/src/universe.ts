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

interface Deep {
  canvas: HTMLCanvasElement;
  W: number;
  H: number;
  zoom: number;
  /** Where the nebula layer sat when it was painted. */
  ref: { x: number; y: number };
  t: number;
}

const NEBULA_P = 0.07;
const DEEP_SCALE = 0.5;
const DEEP_MARGIN = 24;

/** Darkened edges for full-screen views, painted once per size at quarter resolution. */
function paintVignette(W: number, H: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(W / 4));
  c.height = Math.max(1, Math.ceil(H / 4));
  const g = c.getContext("2d")!;
  g.scale(c.width / W, c.height / H);
  const d = Math.hypot(W, H);
  const v = g.createRadialGradient(W / 2, H / 2, d * 0.32, W / 2, H / 2, d * 0.62);
  v.addColorStop(0, "rgba(2, 3, 10, 0)");
  v.addColorStop(1, "rgba(2, 3, 10, 0.6)");
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  return c;
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
}

export class Universe {
  /** Hears where each new shooting star appears (screen pixels), so Blitz can look. */
  onShootingStar: ((x: number, y: number) => void) | undefined;
  private layers: StarLayer[] = [];
  /** The far depths (background glow, color washes, galaxies, nebulae), painted at low resolution and redrawn only when they've moved. */
  private deep: Deep | undefined;
  private vignette: { canvas: HTMLCanvasElement; W: number; H: number } | undefined;
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
      { stars: [reduced ? 300 : 650, 0.3, 0.8, 9, 11], p: 0.08 },
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

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Cam, t: number, dt: number, view: UniverseView): void {
    if (view.alpha <= 0) return;
    // How fast the camera is sweeping across space, for star streaks.
    if (this.lastFocus && dt > 0) {
      const k = Math.min(1, dt * 8);
      this.camVel.x += ((cam.fx - this.lastFocus.x) / dt - this.camVel.x) * k;
      this.camVel.y += ((cam.fy - this.lastFocus.y) / dt - this.camVel.y) * k;
    }
    this.lastFocus = { x: cam.fx, y: cam.fy };
    const zoom = Math.max(0.6, Math.min(1.6, Math.min(W, H) / 800));

    ctx.save();
    ctx.globalAlpha = view.alpha;
    this.drawDeep(ctx, W, H, cam, t, zoom);

    // Star fields, near layers sliding faster than far ones. Each tile is drawn
    // whole and on exact device pixels: far cheaper than a shifted pattern fill.
    ctx.globalCompositeOperation = "source-over";
    const m = ctx.getTransform();
    const k = Math.max(0.25, Math.round(m.a * 100) / 100);
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    for (const layer of this.layers) {
      if (!layer.tile || layer.tile.k !== k) layer.tile = { k, canvas: paintStars(...layer.stars, Math.round(512 * k)) };
      const size = layer.tile.canvas.width / k;
      const o = this.offset(cam, layer.p, t);
      const x0 = (((o.x % size) + size) % size) - size;
      const y0 = (((o.y % size) + size) % size) - size;
      for (let x = x0; x < W; x += size) {
        for (let y = y0; y < H; y += size) {
          ctx.drawImage(layer.tile.canvas, (Math.round(m.a * x + m.e) - m.e) / m.a, (Math.round(m.d * y + m.f) - m.f) / m.d, size, size);
        }
      }
    }
    ctx.imageSmoothingEnabled = smooth;

    // A ringed planet hanging off to one side of where the bubble was.
    if (this.planet) {
      const o = this.offset(cam, 0.11, t);
      const size = 420 * zoom;
      ctx.drawImage(this.planet, o.x - 560 * zoom - size / 2, o.y + 280 * zoom - size / 2, size, size);
    }

    // Distant rocks, dim and small, drifting by slower than the ones Blitz can reach.
    this.cells(cam, 0.5, t, W, H, 360, 40, (ix, iy, cx, cy) => {
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
      const tw = this.reduced ? 1 : 0.55 + 0.45 * Math.sin(t * (1 + rnd() * 2.5) + rnd() * 6.28);
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
      ctx.drawImage(glowSprite([200, 225, 255]), cx + rnd() * 280 - size, cy + rnd() * 280 - size, size * 2, size * 2);
    });
    ctx.globalAlpha = view.alpha;
    ctx.globalCompositeOperation = "source-over";

    if (view.vignette) {
      if (!this.vignette || this.vignette.W !== W || this.vignette.H !== H) this.vignette = { canvas: paintVignette(W, H), W, H };
      ctx.drawImage(this.vignette.canvas, 0, 0, W, H);
    }
    ctx.restore();
  }

  /**
   * The far depths. They barely move (a few percent of the camera's speed), so
   * they're painted at half resolution, where their soft glows look the same,
   * and only repainted once they've drifted a few pixels or a second has
   * passed. In between, the painted copy just slides along with them.
   */
  private drawDeep(ctx: CanvasRenderingContext2D, W: number, H: number, cam: Cam, t: number, zoom: number): void {
    const ref = this.offset(cam, NEBULA_P, t);
    let d = this.deep;
    if (!d || d.W !== W || d.H !== H || d.zoom !== zoom || Math.abs(ref.x - d.ref.x) > 3 || Math.abs(ref.y - d.ref.y) > 3 || t - d.t > 1 || t < d.t) {
      d = this.paintDeep(W, H, cam, t, zoom, ref, d?.canvas);
      this.deep = d;
    }
    ctx.drawImage(d.canvas, -DEEP_MARGIN + ref.x - d.ref.x, -DEEP_MARGIN + ref.y - d.ref.y, W + DEEP_MARGIN * 2, H + DEEP_MARGIN * 2);
  }

  private paintDeep(W: number, H: number, cam: Cam, t: number, zoom: number, ref: { x: number; y: number }, reuse?: HTMLCanvasElement): Deep {
    const c = reuse ?? document.createElement("canvas");
    const w = Math.ceil((W + DEEP_MARGIN * 2) * DEEP_SCALE);
    const h = Math.ceil((H + DEEP_MARGIN * 2) * DEEP_SCALE);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(DEEP_SCALE, 0, 0, DEEP_SCALE, DEEP_MARGIN * DEEP_SCALE, DEEP_MARGIN * DEEP_SCALE);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    const base = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H / 2, Math.hypot(W, H) * 0.7);
    base.addColorStop(0, "#0E1738");
    base.addColorStop(0.6, "#080C22");
    base.addColorStop(1, "#04060F");
    ctx.fillStyle = base;
    ctx.fillRect(-DEEP_MARGIN, -DEEP_MARGIN, W + DEEP_MARGIN * 2, H + DEEP_MARGIN * 2);

    ctx.globalCompositeOperation = "lighter";
    // Huge, faint washes of color, barely moving: the far depths.
    const wash = this.offset(cam, 0.02, t);
    const washes: Array<[number, number, RGB]> = [
      [-620, -300, [40, 140, 170]],
      [700, 220, [110, 70, 200]],
      [80, 640, [50, 60, 170]],
      [-200, 420, [160, 60, 140]],
    ];
    for (const [lx, ly, c] of washes) {
      const r = 900 * zoom;
      const x = wash.x + lx * zoom;
      const y = wash.y + ly * zoom;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(c, 0.2));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Faraway galaxies (one is always up and to the right of where the bubble was).
    this.cells(cam, 0.035, t, W, H, 900, 200, (ix, iy, cx, cy) => {
      const rnd = cellRandom(ix, iy, 1);
      if (!(ix === 0 && iy === -1) && rnd() > 0.32) return;
      const sprite = this.galaxies[Math.floor(rnd() * this.galaxies.length)];
      const size = (120 + rnd() * 140) * zoom;
      ctx.save();
      ctx.globalAlpha = 0.45 + rnd() * 0.4;
      ctx.translate(cx + rnd() * 900, cy + rnd() * 900);
      ctx.rotate(rnd() * Math.PI);
      ctx.scale(1, 0.38 + rnd() * 0.3);
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
    });

    // Nebulae. The cells around the middle always have some, so there's color the moment the bubble bursts.
    this.cells(cam, NEBULA_P, t, W, H, 1500, 1000, (ix, iy, cx, cy) => {
      const rnd = cellRandom(ix, iy, 2);
      const home = ix === 0 && iy === 0;
      const neighbour = ix === -1 && iy === 0;
      if (!home && !neighbour && rnd() > 0.55) return;
      const sprite = this.nebulae[home ? 0 : neighbour ? 2 : Math.floor(rnd() * this.nebulae.length)];
      const size = (1000 + rnd() * 800) * zoom;
      const x = home ? cx + 300 : neighbour ? cx + 1100 : cx + rnd() * 1500;
      const y = home ? cy + 200 : neighbour ? cy - 250 : cy + rnd() * 1500;
      ctx.save();
      ctx.globalAlpha = 0.55 + rnd() * 0.35;
      ctx.translate(x, y);
      ctx.rotate(rnd() * Math.PI * 2 + (this.reduced ? 0 : t * 0.003));
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
    });
    return { canvas: c, W, H, zoom, ref, t };
  }
}
