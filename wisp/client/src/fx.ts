// Effects around Wisp: glowing particles, ripples on the wall, cracks in the
// bubble, the shatter when it bursts, and the little emotes Wisp gives off
// (hearts, stars, sweat drops, "?"...). Particles, ripples and emotes live in
// domain units so they stay put while the camera moves; shards, shockwaves
// and the flash are drawn straight in pixels.

export type RGB = readonly [number, number, number];

export interface Cam {
  /** Screen position of the domain's center, in CSS pixels. */
  x: number;
  y: number;
  /** Pixels per domain unit. */
  s: number;
  /** Rotation, radians (phones in portrait turn the open arena sideways). */
  rot: number;
}

export function toScreen(cam: Cam, wx: number, wy: number): [number, number] {
  const c = Math.cos(cam.rot);
  const s = Math.sin(cam.rot);
  return [cam.x + cam.s * (c * wx - s * wy), cam.y + cam.s * (s * wx + c * wy)];
}

export function toWorld(cam: Cam, px: number, py: number): { x: number; y: number } {
  const c = Math.cos(cam.rot);
  const s = Math.sin(cam.rot);
  const dx = (px - cam.x) / cam.s;
  const dy = (py - cam.y) / cam.s;
  return { x: c * dx + s * dy, y: -s * dx + c * dy };
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
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
  color: RGB;
}

export class Particles {
  private list: Particle[] = [];
  constructor(private max: number) {}

  emit(x: number, y: number, vx: number, vy: number, life: number, size: number, color: RGB): void {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ x, y, vx, vy, life, max: life, size, color });
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
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      const drag = Math.exp(-1.6 * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.life / p.max;
      const size = p.size * (0.6 + 0.8 * k) * 3;
      const [sx, sy] = toScreen(cam, p.x, p.y);
      ctx.globalAlpha = k;
      ctx.drawImage(glowSprite(p.color), sx - size, sy - size, size * 2, size * 2);
    }
    ctx.restore();
  }
}

// ---- Wall: ripples and cracks ----------------------------------------------------

export interface Ripple {
  /** Where on the wall (domain units) and the wall's outward normal there. */
  x: number;
  y: number;
  nx: number;
  ny: number;
  born: number;
  power: number;
  open: boolean;
}

