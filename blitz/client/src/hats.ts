// Hats for Blitz, bought with Stardust. Drawn in Blitz's own frame (the orb
// is a circle of radius r at 0,0, already leaning and squashing), so a hat
// tilts and squishes along with it. Flat cartoon shapes, no shadows or
// filters: a few path fills each, cheap enough for every frame.

const INK = "#13223F";

function outline(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.strokeStyle = INK;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 ? s * 0.45 : s;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
}

const HATS: Record<string, (ctx: CanvasRenderingContext2D, r: number, t: number) => void> = {
  bow(ctx, r) {
    ctx.save();
    ctx.translate(r * 0.5, -r * 0.82);
    ctx.rotate(0.35);
    ctx.fillStyle = "#ff7fb4";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(side * r * 0.5, -r * 0.42, side * r * 0.62, r * 0.32, 0, 0);
      ctx.fill();
      outline(ctx, r * 0.8);
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.11, 0, Math.PI * 2);
    ctx.fillStyle = "#ff5a9e";
    ctx.fill();
    outline(ctx, r * 0.8);
    ctx.restore();
  },

  partyhat(ctx, r, t) {
    ctx.save();
    ctx.translate(-r * 0.15, -r * 0.82);
    ctx.rotate(-0.22);
    const w = r * 0.52;
    const hgt = r * 0.95;
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.lineTo(0, -hgt);
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fillStyle = "#9d7bff";
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "#7fe3ff";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * w * 0.7 - w * 0.3, 0);
      ctx.lineTo(i * w * 0.7 + w * 0.5, -hgt);
      ctx.lineTo(i * w * 0.7 + w * 0.75, -hgt);
      ctx.lineTo(i * w * 0.7 - w * 0.05, 0);
      ctx.fill();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.lineTo(0, -hgt);
    ctx.lineTo(w, 0);
    ctx.closePath();
    outline(ctx, r);
    ctx.beginPath();
    ctx.arc(0, -hgt, r * (0.14 + Math.sin(t * 6) * 0.015), 0, Math.PI * 2);
    ctx.fillStyle = "#ffd36b";
    ctx.fill();
    outline(ctx, r);
    ctx.restore();
  },

  antenna(ctx, r, t) {
    const sway = Math.sin(t * 2.4) * r * 0.12;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.92);
    ctx.quadraticCurveTo(sway * 0.4, -r * 1.35, sway, -r * 1.6);
    ctx.lineWidth = Math.max(1.2, r * 0.07);
    ctx.strokeStyle = INK;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sway, -r * 1.65, r * 0.17, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 120, 150, ${0.75 + Math.sin(t * 5) * 0.25})`;
    ctx.fill();
    outline(ctx, r);
  },

  catears(ctx, r) {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * r * 0.55, -r * 0.7);
      ctx.rotate(side * 0.38);
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, r * 0.12);
      ctx.lineTo(0, -r * 0.48);
      ctx.lineTo(r * 0.3, r * 0.12);
      ctx.closePath();
      ctx.fillStyle = "#f4f7ff";
      ctx.fill();
      outline(ctx, r);
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, r * 0.04);
      ctx.lineTo(0, -r * 0.3);
      ctx.lineTo(r * 0.15, r * 0.04);
      ctx.closePath();
      ctx.fillStyle = "#ffb3d1";
      ctx.fill();
      ctx.restore();
    }
  },

  flowers(ctx, r, t) {
    const colors = ["#ff8fc7", "#ffd36b", "#9fe8ff", "#c79bff", "#8fffc9"];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.42;
      const x = Math.cos(a) * r * 0.92;
      const y = Math.sin(a) * r * 0.92;
      const s = r * 0.17;
      ctx.fillStyle = colors[i];
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2 + t * 0.3;
        ctx.beginPath();
        ctx.arc(x + Math.cos(pa) * s * 0.75, y + Math.sin(pa) * s * 0.75, s * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, s * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = "#fff6c2";
      ctx.fill();
    }
  },

  tophat(ctx, r) {
    ctx.save();
    ctx.translate(r * 0.08, -r * 0.86);
    ctx.rotate(0.12);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.62, r * 0.13, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#23233a";
    ctx.fill();
    outline(ctx, r);
    ctx.beginPath();
    ctx.rect(-r * 0.38, -r * 0.78, r * 0.76, r * 0.76);
    ctx.fillStyle = "#23233a";
    ctx.fill();
    outline(ctx, r);
    ctx.fillStyle = "#c79bff";
    ctx.fillRect(-r * 0.38, -r * 0.24, r * 0.76, r * 0.14);
    ctx.restore();
  },

  wizard(ctx, r, t) {
    ctx.save();
    ctx.translate(-r * 0.05, -r * 0.8);
    ctx.rotate(-0.1);
    ctx.beginPath();
    ctx.moveTo(-r * 0.62, 0);
    ctx.quadraticCurveTo(-r * 0.1, -r * 0.6, r * 0.42 + Math.sin(t * 1.5) * r * 0.05, -r * 1.25);
    ctx.quadraticCurveTo(r * 0.2, -r * 0.5, r * 0.62, 0);
    ctx.closePath();
    ctx.fillStyle = "#3a2f8f";
    ctx.fill();
    outline(ctx, r);
    ctx.fillStyle = "#ffd36b";
    star(ctx, -r * 0.12, -r * 0.35, r * 0.1);
    ctx.fill();
    star(ctx, r * 0.15, -r * 0.7, r * 0.07);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.8, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#4a3ab0";
    ctx.fill();
    outline(ctx, r);
    ctx.restore();
  },

  crown(ctx, r, t) {
    ctx.save();
    ctx.translate(0, -r * 0.84);
    const w = r * 0.6;
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.lineTo(-w, -r * 0.42);
    ctx.lineTo(-w * 0.5, -r * 0.18);
    ctx.lineTo(0, -r * 0.55);
    ctx.lineTo(w * 0.5, -r * 0.18);
    ctx.lineTo(w, -r * 0.42);
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fillStyle = "#ffcf4d";
    ctx.fill();
    outline(ctx, r);
    const glint = 0.6 + Math.sin(t * 3) * 0.4;
    for (const [x, c] of [
      [-w * 0.55, "#ff5a7a"],
      [0, "#5ad1ff"],
      [w * 0.55, "#7dffc4"],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, -r * 0.12, r * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
    }
    ctx.fillStyle = `rgba(255, 255, 255, ${glint})`;
    star(ctx, w * 0.75, -r * 0.5, r * 0.08);
    ctx.fill();
    ctx.restore();
  },

  halo(ctx, r, t) {
    const y = -r * 1.28 + Math.sin(t * 2) * r * 0.06;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.ellipse(0, y, r * 0.62, r * 0.17, 0, 0, Math.PI * 2);
    ctx.lineWidth = r * 0.16;
    ctx.strokeStyle = "rgba(255, 210, 110, 0.28)";
    ctx.stroke();
    ctx.lineWidth = r * 0.07;
    ctx.strokeStyle = "rgba(255, 236, 170, 0.95)";
    ctx.stroke();
    ctx.restore();
  },
};

/** Draws the hat with this id, if there is one. */
export function drawHat(ctx: CanvasRenderingContext2D, hat: string | undefined, r: number, t: number): void {
  if (!hat) return;
  const draw = HATS[hat];
  if (draw) draw(ctx, r, t);
}

export const HAT_IDS = Object.keys(HATS);
