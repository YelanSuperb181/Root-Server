// Drawing Blitz itself: a glowing orb with a face. The view decides how Blitz
// looks right now (a `Look`); this only paints it.

import { RGB, rgba, stampAt } from "./fx";

export type Eyes =
  | "open"
  | "happy"
  | "closed"
  | "bonk"
  | "heart"
  | "star"
  | "wide"
  | "dizzy"
  | "puppy"
  | "angry"
  | "laugh"
  | "sleepy"
  | "wink"
  | "strain";

export type Mouth = "none" | "smile" | "grin" | "open" | "o" | "cat" | "flat" | "frown" | "wavy" | "grit" | "yawn";

export type Brows = "none" | "angry" | "sad" | "raised";

export interface Look {
  /** Screen position and radius, px. */
  x: number;
  y: number;
  r: number;
  /** Lean and spin, radians. */
  tilt: number;
  /** Stretch along the direction of travel, and squash against a wall. */
  stretch: number;
  stretchAngle: number;
  squash: number;
  squashAngle: number;
  /** Overall scale (puffed up when grumpy, stretched when waking). */
  scaleX: number;
  scaleY: number;
  tint: RGB;
  /** Halo strength, 0..~1.6. */
  glow: number;
  eyes: Eyes;
  mouth: Mouth;
  brows: Brows;
  blush: number;
  /** Where the eyes look, -1..1. */
  gaze: { x: number; y: number };
  blink: boolean;
}

const INK = "#13223F";

