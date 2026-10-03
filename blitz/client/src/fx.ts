// Effects around Blitz: glowing particles, ripples on the wall, cracks in the
// bubble, the shatter when it bursts, and the little emotes Blitz gives off
// (hearts, stars, sweat drops, "?"...). Particles, ripples and emotes live in
// domain units so they stay put while the camera moves; shards, shockwaves
// and the flash are drawn straight in pixels.

export type RGB = readonly [number, number, number];

export interface Cam {
  /** Where on screen the camera's focus is drawn, in CSS pixels. */
  x: number;
  y: number;
  /** Pixels per domain unit. */
  s: number;
  /** The point in the domain the camera looks at (the bubble's middle, or Blitz out in open space). */
  fx: number;
  fy: number;
}

export function toScreen(cam: Cam, wx: number, wy: number): [number, number] {
  return [cam.x + cam.s * (wx - cam.fx), cam.y + cam.s * (wy - cam.fy)];
}

export function toWorld(cam: Cam, px: number, py: number): { x: number; y: number } {
  return { x: cam.fx + (px - cam.x) / cam.s, y: cam.fy + (py - cam.y) / cam.s };
}

export function mixCam(a: Cam, b: Cam, k: number): Cam {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, s: a.s + (b.s - a.s) * k, fx: a.fx + (b.fx - a.fx) * k, fy: a.fy + (b.fy - a.fy) * k };
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x: number) => {
  const k = clamp01(x);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};
export const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;

const sprites = new Map<string, HTMLCanvasElement>();

/** A soft round glow, cached per color (rounded so the cache stays small). */
export function glowSprite(c: RGB): HTMLCanvasElement {
  const q = c.map((v) => Math.round(v / 16) * 16) as unknown as RGB;
  const key = q.join(",");
  let sprite = sprites.get(key);
  if (!sprite) {
    sprite = document.createElement("canvas");
    sprite.width = sprite.height = 64;
    const g = sprite.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    grad.addColorStop(0.3, rgba(q, 0.6));
    grad.addColorStop(1, rgba(q, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    sprites.set(key, sprite);
  }
  return sprite;
}

// ---- Particles --------------------------------------------------------------

interface Particle {
  x: number; // domain units
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number; // px
  sprite: HTMLCanvasElement;
}

export class Particles {
  private list: Particle[] = [];
  /** When full, new particles replace old ones in turn from here. */
  private next = 0;
  constructor(private max: number) {}

  emit(x: number, y: number, vx: number, vy: number, life: number, size: number, color: RGB): void {
    const p = { x, y, vx, vy, life, max: life, size, sprite: glowSprite(color) };
    if (this.list.length < this.max) this.list.push(p);
    else this.list[(this.next = (this.next + 1) % this.max)] = p;
  }

  /** A spray from a point: all around, or aimed (with spread) along (dirX, dirY). */
  burst(x: number, y: number, n: number, speed: number, colors: RGB[], dirX?: number, dirY?: number, life = 1): void {
    const aim = dirX === undefined || dirY === undefined ? null : Math.atan2(dirY, dirX);
    for (let i = 0; i < n; i++) {
      const a = aim === null ? Math.random() * Math.PI * 2 : aim + (Math.random() - 0.5) * Math.PI * 0.9;
      const s = speed * rand(0.35, 1.15);
      const color = colors[(Math.random() * colors.length) | 0];
      this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, life * rand(0.5, 1.2), rand(1, 3.2), color);
    }
  }

  draw(ctx: CanvasRenderingContext2D, cam: Cam, dt: number): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const drag = Math.exp(-1.6 * dt);
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        // Added light doesn't care about order: move the last one into this slot.
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.life / p.max;
      const size = p.size * (0.6 + 0.8 * k) * 3;
      const [sx, sy] = toScreen(cam, p.x, p.y);
      ctx.globalAlpha = k;
      ctx.drawImage(p.sprite, sx - size, sy - size, size * 2, size * 2);
    }
    if (this.next >= list.length) this.next = 0;
    ctx.restore();
  }
}

// ---- Wall: ripples and cracks ----------------------------------------------------

export interface Ripple {
  /** Where on the rim, as the outward normal there. */
  nx: number;
  ny: number;
  born: number;
  power: number;
}