export function drawRipples(ctx: CanvasRenderingContext2D, cam: Cam, ripples: Ripple[], t: number, wallRadius: number): void {
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
    const fade = (1 - age / 1.1) * rp.power;
    ctx.lineWidth = 2 + 5 * fade;
    ctx.strokeStyle = `rgba(150, 235, 255, ${0.9 * fade})`;
    ctx.shadowColor = "rgba(127, 227, 255, 1)";
    ctx.shadowBlur = 20 * fade;
    ctx.beginPath();
    if (rp.open) {
      const half = 0.12 + age * 1.6;
      const [ax, ay] = toScreen(cam, rp.x - rp.ny * half, rp.y + rp.nx * half);
      const [bx, by] = toScreen(cam, rp.x + rp.ny * half, rp.y - rp.nx * half);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    } else {
      const spread = 0.12 + age * 1.6;
      const a = Math.atan2(rp.ny, rp.nx) + cam.rot;
      ctx.arc(cam.x, cam.y, wallRadius, a - spread, a + spread);
    }
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

export function drawCracks(ctx: CanvasRenderingContext2D, cam: Cam, cracks: Crack[], strain: number, t: number, wallRadius: number): void {
  if (cracks.length === 0) return;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let i = cracks.length - 1; i >= 0; i--) {
    const c = cracks[i];
    if (strain < c.level - 0.14 && t - c.born > 0.4) {
      cracks.splice(i, 1);
      continue;
    }
    const alpha = clamp01((strain - c.level + 0.14) / 0.14) * clamp01((t - c.born) / 0.08);
    if (alpha <= 0) continue;
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass === 0 ? `rgba(127, 227, 255, ${0.35 * alpha})` : `rgba(235, 250, 255, ${0.9 * alpha})`;
      ctx.lineWidth = pass === 0 ? 4 : 1.3;
      ctx.beginPath();
      for (const line of c.lines) {
        line.forEach(([r, a], k) => {
          const px = cam.x + Math.cos(a + cam.rot) * r * wallRadius;
          const py = cam.y + Math.sin(a + cam.rot) * r * wallRadius;
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

export class Shatter {
  private shards: Shard[] = [];
  private shocks: Shock[] = [];
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
    // The point where it broke lets go first.
    const bx = cx + Math.cos(breakAngle) * r;
    const by = cy + Math.sin(breakAngle) * r;
    this.shocks.push({ x: bx, y: by, born: t, speed: 2600, width: 10, color: [255, 255, 255] });
    this.shocks.push({ x: cx, y: cy, born: t + 0.05, speed: 1300, width: 22, color: [127, 227, 255] });
    this.shocks.push({ x: cx, y: cy, born: t + 0.12, speed: 800, width: 30, color: [200, 168, 255] });
  }

  /** A ring closing in from `from` px to `to` px around (x, y): the bubble gathering itself back up. */
  implode(x: number, y: number, from: number, to: number, t: number): void {
    this.shocks.push({ x, y, born: t, speed: 0, width: 14, color: [127, 227, 255], from, to });
  }

  flash(t: number, power: number): void {
    this.flashAt = t;
    this.flashPower = power;
  }

  get busy(): boolean {
    return this.shards.length > 0 || this.shocks.length > 0;
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
      ctx.strokeStyle = rgba(s.color, 0.85 * fade);
      ctx.lineWidth = s.width * Math.max(0.2, fade);
      ctx.shadowColor = rgba(s.color, 1);
      ctx.shadowBlur = 24 * fade;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(1, radius), 0, Math.PI * 2);
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
  /** Domain units. Attached emotes are offsets from Wisp in radii of Wisp; free ones are positions. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  size: number; // in Wisp radii
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

  /** An emote that rides along with Wisp, at (ox, oy) Wisp-radii from its center. */
  attach(kind: EmoteKind, ox: number, oy: number, t: number, life = 1.2, size = 0.5): void {
    this.list = this.list.filter((e) => !(e.attached && e.kind === kind));
    this.list.push({ kind, x: ox, y: oy, vx: 0, vy: 0, born: t, life, size, rot: 0, vr: 0, attached: true, fall: 0 });
  }

  clearAttached(): void {
    this.list = this.list.filter((e) => !e.attached);
  }

  draw(ctx: CanvasRenderingContext2D, cam: Cam, wisp: { x: number; y: number; r: number }, t: number, dt: number, font: string): void {
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
        px = wisp.x + e.x * wisp.r;
        py = wisp.y + e.y * wisp.r;
      } else {
        e.vy += e.fall * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.rot += e.vr * dt;
        [px, py] = toScreen(cam, e.x, e.y);
      }
      const pop = age < 0.18 ? easeOut(age / 0.18) * 1.15 : 1 + 0.15 * Math.max(0, 1 - (age - 0.18) / 0.15);
      const fade = Math.min(1, (e.life - age) / 0.35);
      const s = e.size * wisp.r * pop;
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

// ---- Speech bubble -------------------------------------------------------------------

/** Wisp's little line, in a bubble above it (or below, near the top), kept on screen. */
export function drawSpeech(
  ctx: CanvasRenderingContext2D,
  text: string,
  wisp: { x: number; y: number; r: number },
  age: number,
  life: number,
  W: number,
  H: number,
  font: string,
): void {
  if (age < 0 || age > life) return;
  const size = Math.max(13, Math.min(18, wisp.r * 0.55));
  ctx.save();
  ctx.font = `600 ${Math.round(size)}px ${font}`;
  const padX = size * 0.75;
  const w = Math.min(W - 16, ctx.measureText(text).width + padX * 2);
  const h = size * 1.9;
  const gap = wisp.r * 1.55;
  const above = wisp.y - gap - h > 8;
  const bx = Math.max(8, Math.min(W - w - 8, wisp.x - w / 2));
  const by = above ? wisp.y - gap - h : Math.min(H - h - 8, wisp.y + gap);
  const tailX = Math.max(bx + 14, Math.min(bx + w - 14, wisp.x));
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
  ctx.roundRect(bx, by, w, h, h / 2);
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
  ctx.fillText(text, bx + w / 2, by + h / 2 + 1, w - padX);
  ctx.restore();
}
