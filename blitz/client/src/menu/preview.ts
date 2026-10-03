// A portrait of your own Blitz for the menu's shop: painted once (no frame
// loop) wearing an outfit, so you can see a hat, a trail or a glow before
// buying it. The menu's CSS gives it a gentle float.

import { cosmetic, hexToRgb } from "@blitz/shared";
import { Look, drawBlitz } from "../blitz";
import { RGB, rgba } from "../fx";

const CALM: RGB = [127, 227, 255];

export interface Outfit {
  hat?: string;
  trail?: string;
  glow?: string;
}

/** The colours a trail leaves behind, for the portrait. */
function trailColors(trail: string): RGB[] {
  if (trail === "rainbow") return [[255, 140, 140], [255, 214, 120], [140, 255, 170], [140, 200, 255], [200, 160, 255]];
  const c = cosmetic(trail)?.color;
  const base = c ? hexToRgb(c) : CALM;
  return [base, [255, 255, 255], base];
}

export function blitzPortrait(outfit: Outfit, size = 150): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.round(size * dpr);
  canvas.style.width = canvas.style.height = `${size}px`;
  canvas.className = "mportrait";
  canvas.setAttribute("role", "img");
  const names = [outfit.hat, outfit.trail, outfit.glow].map((id) => (id ? cosmetic(id)?.name : undefined)).filter(Boolean);
  canvas.setAttribute("aria-label", names.length ? `Your Blitz, wearing: ${names.join(", ")}` : "Your Blitz");
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  const glowHex = outfit.glow ? cosmetic(outfit.glow)?.color : undefined;
  const tint = glowHex ? hexToRgb(glowHex) : CALM;
  const r = size * 0.19;
  const x = size * 0.56;
  const y = size * 0.56;
  // The trail: a sweep of motes off to the lower left, as if Blitz just floated in.
  if (outfit.trail) {
    const colors = trailColors(outfit.trail);
    for (let i = 0; i < 26; i++) {
      const k = i / 26;
      const px = x - r * 0.6 - k * size * 0.42 + Math.sin(i * 2.3) * 5;
      const py = y + r * 0.35 + k * size * 0.26 + Math.cos(i * 1.7) * 6;
      ctx.fillStyle = rgba(colors[i % colors.length], 0.85 * (1 - k));
      ctx.beginPath();
      const s = (outfit.trail === "bubbles" ? 4.5 : 2.6) * (1 - k * 0.6);
      if (outfit.trail === "hearts" && i % 5 === 0) {
        ctx.font = `${Math.round(10 * (1 - k * 0.5))}px sans-serif`;
        ctx.fillText("💗", px, py);
      } else {
        ctx.arc(px, py, s, 0, Math.PI * 2);
        if (outfit.trail === "bubbles") {
          ctx.lineWidth = 1;
          ctx.strokeStyle = rgba(colors[0], 0.9 * (1 - k));
          ctx.stroke();
        } else ctx.fill();
      }
    }
  }
  const look: Look = {
    x,
    y,
    r,
    tilt: -0.06,
    stretch: 1,
    stretchAngle: 0,
    squash: 0,
    squashAngle: 0,
    scaleX: 1,
    scaleY: 1,
    tint,
    glow: 1.1,
    eyes: "happy",
    mouth: "smile",
    brows: "none",
    blush: 0.35,
    gaze: { x: -0.2, y: 0.1 },
    blink: false,
    hat: outfit.hat,
  };
  // Blitz's own halo reaches past a portrait this small, so a softer one that fades out inside the frame.
  const halo = ctx.createRadialGradient(x, y, 0, x, y, Math.min(x, y, size - x, size - y) - 1);
  halo.addColorStop(0, rgba(tint, 0.45));
  halo.addColorStop(0.45, rgba(tint, 0.14));
  halo.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);
  drawBlitz(ctx, look, 0.7);
  return canvas;
}