function mix(a: RGB, b: RGB, k: number): RGB {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

const WHITE: RGB = [255, 255, 255];

/** The brightest the halo gets (glow tops out a little over 2): it's painted this bright and drawn fainter as needed. */
const HALO_MAX = 2.2;
/** Painted halos by color and size, most recently used last. */
const halos = new Map<string, HTMLCanvasElement>();

/**
 * The halo painted at `R` device pixels' radius (to within a few, so its gentle
 * pulse reuses a handful) in about `tint`: copied pixel for pixel, that's far
 * quicker than filling a gradient this big every frame.
 */
function haloStamp(tint: RGB, R: number): HTMLCanvasElement {
  const step = Math.max(2, Math.round(R / 40));
  const r = Math.max(step, Math.round(R / step) * step);
  const q: RGB = [Math.round(tint[0] / 6) * 6, Math.round(tint[1] / 6) * 6, Math.round(tint[2] / 6) * 6];
  const key = `${q[0]},${q[1]},${q[2]}|${r}`;
  let stamp = halos.get(key);
  if (stamp) {
    halos.delete(key);
  } else {
    stamp = document.createElement("canvas");
    stamp.width = stamp.height = r * 2;
    const g = stamp.getContext("2d")!;
    const halo = g.createRadialGradient(r, r, 0, r, r, r);
    halo.addColorStop(0, rgba(q, 0.42 * HALO_MAX));
    halo.addColorStop(0.4, rgba(q, 0.12 * HALO_MAX));
    halo.addColorStop(1, rgba(q, 0));
    g.fillStyle = halo;
    g.fillRect(0, 0, r * 2, r * 2);
    // Colors pass through quickly as moods change; keep only the recent ones.
    if (halos.size >= 24) halos.delete(halos.keys().next().value as string);
  }
  halos.set(key, stamp);
  return stamp;
}

/** The soft light around Blitz. Drawn first, under everything else of Blitz's. */
export function drawHalo(ctx: CanvasRenderingContext2D, look: Look): void {
  const reach = look.r * 4.2 * Math.min(1.6, 0.7 + look.glow * 0.4);
  const m = ctx.getTransform();
  const stamp = haloStamp(look.tint, reach * m.a);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "lighter";
  // The painting is as bright as the halo ever gets: dim it to this glow.
  ctx.globalAlpha *= Math.min(1, look.glow / HALO_MAX);
  stampAt(ctx, stamp, m.a * look.x + m.e, m.d * look.y + m.f);
  ctx.restore();
}

export function drawBlitz(ctx: CanvasRenderingContext2D, look: Look, t: number): void {
  const { r } = look;
  ctx.save();
  ctx.translate(look.x, look.y);
  // Stretch along the flight, squash against the wall, then puff/stretch, then lean.
  ctx.rotate(look.stretchAngle);
  ctx.scale(look.stretch, 1 / look.stretch);
  ctx.rotate(-look.stretchAngle);
  if (look.squash > 0.01) {
    ctx.rotate(look.squashAngle);
    ctx.scale(1 - 0.32 * look.squash, 1 + 0.22 * look.squash);
    ctx.rotate(-look.squashAngle);
  }
  ctx.scale(look.scaleX, look.scaleY);
  ctx.rotate(look.tilt);

  const body = ctx.createRadialGradient(-r * 0.2, -r * 0.3, r * 0.1, 0, 0, r);
  body.addColorStop(0, "#FFFFFF");
  body.addColorStop(0.55, rgba(mix(WHITE, look.tint, 0.12), 1));
  body.addColorStop(0.85, rgba(mix(WHITE, look.tint, 0.4), 1));
  body.addColorStop(1, rgba(look.tint, 0.85));
  // The rim of light around the body (a gradient: a blurred shadow costs far more every frame).
  const rim = ctx.createRadialGradient(0, 0, r * 0.9, 0, 0, r + 20);
  rim.addColorStop(0, rgba(look.tint, 0.55));
  rim.addColorStop(0.35, rgba(look.tint, 0.22));
  rim.addColorStop(1, rgba(look.tint, 0));
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(0, 0, r + 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  drawFace(ctx, look, t);
  ctx.restore();
}

function drawFace(ctx: CanvasRenderingContext2D, look: Look, t: number): void {
  const { r } = look;
  const ex = look.gaze.x * r * 0.2;
  const ey = look.gaze.y * r * 0.16;
  const spacing = r * 0.34;
  const w = r * 0.12;
  const h = r * 0.2;
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.5, r * 0.07);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Blush sits under everything else.
  if (look.blush > 0.01) {
    ctx.save();
    ctx.fillStyle = `rgba(255, 130, 185, ${0.28 + 0.4 * look.blush})`;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * spacing * 1.5 + ex * 0.6, r * 0.2 + ey * 0.6, r * (0.12 + 0.04 * look.blush), r * 0.075, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  for (const side of [-1, 1]) {
    const px = side * spacing + ex;
    const py = -r * 0.06 + ey;
    const kind: Eyes = look.eyes === "wink" ? (side < 0 ? "open" : "happy") : look.eyes;
    drawEye(ctx, kind, side, px, py, w, h, r, look.blink, t);
  }
  drawBrows(ctx, look.brows, spacing, ex, ey, w, h, r);
  drawMouth(ctx, look.mouth, ex, ey, r, t);
}

function drawEye(ctx: CanvasRenderingContext2D, kind: Eyes, side: number, px: number, py: number, w: number, h: number, r: number, blink: boolean, t: number): void {
  ctx.beginPath();
  switch (kind) {
    case "happy":
      ctx.arc(px, py + h * 0.35, w * 1.15, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
      return;
    case "closed":
      ctx.arc(px, py - h * 0.2, w * 1.1, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      return;
    case "sleepy":
      // Heavy lids: a shallow droop with just a sliver of eye under it.
      ctx.arc(px, py - h * 1.3, w * 2, 0.36 * Math.PI, 0.64 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(px, py + h * 0.42, w * 0.55, h * 0.22, 0, 0, Math.PI);
      ctx.fill();
      return;
    case "bonk":
    case "laugh":
    case "strain": {
      const k = kind === "laugh" ? 1.2 : 1.1;
      const ww = w * k;
      ctx.moveTo(px + side * ww, py - ww);
      ctx.lineTo(px - side * ww * 0.2, py);
      ctx.lineTo(px + side * ww, py + ww);
      ctx.stroke();
      return;
    }
    case "heart": {
      const s = w * 1.7 * (1 + 0.12 * Math.sin(t * 9));
      ctx.save();
      ctx.translate(px, py);
      ctx.fillStyle = "#FF4F9A";
      ctx.beginPath();
      ctx.moveTo(0, s * 0.45);
      ctx.bezierCurveTo(-s * 1.1, -s * 0.3, -s * 0.45, -s * 1.05, 0, -s * 0.4);
      ctx.bezierCurveTo(s * 0.45, -s * 1.05, s * 1.1, -s * 0.3, 0, s * 0.45);
      ctx.fill();
      ctx.restore();
      return;
    }
    case "star": {
      const s = w * 1.6 * (1 + 0.1 * Math.sin(t * 11));
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(t * 1.5 * side);
      ctx.fillStyle = "#FFC93C";
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? s : s * 0.45;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
    case "dizzy": {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(t * 8 * side);
      ctx.lineWidth = Math.max(1.2, r * 0.05);
      ctx.beginPath();
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI * 4;
        const rr = (i / 28) * w * 1.3;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    case "wide":
      ctx.ellipse(px, py, w * 1.3, h * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(px + w * 0.4, py - h * 0.45, w * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      return;
    case "puppy":
      ctx.ellipse(px, py, w * 1.2, h * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(px + w * 0.35, py - h * 0.4, w * 0.45, 0, Math.PI * 2);
      ctx.arc(px - w * 0.35, py + h * 0.35, w * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      return;
    case "angry": {
      // Half-closed: the lid cuts across the top, slanted in toward the middle.
      ctx.save();
      ctx.beginPath();
      const lidOuter = py - h * 0.7;
      const lidInner = py - h * 0.05;
      ctx.moveTo(px + side * w * 1.6, lidOuter);
      ctx.lineTo(px - side * w * 1.6, lidInner);
      ctx.lineTo(px - side * w * 1.6, py + h * 1.6);
      ctx.lineTo(px + side * w * 1.6, py + h * 1.6);
      ctx.closePath();
      ctx.clip();
      ctx.beginPath();
      ctx.ellipse(px, py, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(px + side * w * 1.1, lidOuter + (lidInner - lidOuter) * 0.15);
      ctx.lineTo(px - side * w * 1.1, lidInner - (lidInner - lidOuter) * 0.15);
      ctx.stroke();
      return;
    }
    default:
      ctx.ellipse(px, py, w, blink ? h * 0.12 : h, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!blink) {
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(px + w * 0.35, py - h * 0.4, w * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = INK;
      }
  }
}

function drawBrows(ctx: CanvasRenderingContext2D, brows: Brows, spacing: number, ex: number, ey: number, w: number, h: number, r: number): void {
  if (brows === "none") return;
  ctx.save();
  ctx.lineWidth = Math.max(1.3, r * 0.055);
  for (const side of [-1, 1]) {
    const px = side * spacing + ex;
    const py = -r * 0.06 + ey - h * 1.55;
    ctx.beginPath();
    if (brows === "angry") {
      ctx.moveTo(px + side * w * 1.3, py - h * 0.25);
      ctx.lineTo(px - side * w * 1.1, py + h * 0.3);
    } else if (brows === "sad") {
      ctx.moveTo(px + side * w * 1.3, py + h * 0.25);
      ctx.lineTo(px - side * w * 1.1, py - h * 0.25);
    } else {
      // Raised: one brow up, the other level. Curious.
      const lift = side > 0 ? h * 0.45 : 0;
      ctx.arc(px, py - lift + h * 0.5, w * 1.2, 1.2 * Math.PI, 1.8 * Math.PI);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawMouth(ctx: CanvasRenderingContext2D, mouth: Mouth, ex: number, ey: number, r: number, t: number): void {
  const mx = ex;
  const my = r * 0.22 + ey;
  ctx.beginPath();
  switch (mouth) {
    case "none":
      return;
    case "smile":
      ctx.arc(mx, my - r * 0.02, r * 0.13, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      return;
    case "grin":
    case "open": {
      const ww = mouth === "open" ? r * 0.2 : r * 0.16;
      const hh = mouth === "open" ? r * 0.2 + r * 0.03 * Math.sin(t * 20) : r * 0.12;
      ctx.moveTo(mx - ww, my - r * 0.04);
      ctx.quadraticCurveTo(mx, my - r * 0.07, mx + ww, my - r * 0.04);
      ctx.quadraticCurveTo(mx + ww * 0.9, my + hh, mx, my + hh);
      ctx.quadraticCurveTo(mx - ww * 0.9, my + hh, mx - ww, my - r * 0.04);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "#FF7FA8";
      ctx.beginPath();
      ctx.ellipse(mx, my + hh, ww * 0.6, hh * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    case "o":
      ctx.ellipse(mx, my + r * 0.03, r * 0.07, r * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    case "yawn":
      ctx.ellipse(mx, my + r * 0.04, r * 0.11, r * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    case "cat":
      ctx.arc(mx - r * 0.065, my, r * 0.065, 0.1 * Math.PI, 0.95 * Math.PI);
      ctx.moveTo(mx + r * 0.13, my);
      ctx.arc(mx + r * 0.065, my, r * 0.065, 0.05 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
      return;
    case "flat":
      ctx.moveTo(mx - r * 0.1, my + r * 0.02);
      ctx.lineTo(mx + r * 0.1, my + r * 0.02);
      ctx.stroke();
      return;
    case "frown":
      ctx.arc(mx, my + r * 0.12, r * 0.11, 1.2 * Math.PI, 1.8 * Math.PI);
      ctx.stroke();
      return;
    case "wavy": {
      const ww = r * 0.15;
      for (let i = 0; i <= 12; i++) {
        const x = mx - ww + (i / 12) * ww * 2;
        const y = my + r * 0.03 + Math.sin(i * 1.6 + t * 14) * r * 0.025;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      return;
    }
    case "grit": {
      const ww = r * 0.17;
      const hh = r * 0.1;
      ctx.save();
      ctx.lineWidth = Math.max(1.2, r * 0.05);
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.roundRect(mx - ww, my - hh * 0.4, ww * 2, hh, hh * 0.4);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx - ww, my + hh * 0.1);
      ctx.lineTo(mx + ww, my + hh * 0.1);
      for (let i = 1; i < 4; i++) {
        const x = mx - ww + (i / 4) * ww * 2;
        ctx.moveTo(x, my - hh * 0.4);
        ctx.lineTo(x, my + hh * 0.6);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
  }
}
