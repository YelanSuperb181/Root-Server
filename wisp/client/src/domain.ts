// The domain window: draws Wisp and its world, turns pointer input into
// grabs, throws and pokes, and keeps the local Wisp in step with the server's.
//
// Physics runs in domain units (rim at radius 1) through @wisp/shared, the
// same code the server runs. Everything visual (particles, ripples, squash)
// is local decoration on top.

import type { StateEvent, Watcher, WispState } from "@wisp/gen-shared";
import {
  Body,
  FLING_COAST,
  FLING_SPEED,
  ORB_RADIUS,
  SLEEP_AFTER,
  STEP,
  advance,
  isSplash,
  pokeImpulse,
  sanitize,
  step,
} from "@wisp/shared";
import type { DomainLink } from "./net";

interface Particle {
  x: number; // px from the center
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  violet: boolean;
}

interface Ripple {
  angle: number;
  born: number;
  power: number;
}

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const MAX_PARTICLES = reduced ? 140 : 700;
const now = () => performance.now() / 1000;

function glowSprite(rgb: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  grad.addColorStop(0.3, `rgba(${rgb}, 0.6)`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

function ease(x: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
}

export class DomainView {
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private R = 100;
  private cx = 0;
  private cy = 0;
  private dpr = 1;
  private sprites = { cyan: glowSprite("150, 235, 255"), violet: glowSprite("200, 168, 255") };
  private font: string;
  private stars = Array.from({ length: 110 }, () => ({
    a: Math.random() * Math.PI * 2,
    d: Math.sqrt(Math.random()),
    s: 0.4 + Math.random() * 1.3,
    tw: 0.6 + Math.random() * 2.2,
    ph: Math.random() * 6.28,
  }));

  // Shared state (domain units, server clock)
  private body: Body = { x: 0, y: 0, vx: 0, vy: 0 };
  private clockOffset = 0;
  private haveClock = false;
  private simulatedUntil = 0;
  private asleep = false;
  private flingUntil = 0;
  private holder: { userId: string; nickname: string } | undefined;
  private remoteTarget: { x: number; y: number } | undefined;
  private lastInteraction = 0;
  private watchers: Watcher[] = [];

  // Me
  private pointer = { x: 0, y: 0, inside: false, down: false, dragging: false, downAt: 0, downX: 0, downY: 0 };
  private samples: Array<{ x: number; y: number; at: number }> = [];
  private holding = false;
  private lastDragSent = 0;
  private noticeUntil = 0;
  private notice = "";

  // Looks
  private t = 0;
  private open = 0;
  private scale = 0;
  private gaze = { x: 0, y: 0 };
  private blinkUntil = 0;
  private nextBlink = 2;
  private smileUntil = 0;
  private bonkUntil = 0;
  private wobble = 0;
  private squash = 0;
  private squashAngle = 0;
  private shake = 0;
  private lastImpact = -1;
  private renderOffset = { x: 0, y: 0 };
  private particles: Particle[] = [];
  private ripples: Ripple[] = [];
  private zs: number[] = [];
  private lastStatus = "";

  constructor(
    private canvas: HTMLCanvasElement,
    private statusEl: HTMLElement,
    private watchersEl: HTMLElement,
    private link: DomainLink,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.font = getComputedStyle(document.body).fontFamily;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    this.bindInput();
    link.onState((e) => this.applyEvent(e));
    link.onWatchers((w) => this.setWatchers(w));
    this.simulatedUntil = this.simNow();
    this.lastInteraction = this.simNow();
    this.renderWatchers();
  }

  // ---- Clock and shared state ----------------------------------------------

  private simNow(): number {
    return now() + this.clockOffset;
  }

  private syncClock(serverTime: number): void {
    const estimate = serverTime - now();
    if (!this.haveClock) {
      this.clockOffset = estimate;
      this.simulatedUntil = this.simNow();
      this.haveClock = true;
    } else {
      this.clockOffset += (estimate - this.clockOffset) * 0.1;
    }
  }

  /** The state the domain opened with. */
  start(initial?: WispState, watchers?: Watcher[]): void {
    if (initial) {
      this.syncClock(initial.simTime);
      this.adopt(initial, false);
    }
    if (watchers) this.setWatchers(watchers);
    this.summonMotes();
    requestAnimationFrame((ms) => this.frame(ms));
  }

  /** Takes a server state as the truth, advanced to now. `smooth` hides the jump. */
  private adopt(s: WispState, smooth: boolean): void {
    this.asleep = s.asleep;
    this.flingUntil = s.flingUntil;
    this.holder = s.holderUserId ? { userId: s.holderUserId, nickname: s.holderNickname || "someone" } : undefined;
    this.remoteTarget = this.holder && this.holder.userId !== this.link.me ? { x: s.targetX, y: s.targetY } : undefined;
    if (this.holding) return; // My own hand is the truth while I hold Wisp.

    const snap: Body = { x: s.x, y: s.y, vx: s.vx, vy: s.vy };
    advance(snap, s.simTime, this.simNow(), { target: this.remoteTarget, asleep: s.asleep, flingUntil: s.flingUntil }, 1);
    if (smooth) {
      this.renderOffset.x += this.body.x - snap.x;
      this.renderOffset.y += this.body.y - snap.y;
      const m = Math.hypot(this.renderOffset.x, this.renderOffset.y);
      if (m > 0.3) {
        this.renderOffset.x *= 0.3 / m;
        this.renderOffset.y *= 0.3 / m;
      }
    }
    this.body = snap;
    this.simulatedUntil = this.simNow();
  }

  private applyEvent(e: StateEvent): void {
    if (!e.state) return;
    this.syncClock(e.state.simTime);
    const byOther = e.byUserId !== "" && e.byUserId !== this.link.me;
    this.adopt(e.state, true);
    switch (e.cause) {
      case "poke":
        if (byOther) this.giggle();
        break;
      case "summon":
        this.burst(this.body.x * this.R, this.body.y * this.R, 34, 300);
        this.wobble = 1;
        this.setNotice(`summoned by ${e.byNickname || "someone"}!`, 3);
        break;
      case "wake":
        this.blinkUntil = this.t + 0.15;
        break;
    }
  }

  private setWatchers(w: Watcher[]): void {
    this.watchers = w;
    this.renderWatchers();
  }

  private renderWatchers(): void {
    if (this.link.mode === "solo") {
      this.watchersEl.textContent = "Just you (not connected to Root)";
      return;
    }
    const others = this.watchers.filter((w) => w.userId !== this.link.me).map((w) => w.nickname || "someone");
    let text = "Just you here";
    if (others.length === 1) text = `You and ${others[0]}`;
    else if (others.length === 2) text = `You, ${others[0]} and ${others[1]}`;
    else if (others.length > 2) text = `You, ${others[0]}, ${others[1]} and ${others.length - 2} more`;
    this.watchersEl.textContent = text;
  }

  // ---- Input ------------------------------------------------------------------

  private toDomain(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left - this.cx) / this.R, y: (e.clientY - rect.top - this.cy) / this.R };
  }

  private overWisp(p: { x: number; y: number }): boolean {
    return this.scale > 0.5 && Math.hypot(p.x - this.body.x, p.y - this.body.y) < ORB_RADIUS * 1.8;
  }

  private wake(): void {
    this.lastInteraction = this.simNow();
    if (this.asleep) {
      this.asleep = false;
      this.blinkUntil = this.t + 0.15;
      this.burst(this.body.x * this.R, this.body.y * this.R, 10, 120);
    }
  }

  private setNotice(text: string, seconds: number): void {
    this.notice = text;
    this.noticeUntil = this.t + seconds;
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => {
      const p = this.toDomain(e);
      Object.assign(this.pointer, p, { inside: true });
      if (!this.overWisp(p)) return;
      if (this.holder && this.holder.userId !== this.link.me) {
        this.setNotice(`${this.holder.nickname} has Wisp`, 1.5);
        return;
      }
      this.wake();
      c.setPointerCapture(e.pointerId);
      Object.assign(this.pointer, { down: true, dragging: false, downAt: performance.now(), downX: p.x, downY: p.y });
      this.samples = [{ ...p, at: performance.now() }];
    });

    c.addEventListener("pointermove", (e) => {
      const p = this.toDomain(e);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.inside = Math.hypot(p.x, p.y) < 1.15;
      if (this.pointer.inside && !this.asleep) this.lastInteraction = this.simNow();
      if (this.pointer.down) {
        if (!this.pointer.dragging && Math.hypot(p.x - this.pointer.downX, p.y - this.pointer.downY) * this.R > 6) this.startHold();
        const at = performance.now();
        this.samples.push({ ...p, at });
        while (this.samples.length > 2 && at - this.samples[0].at > 90) this.samples.shift();
        if (this.holding) {
          this.link.drag(p.x, p.y);
          this.lastDragSent = this.t;
        }
      }
      c.style.cursor = this.pointer.dragging ? "grabbing" : this.overWisp(p) ? "grab" : "default";
    });

    const release = () => {
      if (!this.pointer.down) return;
      const quick = performance.now() - this.pointer.downAt < 240;
      if (this.holding) this.throwWisp();
      else if (quick && !this.pointer.dragging) this.poke(Math.random() * Math.PI * 2);
      this.pointer.down = false;
      this.pointer.dragging = false;
      c.style.cursor = "default";
    };
    c.addEventListener("pointerup", release);
    c.addEventListener("pointercancel", release);
    c.addEventListener("pointerleave", () => {
      if (!this.pointer.down) this.pointer.inside = false;
    });

    c.addEventListener("keydown", (e) => {
      const angles: Record<string, number> = { ArrowRight: 0, ArrowDown: Math.PI / 2, ArrowLeft: Math.PI, ArrowUp: -Math.PI / 2 };
      if (e.key in angles) {
        this.poke(angles[e.key], false);
        e.preventDefault();
      } else if (e.key === " " || e.key === "Enter") {
        this.poke(Math.random() * Math.PI * 2);
        e.preventDefault();
      }
    });
  }

  private startHold(): void {
    this.pointer.dragging = true;
    this.holding = true;
    this.holder = { userId: this.link.me, nickname: "you" };
    const at = { x: this.pointer.x, y: this.pointer.y };
    void this.link.grab(at.x, at.y).then((res) => {
      if (res.ok) return;
      // Someone else got there first.
      this.holding = false;
      this.pointer.dragging = false;
      if (res.event) this.applyEvent(res.event);
      if (this.holder && this.holder.userId !== this.link.me) this.setNotice(`${this.holder.nickname} has Wisp`, 1.5);
    });
  }

  private throwWisp(): void {
    const s = this.samples;
    const a = s[0];
    const b = s[s.length - 1];
    const dt = Math.max(0.016, (b.at - a.at) / 1000);
    this.body = sanitize({ x: this.body.x, y: this.body.y, vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt });
    if (Math.hypot(this.body.vx, this.body.vy) > FLING_SPEED) this.flingUntil = this.simNow() + FLING_COAST;
    this.holding = false;
    this.holder = undefined;
    this.link.release(this.body);
  }

  private poke(angle: number, smile = true): void {
    if (this.holder && this.holder.userId !== this.link.me) return;
    this.wake();
    const push = pokeImpulse(angle);
    this.body.vx += push.vx;
    this.body.vy += push.vy;
    if (smile) this.giggle();
    this.link.poke(angle);
  }

  private giggle(): void {
    this.smileUntil = this.t + 0.9;
    this.wobble = 1;
    this.burst(this.body.x * this.R, this.body.y * this.R, 22, 260);
  }

  // ---- Effects --------------------------------------------------------------------

  private emit(x: number, y: number, vx: number, vy: number, life: number, size: number, violet: boolean): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ x, y, vx, vy, life, max: life, size, violet });
  }

  private burst(x: number, y: number, n: number, speed: number, dirX?: number, dirY?: number): void {
    const aim = dirX === undefined || dirY === undefined ? null : Math.atan2(dirY, dirX);
    for (let i = 0; i < n; i++) {
      const a = aim === null ? Math.random() * Math.PI * 2 : aim + (Math.random() - 0.5) * Math.PI * 0.9;
      const s = speed * (0.35 + Math.random() * 0.8);
      this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.5 + Math.random() * 0.7, 1 + Math.random() * 2.2, Math.random() < 0.3);
    }
  }

  private summonMotes(): void {
    if (reduced) return;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = this.R * (0.85 + Math.random() * 0.2);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const tx = this.body.x * this.R;
      const ty = this.body.y * this.R;
      this.emit(x, y, (tx - x) * 1.9, (ty - y) * 1.9, 0.9 + Math.random() * 0.4, 1 + Math.random() * 2, Math.random() < 0.35);
    }
  }

  private impact(nx: number, ny: number, speed: number): void {
    if (this.t - this.lastImpact < 0.12) return;
    this.lastImpact = this.t;
    const pxSpeed = speed * 250; // tuned in pixels on a 250px-radius domain
    this.ripples.push({ angle: Math.atan2(ny, nx), born: this.t, power: Math.max(0.25, Math.min(1, pxSpeed / 1300)) });
    this.burst(nx * (this.R - 2), ny * (this.R - 2), Math.min(30, 6 + pxSpeed / 55), Math.min(340, 80 + pxSpeed * 0.2), -nx, -ny);
    this.wobble = Math.min(1, this.wobble + pxSpeed / 1600);
    this.squash = Math.max(this.squash, Math.min(1, pxSpeed / 1400));
    this.squashAngle = Math.atan2(ny, nx);
    if (pxSpeed > 600) this.bonkUntil = this.t + 0.45;
    if (!reduced) this.shake = Math.max(this.shake, Math.min(1, (pxSpeed - 300) / 1500));
  }

  // ---- Frame ----------------------------------------------------------------------

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = rect.width;
    this.H = rect.height;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.cx = this.W / 2;
    this.cy = this.H / 2;
    this.R = Math.max(60, Math.min(this.W, this.H) / 2 - 18);
  }

  private prevFrame = performance.now();

  private frame(ms: number): void {
    const dt = Math.min(0.05, (ms - this.prevFrame) / 1000);
    this.prevFrame = ms;
    this.t += dt;

    // Open the domain, then let Wisp materialize.
    this.open = reduced ? 1 : Math.min(1, this.t / 0.9);
    this.scale = reduced ? 1 : ease((this.t - 0.75) / 0.6);

    this.simulate();
    this.updateLooks(dt);
    this.updateStatus();
    this.draw(dt);
    requestAnimationFrame((next) => this.frame(next));
  }

  private simulate(): void {
    const target = this.holding ? { x: this.pointer.x, y: this.pointer.y } : this.remoteTarget;
    const until = this.simNow();
    if (until - this.simulatedUntil > 0.5) this.simulatedUntil = until - STEP;
    while (this.simulatedUntil + STEP <= until) {
      const hit = step(this.body, { t: this.simulatedUntil, target, asleep: this.asleep, flingUntil: this.flingUntil });
      this.simulatedUntil += STEP;
      if (hit && isSplash(hit)) this.impact(hit.nx, hit.ny, hit.speed);
    }
    // Holding still still counts as holding: tell the server we haven't let go.
    if (this.holding && this.t - this.lastDragSent > 0.5) {
      this.link.drag(this.pointer.x, this.pointer.y);
      this.lastDragSent = this.t;
    }
    // Solo: Wisp's bedtime is decided here instead of by the server.
    if (this.link.mode === "solo" && !this.holding && !this.asleep && until - this.lastInteraction > SLEEP_AFTER) this.asleep = true;
  }

  private updateLooks(dt: number): void {
    const t = this.t;
    if (t > this.nextBlink && !this.asleep) {
      this.blinkUntil = t + 0.13;
      this.nextBlink = t + 2.5 + Math.random() * 4;
    }
    if (this.asleep && Math.random() < dt * 0.7) this.zs.push(t);
    let gx: number;
    let gy: number;
    if (this.pointer.inside && !this.asleep) {
      gx = this.pointer.x - this.body.x;
      gy = this.pointer.y - this.body.y;
    } else {
      gx = this.body.vx;
      gy = this.body.vy;
    }
    const gl = Math.hypot(gx, gy) || 1;
    const gm = Math.min(1, gl / (this.pointer.inside ? 0.48 : 1.2));
    this.gaze.x += ((gx / gl) * gm - this.gaze.x) * Math.min(1, dt * 8);
    this.gaze.y += ((gy / gl) * gm - this.gaze.y) * Math.min(1, dt * 8);
    this.wobble *= Math.exp(-3 * dt);
    this.squash *= Math.exp(-7 * dt);
    this.shake *= Math.exp(-9 * dt);
    const k = Math.exp(-10 * dt);
    this.renderOffset.x *= k;
    this.renderOffset.y *= k;

    // Trail
    if (this.scale > 0.5) {
      const speedPx = Math.hypot(this.body.vx, this.body.vy) * this.R;
      let n = ((reduced ? 4 : 16) + speedPx * (reduced ? 0.01 : 0.05)) * dt;
      const ox = (this.body.x + this.renderOffset.x) * this.R;
      const oy = (this.body.y + this.renderOffset.y) * this.R;
      const orb = ORB_RADIUS * this.R;
      while (n > 0) {
        if (Math.random() < n) {
          const a = Math.random() * Math.PI * 2;
          const o = orb * 0.6 * Math.random();
          this.emit(
            ox + Math.cos(a) * o,
            oy + Math.sin(a) * o,
            -this.body.vx * this.R * 0.12 + (Math.random() - 0.5) * 40,
            -this.body.vy * this.R * 0.12 + (Math.random() - 0.5) * 40,
            0.6 + Math.random() * 0.9,
            0.8 + Math.random() * 1.8,
            Math.random() < 0.25,
          );
        }
        n -= 1;
      }
    }
  }

  private updateStatus(): void {
    const speed = Math.hypot(this.body.vx, this.body.vy);
    let s = "drifting";
    if (this.t < 1.2) s = "summoning…";
    else if (this.t < this.noticeUntil) s = this.notice;
    else if (this.t < this.bonkUntil) s = "bonk!";
    else if (this.holding) s = "held by you";
    else if (this.holder) s = `held by ${this.holder.nickname}`;
    else if (this.t < this.smileUntil) s = "giggling";
    else if (speed > 2.6) s = "wheee!";
    else if (this.asleep) s = "dozing";
    if (s !== this.lastStatus) {
      this.statusEl.textContent = s;
      this.lastStatus = s;
    }
  }

  private draw(dt: number): void {
    const ctx = this.ctx;
    const sx = this.shake > 0.01 ? (Math.random() - 0.5) * 7 * this.shake : 0;
    const sy = this.shake > 0.01 ? (Math.random() - 0.5) * 7 * this.shake : 0;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.translate(sx, sy);
    const inner = this.R * (0.6 + 0.4 * ease(this.open));
    this.drawDomain(inner);
    ctx.save();
    // Wisp's light stays inside its domain: everything glowing is clipped to the wall.
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, inner - 1, 0, Math.PI * 2);
    ctx.clip();
    this.drawParticles(dt);
    this.drawWisp();
    ctx.restore();
    this.drawWallGlow(inner);
  }

  private drawDomain(r: number): void {
    const { ctx, cx, cy, t } = this;
    const alpha = ease(this.open);
    const g = ctx.createRadialGradient(cx, cy - r * 0.2, r * 0.05, cx, cy, r);
    g.addColorStop(0, "#1B2850");
    g.addColorStop(0.65, "#0F1734");
    g.addColorStop(1, "#090E22");
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();

    ctx.globalCompositeOperation = "lighter";
    const auroras: Array<[number, number, string]> = [
      [Math.sin(t * 0.05) * r * 0.45, Math.cos(t * 0.07) * r * 0.35, "rgba(64, 196, 220, 0.16)"],
      [Math.cos(t * 0.04 + 2) * r * 0.5, Math.sin(t * 0.06 + 1) * r * 0.4, "rgba(150, 110, 255, 0.14)"],
    ];
    for (const [ax, ay, col] of auroras) {
      const ag = ctx.createRadialGradient(cx + ax, cy + ay, 0, cx + ax, cy + ay, r * 0.7);
      ag.addColorStop(0, col);
      ag.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = ag;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    const turn = reduced ? 0 : t * 0.006;
    ctx.fillStyle = "#DDE8FF";
    for (const s of this.stars) {
      const a = s.a + turn;
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.tw + s.ph));
      ctx.globalAlpha = alpha * tw * 0.8;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * s.d * r, cy + Math.sin(a) * s.d * r, s.s * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(127, 227, 255, 0.10)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(190, 230, 255, 0.85)";
    ctx.shadowColor = "rgba(127, 227, 255, 0.9)";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    const ticks = 60;
    const spin = reduced ? 0 : -t * 0.02;
    for (let i = 0; i < ticks; i++) {
      const a = spin + (i / ticks) * Math.PI * 2;
      const long = i % 5 === 0;
      const r1 = r + 6;
      const r2 = r + (long ? 12 : 9);
      ctx.strokeStyle = long ? "rgba(200, 168, 255, 0.55)" : "rgba(160, 200, 255, 0.22)";
      ctx.lineWidth = long ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "lighter";
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rp = this.ripples[i];
      const age = t - rp.born;
      if (age > 1.1) {
        this.ripples.splice(i, 1);
        continue;
      }
      const spread = 0.12 + age * 1.6;
      const fade = (1 - age / 1.1) * rp.power;
      ctx.lineWidth = 2 + 5 * fade;
      ctx.strokeStyle = `rgba(150, 235, 255, ${0.9 * fade})`;
      ctx.shadowColor = "rgba(127, 227, 255, 1)";
      ctx.shadowBlur = 20 * fade;
      ctx.beginPath();
      ctx.arc(cx, cy, r, rp.angle - spread, rp.angle + spread);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawParticles(dt: number): void {
    const { ctx, cx, cy } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vx *= Math.exp(-1.6 * dt);
      p.vy *= Math.exp(-1.6 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.life / p.max;
      const size = p.size * (0.6 + 0.8 * k) * 3;
      ctx.globalAlpha = k;
      ctx.drawImage(p.violet ? this.sprites.violet : this.sprites.cyan, cx + p.x - size, cy + p.y - size, size * 2, size * 2);
    }
    ctx.restore();
  }

  /** Where Wisp is close, its light pools on the wall instead of passing through it. */
  private drawWallGlow(r: number): void {
    if (this.scale <= 0.01) return;
    const bx = this.body.x + this.renderOffset.x;
    const by = this.body.y + this.renderOffset.y;
    const orb = ORB_RADIUS * this.R * this.scale;
    const gap = r - Math.hypot(bx, by) * this.R - orb;
    const near = Math.max(0, 1 - gap / (orb * 3.5));
    if (near <= 0) return;
    const a = Math.atan2(by, bx);
    const spread = 0.12 + 0.18 * (1 - near) + (orb / r) * 1.2;
    const { ctx, cx, cy } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 2 + 3 * near;
    ctx.strokeStyle = `rgba(170, 240, 255, ${0.75 * near * (this.asleep ? 0.6 : 1)})`;
    ctx.shadowColor = "rgba(127, 227, 255, 1)";
    ctx.shadowBlur = 14 * near;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a - spread, a + spread);
    ctx.stroke();
    ctx.restore();
  }

  private drawWisp(): void {
    if (this.scale <= 0.01) return;
    const { ctx, t } = this;
    const x = this.cx + (this.body.x + this.renderOffset.x) * this.R;
    const y = this.cy + (this.body.y + this.renderOffset.y) * this.R;
    const speedPx = Math.hypot(this.body.vx, this.body.vy) * this.R;
    const pulse = 1 + 0.04 * Math.sin(t * 2.4) + 0.05 * this.wobble * Math.sin(t * 28);
    const r = ORB_RADIUS * this.R * this.scale * pulse;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const breathe = this.asleep ? 0.7 : 1;
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 4.2);
    halo.addColorStop(0, `rgba(127, 227, 255, ${0.42 * breathe})`);
    halo.addColorStop(0.4, `rgba(127, 200, 255, ${0.12 * breathe})`);
    halo.addColorStop(1, "rgba(127, 200, 255, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const stretch = 1 + Math.min(0.28, speedPx / 2600);
    const ang = Math.atan2(this.body.vy, this.body.vx);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(stretch, 1 / stretch);
    ctx.rotate(-ang);
    if (this.squash > 0.01) {
      ctx.rotate(this.squashAngle);
      ctx.scale(1 - 0.32 * this.squash, 1 + 0.22 * this.squash);
      ctx.rotate(-this.squashAngle);
    }
    const body = ctx.createRadialGradient(-r * 0.2, -r * 0.3, r * 0.1, 0, 0, r);
    body.addColorStop(0, "#FFFFFF");
    body.addColorStop(0.55, "#E9FBFF");
    body.addColorStop(0.85, "#BDEFFF");
    body.addColorStop(1, "rgba(150, 225, 255, 0.85)");
    ctx.fillStyle = body;
    ctx.shadowColor = "rgba(127, 227, 255, 0.9)";
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    const ex = this.gaze.x * r * 0.2;
    const ey = this.gaze.y * r * 0.16;
    const spacing = r * 0.34;
    const eyeW = r * 0.12;
    const eyeH = r * 0.2;
    ctx.fillStyle = "#13223F";
    ctx.strokeStyle = "#13223F";
    ctx.lineWidth = Math.max(1.5, r * 0.07);
    ctx.lineCap = "round";
    const blinking = t < this.blinkUntil;
    const smiling = t < this.smileUntil;
    for (const side of [-1, 1]) {
      const px = side * spacing + ex;
      const py = -r * 0.06 + ey;
      ctx.beginPath();
      if (t < this.bonkUntil) {
        const w = eyeW * 1.1;
        ctx.moveTo(px + side * w, py - w);
        ctx.lineTo(px - side * w * 0.2, py);
        ctx.lineTo(px + side * w, py + w);
        ctx.stroke();
      } else if (this.asleep) {
        ctx.arc(px, py - eyeH * 0.2, eyeW * 1.1, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      } else if (smiling) {
        ctx.arc(px, py + eyeH * 0.35, eyeW * 1.15, 1.15 * Math.PI, 1.85 * Math.PI);
        ctx.stroke();
      } else {
        ctx.ellipse(px, py, eyeW, blinking ? eyeH * 0.12 : eyeH, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!blinking) {
          ctx.fillStyle = "#FFFFFF";
          ctx.beginPath();
          ctx.arc(px + eyeW * 0.35, py - eyeH * 0.4, eyeW * 0.32, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#13223F";
        }
      }
    }
    if (smiling) {
      ctx.beginPath();
      ctx.arc(ex, r * 0.22 + ey, r * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255, 150, 200, 0.28)";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * spacing * 1.55 + ex * 0.6, r * 0.2 + ey * 0.6, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.font = `600 ${Math.round(r * 0.5)}px ${this.font}`;
    ctx.fillStyle = "#CFE6FF";
    for (let i = this.zs.length - 1; i >= 0; i--) {
      const age = t - this.zs[i];
      if (age > 2.4) {
        this.zs.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, 1 - age / 2.4) * 0.8;
      ctx.fillText("z", x + r * 0.8 + age * r * 0.35 + Math.sin(age * 3) * 4, y - r * 0.9 - age * r * 0.8);
    }
    ctx.restore();
  }
}