/** Light running along the bubble's rim from where something hit it. */
export function drawRipples(ctx: CanvasRenderingContext2D, cam: Cam, ripples: Ripple[], t: number, wallRadius: number): void {
  const [cx, cy] = toScreen(cam, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let i = ripples.length - 1; i >= 0; i--) {
    const rp = ripples[i];
    const age = t - rp.born;
    if (age > 1.1) {
      ripples.splice(i, 1);
      continue;
    }
    if (age < 0) continue;
    const fade = (1 - age / 1.1) * rp.power;
    const spread = 0.12 + age * 1.6;
    const a = Math.atan2(rp.ny, rp.nx);
    const width = 2 + 5 * fade;
    ctx.beginPath();
    ctx.arc(cx, cy, wallRadius, a - spread, a + spread);
    // The glow is wide, faint strokes under the bright one: a blurred shadow
    // along an arc this long is very slow to draw, and there can be several.
    ctx.lineWidth = width + 22 * fade;
    ctx.strokeStyle = `rgba(127, 227, 255, ${0.07 * fade})`;
    ctx.stroke();
    ctx.lineWidth = width + 9 * fade;
    ctx.strokeStyle = `rgba(127, 227, 255, ${0.16 * fade})`;
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.strokeStyle = `rgba(150, 235, 255, ${0.9 * fade})`;
    ctx.stroke();
  }
  ctx.restore();
}

export interface Crack {
  /** Polylines in polar domain coordinates: [radius, angle]. */
  lines: Array<Array<[number, number]>>;
  /** The strain it appeared at. It fades as the wall heals below that. */
  level: number;
  born: number;
}

/** A jagged crack running in from the rim at angle `a0`; deeper and more branched the more strained the wall. */
export function makeCrack(a0: number, level: number, born: number): Crack {
  const lines: Crack["lines"] = [];
  const main: Array<[number, number]> = [[1, a0]];
  const depth = 0.1 + level * 0.38;
  const steps = 4 + Math.floor(level * 5);
  let r = 1;
  let a = a0;
  for (let i = 0; i < steps; i++) {
    r -= (depth / steps) * rand(0.6, 1.4);
    a += rand(-0.07, 0.07);
    main.push([r, a]);
    if (Math.random() < 0.35 + level * 0.3) {
      const branch: Array<[number, number]> = [[r, a]];
      let br = r;
      let ba = a;
      const turn = Math.random() < 0.5 ? -1 : 1;
      for (let j = 0; j < 2 + ((Math.random() * 2) | 0); j++) {
        br -= rand(0.02, 0.06);
        ba += turn * rand(0.03, 0.09);
        branch.push([br, ba]);
      }
      lines.push(branch);
    }
  }
  lines.push(main);
  // A fracture running along the rim from the impact point.
  for (const dir of [-1, 1]) {
    const rim: Array<[number, number]> = [[0.995, a0]];
    let ra = a0;
    for (let i = 0; i < 2 + Math.floor(level * 3); i++) {
      ra += dir * rand(0.04, 0.1);
      rim.push([rand(0.955, 0.99), ra]);
    }
    lines.push(rim);
  }
  return { lines, level, born };
}

/** How visible a crack is: fully at the strain it appeared at, gone once the wall has healed to about half of that. */
export function crackAlpha(c: Crack, strain: number, t: number): number {
  const healed = clamp01((strain - c.level * 0.5) / (c.level * 0.5));
  return healed * clamp01((t - c.born) / 0.08);
}

/**
 * Draws the cracks and drops the healed ones. `mended` hears where each
 * healed crack was (the middle of its main line, in domain units) so the
 * caller can sparkle it closed.
 */
export function drawCracks(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cracks: Crack[],
  strain: number,
  t: number,
  wallRadius: number,
  mended?: (x: number, y: number) => void,
): void {
  if (cracks.length === 0) return;
  const [cx, cy] = toScreen(cam, 0, 0);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let i = cracks.length - 1; i >= 0; i--) {
    const c = cracks[i];
    const alpha = crackAlpha(c, strain, t);
    if (alpha <= 0 && t - c.born > 0.4) {
      const main = c.lines[c.lines.length - 3] ?? c.lines[0];
      const [r, a] = main[Math.floor(main.length / 2)];
      mended?.(Math.cos(a) * r, Math.sin(a) * r);
      cracks.splice(i, 1);
      continue;
    }
    if (alpha <= 0) continue;
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass === 0 ? `rgba(127, 227, 255, ${0.35 * alpha})` : `rgba(235, 250, 255, ${0.9 * alpha})`;
      ctx.lineWidth = (pass === 0 ? 4 : 1.3) * (0.4 + 0.6 * alpha);
      ctx.beginPath();
      for (const line of c.lines) {
        line.forEach(([r, a], k) => {
          const px = cx + Math.cos(a) * r * wallRadius;
          const py = cy + Math.sin(a) * r * wallRadius;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---- The burst: shards, shockwaves, flash -----------------------------------------

interface Shard {
  x: number; // px
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  pts: Array<[number, number]>;
  life: number;
  max: number;
}

interface Shock {
  x: number;
  y: number;
  born: number;
  speed: number;
  width: number;
  color: RGB;
  /** Negative: an implosion, closing in to `to` px. */
  to?: number;
  from?: number;
}

interface Gathering {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  rot: number;
  pts: Array<[number, number]>;
  start: number;
  dur: number;
}

export class Shatter {
  private shards: Shard[] = [];
  private shocks: Shock[] = [];
  private gathering: Gathering[] = [];
  private flashAt = -10;
  private flashPower = 0;

  /** Breaks a bubble of radius `r` px centered at (cx, cy) into flying glass, hardest where it gave way. */
  explode(cx: number, cy: number, r: number, breakAngle: number, t: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.05, 0.05);
      const toward = Math.max(0, Math.cos(a - breakAngle));
      const speed = rand(260, 700) * (1 + 1.8 * toward * toward);
      const size = rand(8, 24) * (r / 260 + 0.5);
      const pts: Array<[number, number]> = [];
      for (let k = 0; k < 3; k++) {
        const pa = (k / 3) * Math.PI * 2 + rand(-0.5, 0.5);
        pts.push([Math.cos(pa) * size * rand(0.5, 1.2), Math.sin(pa) * size * rand(0.5, 1.2)]);
      }
      const life = rand(1.1, 1.9);
      this.shards.push({
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        rot: rand(0, Math.PI * 2),
        vr: rand(-9, 9),
        pts,
        life,
        max: life,
      });
    }
    // One shockwave, from the point where it broke; the opening universe carries the rest.
    const bx = cx + Math.cos(breakAngle) * r;
    const by = cy + Math.sin(breakAngle) * r;
    this.shocks.push({ x: bx, y: by, born: t, speed: 2600, width: 10, color: [255, 255, 255] });
  }

  /** A ring closing in from `from` px to `to` px around (x, y): the bubble gathering itself back up. */
  implode(x: number, y: number, from: number, to: number, t: number): void {
    this.shocks.push({ x, y, born: t, speed: 0, width: 14, color: [127, 227, 255], from, to });
  }

  /** Glass flying in from all around and settling into a bubble of radius `r` at (cx, cy) by `t + dur`. */
  gather(cx: number, cy: number, r: number, reach: number, t: number, dur: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.06, 0.06);
      const from = reach * rand(0.55, 1);
      const size = rand(7, 20) * (r / 260 + 0.5);
      const pts: Array<[number, number]> = [];
      for (let k = 0; k < 3; k++) {
        const pa = (k / 3) * Math.PI * 2 + rand(-0.5, 0.5);
        pts.push([Math.cos(pa) * size * rand(0.5, 1.2), Math.sin(pa) * size * rand(0.5, 1.2)]);
      }
      this.gathering.push({
        x0: cx + Math.cos(a) * from,
        y0: cy + Math.sin(a) * from,
        x1: cx + Math.cos(a) * r,
        y1: cy + Math.sin(a) * r,
        rot: rand(-6, 6),
        pts,
        start: t + rand(0, dur * 0.25),
        dur: dur * rand(0.7, 0.75),
      });
    }
  }

  flash(t: number, power: number): void {
    this.flashAt = t;
    this.flashPower = power;
  }

  get busy(): boolean {
    return this.shards.length > 0 || this.shocks.length > 0 || this.gathering.length > 0;
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, dt: number): void {
    const reach = Math.hypot(W, H);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      const age = t - s.born;
      if (age < 0) continue;
      let radius: number;
      let fade: number;
      if (s.to !== undefined && s.from !== undefined) {
        const k = easeOut(age / 0.7);
        radius = s.from + (s.to - s.from) * k;
        fade = age < 0.7 ? 0.4 + 0.6 * k : 1 - (age - 0.7) / 0.35;
        if (age > 1.05) {
          this.shocks.splice(i, 1);
          continue;
        }
      } else {
        radius = age * s.speed;
        fade = 1 - radius / reach;
        if (fade <= 0) {
          this.shocks.splice(i, 1);
          continue;
        }
      }
      const width = s.width * Math.max(0.2, fade);
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(1, radius), 0, Math.PI * 2);
      // Glow from wide, faint strokes: a blurred shadow on a ring this big would cover the screen.
      ctx.lineWidth = width + 30 * fade;
      ctx.strokeStyle = rgba(s.color, 0.06 * fade);
      ctx.stroke();
      ctx.lineWidth = width + 12 * fade;
      ctx.strokeStyle = rgba(s.color, 0.14 * fade);
      ctx.stroke();
      ctx.lineWidth = width;
      ctx.strokeStyle = rgba(s.color, 0.85 * fade);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.shards.splice(i, 1);
        continue;
      }
      const drag = Math.exp(-1.3 * dt);
      s.vx *= drag;
      s.vy *= drag;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
      const k = s.life / s.max;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.beginPath();
      s.pts.forEach(([px, py], j) => (j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.closePath();
      ctx.fillStyle = `rgba(190, 232, 255, ${0.22 * k})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(225, 248, 255, ${0.85 * k})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    ctx.save();
    for (let i = this.gathering.length - 1; i >= 0; i--) {
      const g = this.gathering[i];
      const k = (t - g.start) / g.dur;
      if (k >= 1) {
        this.gathering.splice(i, 1);
        continue;
      }
      if (k < 0) continue;
      const e = easeInOut(k);
      ctx.save();
      ctx.translate(g.x0 + (g.x1 - g.x0) * e, g.y0 + (g.y1 - g.y0) * e);
      ctx.rotate(g.rot * (1 - e));
      ctx.beginPath();
      g.pts.forEach(([px, py], j) => (j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.closePath();
      const alpha = Math.min(1, k * 4) * (1 - Math.max(0, k - 0.85) / 0.15);
      ctx.fillStyle = `rgba(190, 232, 255, ${0.22 * alpha})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(225, 248, 255, ${0.85 * alpha})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    const fa = t - this.flashAt;
    if (fa >= 0 && fa < 0.55) {
      ctx.save();
      ctx.fillStyle = `rgba(235, 250, 255, ${this.flashPower * Math.pow(1 - fa / 0.55, 2)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
}

// ---- Emotes ------------------------------------------------------------------------

export type EmoteKind = "heart" | "star" | "spark" | "note" | "bang" | "question" | "anger" | "sweat" | "tear" | "z";

interface Emote {
  kind: EmoteKind;
  /** Domain units. Attached emotes are offsets from Blitz in radii of Blitz; free ones are positions. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  size: number; // in Blitz radii
  rot: number;
  vr: number;
  attached: boolean;
  fall: number; // gravity, for tears
}

const EMOTE_COLORS: Record<EmoteKind, string> = {
  heart: "#FF7EB6",
  star: "#FFD86E",
  spark: "#BFF3FF",
  note: "#D7C6FF",
  bang: "#FFFFFF",
  question: "#FFFFFF",
  anger: "#FF5A5A",
  sweat: "#9EDCFF",
  tear: "#7FC8FF",
  z: "#CFE6FF",
};

function heartPath(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.45, -s * 1.05, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.45, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35);
  ctx.closePath();
}

function starPath(ctx: CanvasRenderingContext2D, s: number, points: number, inner: number): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? s : s * inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

function dropPath(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.9, -s * 0.1, s * 0.7, s * 0.8, 0, s * 0.8);
  ctx.bezierCurveTo(-s * 0.7, s * 0.8, -s * 0.9, -s * 0.1, 0, -s);
  ctx.closePath();
}

export class Emotes {
  private list: Emote[] = [];

  /** A free emote at a domain position, drifting with (vx, vy) domain units per second. */
  float(kind: EmoteKind, x: number, y: number, vx: number, vy: number, t: number, life = 1.4, size = 0.45, fall = 0): void {
    if (this.list.length > 80) this.list.shift();
    this.list.push({ kind, x, y, vx, vy, born: t, life, size, rot: rand(-0.3, 0.3), vr: rand(-0.8, 0.8), attached: false, fall });
  }

  /** An emote that rides along with Blitz, at (ox, oy) Blitz-radii from its center. */
  attach(kind: EmoteKind, ox: number, oy: number, t: number, life = 1.2, size = 0.5): void {
    this.list = this.list.filter((e) => !(e.attached && e.kind === kind));
    this.list.push({ kind, x: ox, y: oy, vx: 0, vy: 0, born: t, life, size, rot: 0, vr: 0, attached: true, fall: 0 });
  }

  clearAttached(): void {
    this.list = this.list.filter((e) => !e.attached);
  }

  draw(ctx: CanvasRenderingContext2D, cam: Cam, blitz: { x: number; y: number; r: number }, t: number, dt: number, font: string): void {
    ctx.save();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      const age = t - e.born;
      if (age > e.life) {
        this.list.splice(i, 1);
        continue;
      }
      let px: number;
      let py: number;
      if (e.attached) {
        px = blitz.x + e.x * blitz.r;
        py = blitz.y + e.y * blitz.r;
      } else {
        e.vy += e.fall * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.rot += e.vr * dt;
        [px, py] = toScreen(cam, e.x, e.y);
      }
      const pop = age < 0.18 ? easeOut(age / 0.18) * 1.15 : 1 + 0.15 * Math.max(0, 1 - (age - 0.18) / 0.15);
      const fade = Math.min(1, (e.life - age) / 0.35);
      const s = e.size * blitz.r * pop;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(e.rot + (e.kind === "anger" ? Math.sin(age * 14) * 0.08 : 0));
      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillStyle = EMOTE_COLORS[e.kind];
      ctx.strokeStyle = EMOTE_COLORS[e.kind];
      ctx.shadowColor = EMOTE_COLORS[e.kind];
      ctx.shadowBlur = 8;
      switch (e.kind) {
        case "heart":
          heartPath(ctx, s);
          ctx.fill();
          break;
        case "star":
          starPath(ctx, s * 0.8, 5, 0.45);
          ctx.fill();
          break;
        case "spark":
          starPath(ctx, s * 0.7, 4, 0.22);
          ctx.fill();
          break;
        case "sweat":
        case "tear":
          dropPath(ctx, s * 0.55);
          ctx.fill();
          break;
        case "anger": {
          ctx.lineWidth = Math.max(1.5, s * 0.16);
          ctx.lineCap = "round";
          for (let q = 0; q < 4; q++) {
            ctx.save();
            ctx.rotate((q * Math.PI) / 2);
            ctx.beginPath();
            ctx.arc(s * 0.62, s * 0.62, s * 0.42, Math.PI * 1.05, Math.PI * 1.45);
            ctx.stroke();
            ctx.restore();
          }
          break;
        }
        default: {
          const glyph = e.kind === "bang" ? "!" : e.kind === "question" ? "?" : e.kind === "note" ? "♪" : "z";
          ctx.font = `700 ${Math.round(s * 1.6)}px ${font}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(glyph, 0, 0);
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

// ---- Speech and thought bubbles -------------------------------------------------------

/** Splits text into lines that fit `maxWidth`, at most `maxLines` (the last one ellipsized). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  // A single unbreakable word that's still too wide gets cut too.
  return lines.map((l) => {
    let out = l;
    while (out.length > 1 && ctx.measureText(out).width > maxWidth) out = `${out.slice(0, -2)}…`;
    return out;
  });
}

/** Blitz's words, in a bubble above it (or below, near the top), wrapped and kept on screen. */
export function drawSpeech(
  ctx: CanvasRenderingContext2D,
  text: string,
  blitz: { x: number; y: number; r: number },
  age: number,
  life: number,
  W: number,
  H: number,
  font: string,
): void {
  if (age < 0 || age > life) return;
  const size = Math.max(13, Math.min(17, blitz.r * 0.52));
  ctx.save();
  ctx.font = `600 ${Math.round(size)}px ${font}`;
  const padX = size * 0.8;
  const lines = wrap(ctx, text, Math.min(300, W * 0.7) - padX * 2, 4);
  const lineH = size * 1.3;
  const w = Math.min(W - 16, Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2);
  const h = lines.length * lineH + size * 0.75;
  const gap = blitz.r * 1.55;
  const above = blitz.y - gap - h > 8;
  const bx = Math.max(8, Math.min(W - w - 8, blitz.x - w / 2));
  const by = above ? blitz.y - gap - h : Math.min(H - h - 8, blitz.y + gap);
  const tailX = Math.max(bx + 14, Math.min(bx + w - 14, blitz.x));
  const tailY = above ? by + h : by;
  const pop = age < 0.22 ? 0.6 + 0.4 * easeOut(age / 0.22) + 0.08 * Math.sin((age / 0.22) * Math.PI) : 1;
  const fade = Math.min(1, (life - age) / 0.3, age / 0.08);
  ctx.globalAlpha = Math.max(0, fade);
  ctx.translate(tailX, tailY);
  ctx.scale(pop, pop);
  ctx.translate(-tailX, -tailY);
  ctx.fillStyle = "rgba(240, 248, 255, 0.96)";
  ctx.shadowColor = "rgba(127, 227, 255, 0.55)";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, Math.min(h / 2, 18));
  ctx.fill();
  ctx.beginPath();
  const dir = above ? 1 : -1;
  ctx.moveTo(tailX - 7, tailY - dir * 1);
  ctx.lineTo(tailX, tailY + dir * 8);
  ctx.lineTo(tailX + 7, tailY - dir * 1);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#13223F";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => ctx.fillText(line, bx + w / 2, by + size * 0.4 + lineH * (i + 0.5) + 1));
  ctx.restore();
}

/** Blitz thinking: a little cloud with three dots bobbing in turn, and two puffs trailing down to it. */
export function drawThought(ctx: CanvasRenderingContext2D, blitz: { x: number; y: number; r: number }, age: number, W: number): void {
  if (age < 0) return;
  const size = Math.max(10, Math.min(15, blitz.r * 0.45));
  const w = size * 4.2;
  const h = size * 2.2;
  const cx = Math.max(w / 2 + 8, Math.min(W - w / 2 - 8, blitz.x + blitz.r * 1.2));
  const cy = Math.max(h / 2 + 8, blitz.y - blitz.r * 2.4);
  const appear = easeOut(age / 0.25);
  ctx.save();
  ctx.globalAlpha = appear;
  ctx.fillStyle = "rgba(240, 248, 255, 0.92)";
  ctx.shadowColor = "rgba(127, 227, 255, 0.5)";
  ctx.shadowBlur = 12;
  // The puffs between Blitz and the cloud.
  const puffs: Array<[number, number]> = [
    [blitz.x + blitz.r * 0.75, blitz.y - blitz.r * 1.15],
    [(blitz.x + blitz.r * 0.75 + cx) / 2, (blitz.y - blitz.r * 1.15 + cy + h / 2) / 2],
  ];
  puffs.forEach(([px, py], i) => {
    ctx.beginPath();
    ctx.arc(px, py, size * (0.18 + i * 0.12) * appear, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.beginPath();
  ctx.roundRect(cx - (w / 2) * appear, cy - (h / 2) * appear, w * appear, h * appear, (h / 2) * appear);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#13223F";
  for (let i = 0; i < 3; i++) {
    const bob = Math.max(0, Math.sin(age * 7 - i * 0.9));
    ctx.globalAlpha = appear * (0.45 + 0.55 * bob);
    ctx.beginPath();
    ctx.arc(cx + (i - 1) * size * 1.05, cy - bob * size * 0.25, size * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
