// The domain window: draws Wisp and its world, turns pointer input into
// grabs, throws and pokes, keeps the local Wisp in step with the server's, and
// decides how Wisp looks and feels from moment to moment.
//
// Physics runs in domain units (the bubble's radius is 1) through
// @wisp/shared, the same code the server runs. Everything visual (faces,
// emotes, particles, ripples, cracks, the shatter) is local decoration on top.

import type { MessageEvent, StateEvent, Watcher, WispState } from "@wisp/gen-shared";
import {
  BURST_COAST,
  Body,
  FLING_COAST,
  FLING_SPEED,
  Mood,
  OPEN_FOR,
  OPEN_HALF_H,
  OPEN_HALF_W,
  ORB_RADIUS,
  SLEEP_AFTER,
  STEP,
  TRICKS,
  Trick,
  TrickKind,
  advance,
  burstLaunch,
  clampTarget,
  idleTrick,
  isBursting,
  isSplash,
  isTrick,
  pokeImpulse,
  readMessage,
  sanitize,
  step,
  trickAge,
  wallPush,
} from "@wisp/shared";
import {
  Cam,
  Crack,
  Emotes,
  Particles,
  RGB,
  Ripple,
  Shatter,
  clamp01,
  drawCracks,
  drawRipples,
  drawSpeech,
  easeOut,
  glowSprite,
  makeCrack,
  rand,
  rgba,
  toScreen,
  toWorld,
} from "./fx";
import type { DomainLink } from "./net";
import { Brows, Eyes, Look, Mouth, drawHalo, drawWisp } from "./wisp";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const now = () => performance.now() / 1000;
const pick = <T>(list: readonly T[]): T => list[(Math.random() * list.length) | 0];
const easeInOut = (x: number) => {
  const k = clamp01(x);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};

/** Particle speeds were tuned in pixels on a 250px domain; this turns them into domain units. */
const PX = 1 / 250;

const CYAN: RGB = [150, 235, 255];
const VIOLET: RGB = [200, 168, 255];
const GOLD: RGB = [255, 214, 120];
const PINK: RGB = [255, 140, 200];
const WHITE: RGB = [255, 255, 255];

const CALM: RGB = [127, 227, 255];
const TINTS: Record<Mood, RGB> = {
  happy: [140, 232, 255],
  love: [255, 140, 200],
  shy: [255, 160, 200],
  laugh: [255, 214, 120],
  excited: [255, 205, 110],
  curious: [140, 255, 215],
  comfort: [255, 195, 150],
  grumpy: [255, 105, 90],
  sad: [110, 150, 255],
  scared: [190, 190, 255],
  sleepy: [170, 160, 255],
};

interface Face {
  eyes: Eyes;
  mouth: Mouth;
  brows: Brows;
  blush: number;
}

const MOOD_FACE: Record<Mood, Face> = {
  happy: { eyes: "happy", mouth: "grin", brows: "none", blush: 0.35 },
  love: { eyes: "heart", mouth: "smile", brows: "none", blush: 0.9 },
  shy: { eyes: "happy", mouth: "wavy", brows: "none", blush: 1 },
  laugh: { eyes: "laugh", mouth: "open", brows: "none", blush: 0.4 },
  excited: { eyes: "star", mouth: "open", brows: "none", blush: 0.3 },
  curious: { eyes: "open", mouth: "o", brows: "raised", blush: 0 },
  comfort: { eyes: "happy", mouth: "smile", brows: "none", blush: 0.6 },
  grumpy: { eyes: "angry", mouth: "frown", brows: "angry", blush: 0 },
  sad: { eyes: "puppy", mouth: "frown", brows: "sad", blush: 0 },
  scared: { eyes: "wide", mouth: "wavy", brows: "sad", blush: 0 },
  sleepy: { eyes: "sleepy", mouth: "flat", brows: "none", blush: 0 },
};

/** How Wisp feels while doing a trick on its own. */
const TRICK_MOOD: Record<TrickKind, Mood> = {
  zoom: "excited",
  loop: "happy",
  spin: "happy",
  hop: "happy",
  wiggle: "laugh",
  dance: "happy",
  zigzag: "excited",
  heart: "love",
  dash: "scared",
  shy: "shy",
  approach: "happy",
};

const MOOD_STATUS: Record<Mood, string> = {
  happy: "happy!",
  love: "in love",
  shy: "blushing",
  laugh: "laughing",
  excited: "so excited",
  curious: "curious",
  comfort: "comforting",
  grumpy: "grumpy",
  sad: "sad",
  scared: "scared!",
  sleepy: "sleepy",
};

const TRICK_STATUS: Record<TrickKind, string> = {
  zoom: "zooming!",
  loop: "looping",
  spin: "spinning",
  hop: "hopping",
  wiggle: "wiggling",
  dance: "dancing",
  zigzag: "zigzagging",
  heart: "drawing a heart",
  dash: "dashing",
  shy: "hiding",
  approach: "coming closer",
};

const MOODS = Object.keys(TINTS) as Mood[];

interface Star {
  x: number; // domain units
  y: number;
  s: number;
  tw: number;
  ph: number;
}

function makeStars(n: number, minR: number, maxR: number): Star[] {
  return Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(minR * minR + Math.random() * (maxR * maxR - minR * minR));
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, s: 0.4 + Math.random() * 1.3, tw: 0.6 + Math.random() * 2.2, ph: Math.random() * 6.28 };
  });
}

export interface DomainUi {
  status: HTMLElement;
  watchers: HTMLElement;
  card: HTMLElement;
  cardName: HTMLElement;
  cardWhere: HTMLElement;
  cardText: HTMLElement;
}

export class DomainView {
  /** Called when the bubble bursts or re-forms; `byMe` when this viewer burst it. */
  onOpenChange: ((open: boolean, byMe: boolean) => void) | undefined;

  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private rectLeft = 0;
  private rectTop = 0;
  private cam: Cam = { x: 0, y: 0, s: 100, rot: 0 };
  private camFrom: Cam | undefined; // viewport coordinates, while the camera moves between bubble and arena
  private camTweenStart = 0;
  private layoutOpen = false;
  private font: string;
  private nearStars = makeStars(110, 0, 1);
  private farStars = makeStars(reduced ? 120 : 260, 1, Math.hypot(OPEN_HALF_W, OPEN_HALF_H));

  // Shared state (domain units, server clock)
  private body: Body = { x: 0, y: 0, vx: 0, vy: 0, strain: 0 };
  private clockOffset = 0;
  private haveClock = false;
  private simulatedUntil = 0;
  private asleep = false;
  private open = false;
  private flingUntil = 0;
  private trick: Trick | undefined;
  private holder: { userId: string; nickname: string } | undefined;
  private remoteTarget: { x: number; y: number } | undefined;
  private lastInteraction = 0;
  private watchers: Watcher[] = [];
  private nextIdleTrick = 0;

  // Me
  private pointer = { x: 0, y: 0, inside: false, down: false, dragging: false, downAt: 0, downX: 0, downY: 0 };
  private samples: Array<{ x: number; y: number; at: number }> = [];
  private holding = false;
  private lastDragSent = 0;
  private notice = "";
  private noticeUntil = 0;

  // Looks
  private t = 0;
  private gaze = { x: 0, y: 0 };
  private lookAt: { x: number; y: number; until: number } | undefined; // screen px
  private blinkUntil = 0;
  private nextBlink = 2;
  private mood: Mood | undefined;
  private moodUntil = 0;
  private pending: { mood: Mood; say: string; at: number } | undefined;
  private mote: { x: number; y: number; born: number; arrive: number } | undefined; // canvas px
  private surprisedUntil = 0;
  private bonkUntil = 0;
  private dizzyUntil = 0;
  private giggleUntil = 0;
  private yawnUntil = 0;
  private stretchUntil = 0;
  private pokeCombo = 0;
  private lastPokeAt = -10;
  private petSince = 0;
  private speech: { text: string; born: number; life: number } | undefined;
  private wobble = 0;
  private squash = 0;
  private squashAngle = 0;
  private shake = 0;
  private tint: RGB = [...CALM];
  private renderOffset = { x: 0, y: 0 };
  private particles = new Particles(reduced ? 160 : 800);
  private emotes = new Emotes();
  private shatter = new Shatter();
  private ripples: Ripple[] = [];
  private cracks: Crack[] = [];
  private crackLevel = 0;
  private strainAngle = 0;
  private lastPressRipple = 0;
  private strainSaid = 0;
  private lastImpact = -1;
  private emitAt: Record<string, number> = {};
  private lastStatus = "";
  private cardTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private canvas: HTMLCanvasElement,
    private ui: DomainUi,
    private link: DomainLink,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.font = getComputedStyle(document.body).fontFamily;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    this.bindInput();
    link.onState((e) => this.applyEvent(e));
    link.onWatchers((w) => this.setWatchers(w));
    link.onMessage((m) => this.applyMessage(m));
    this.simulatedUntil = this.simNow();
    this.lastInteraction = this.simNow();
    this.nextIdleTrick = this.simNow() + 6;
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
      if (this.open) this.setOpen(true, false, false);
    }
    if (watchers) this.setWatchers(watchers);
    this.summonMotes();
    requestAnimationFrame((ms) => this.frame(ms));
  }

  /** Takes a server state as the truth, advanced to now. `smooth` hides the jump (up to `maxJump`). */
  private adopt(s: WispState, smooth: boolean, maxJump = 0.3): void {
    this.asleep = s.asleep;
    this.flingUntil = s.flingUntil;
    this.open = s.open;
    this.holder = s.holderUserId ? { userId: s.holderUserId, nickname: s.holderNickname || "someone" } : undefined;
    this.remoteTarget = this.holder && this.holder.userId !== this.link.me ? { x: s.targetX, y: s.targetY } : undefined;
    this.trick = s.trick && isTrick(s.trick) ? { kind: s.trick, start: s.trickStart, x: s.trickX, y: s.trickY, dir: s.trickDir } : undefined;
    if (this.holding) return; // My own hand is the truth while I hold Wisp.

    const snap: Body = { x: s.x, y: s.y, vx: s.vx, vy: s.vy, strain: s.strain };
    advance(snap, s.simTime, this.simNow(), this.forces(this.remoteTarget), 1);
    if (smooth) {
      this.renderOffset.x += this.body.x - snap.x;
      this.renderOffset.y += this.body.y - snap.y;
      const m = Math.hypot(this.renderOffset.x, this.renderOffset.y);
      if (m > maxJump) {
        this.renderOffset.x *= maxJump / m;
        this.renderOffset.y *= maxJump / m;
      }
    }
    this.body = snap;
    this.simulatedUntil = this.simNow();
  }

  private forces(target: { x: number; y: number } | undefined) {
    return { target, asleep: this.asleep, flingUntil: this.flingUntil, trick: this.trick, open: this.open };
  }

  private applyEvent(e: StateEvent): void {
    if (!e.state) return;
    this.syncClock(e.state.simTime);
    const me = this.link.me;
    const byMe = e.byUserId !== "" && e.byUserId === me;
    const byOther = e.byUserId !== "" && !byMe;
    // The burst knocks Wisp out of whoever's hand; the server letting go of me (timeout) ends my hold too.
    if (this.holding && (e.cause === "burst" || (e.cause === "release" && byMe))) this.dropHold();
    const wasOpen = this.open;
    this.adopt(e.state, true, e.cause === "reform" ? 3 : 0.3);
    switch (e.cause) {
      case "grab":
        if (byOther) this.reactGrab();
        break;
      case "release":
        if (byOther && Math.hypot(this.body.vx, this.body.vy) > FLING_SPEED) this.reactFling();
        break;
      case "poke":
        if (byOther) this.giggle();
        break;
      case "summon":
        this.summonFx(e.byNickname || "someone");
        break;
      case "wake":
        this.wakeFx();
        break;
      case "sleep":
        this.yawnUntil = this.t + 1.4;
        break;
      case "burst":
        this.burstFx(byMe, e.byNickname || "someone");
        break;
      case "reform":
        this.reformFx(e.byNickname);
        break;
    }
    // Joined mid-burst, or missed the moment: just match the layout.
    if (this.open !== wasOpen && e.cause !== "burst" && e.cause !== "reform") this.setOpen(this.open, false, false);
  }

  private applyMessage(m: MessageEvent): void {
    const mine = m.fromUserId !== "" && m.fromUserId === this.link.me;
    const mood = (MOODS as string[]).includes(m.mood) ? (m.mood as Mood) : "happy";
    const where = m.channelName ? `in #${m.channelName}` : "in the domain";
    this.showCard(mine ? "You" : m.fromNickname || "someone", where, m.text || "…");
    const delay = Math.max(0.25, Math.min(2, m.reactAt - this.simNow()));
    this.pending = { mood, say: m.say, at: this.t + delay };
    const rect = this.ui.card.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    this.mote = { x: rect.left + rect.width / 2 - canvasRect.left, y: rect.bottom - canvasRect.top, born: this.t, arrive: this.t + delay };
  }

  private setWatchers(w: Watcher[]): void {
    this.watchers = w;
    this.renderWatchers();
  }

  private renderWatchers(): void {
    if (this.link.mode === "solo") {
      this.ui.watchers.textContent = "Just you (not connected to Root)";
      return;
    }
    const others = this.watchers.filter((w) => w.userId !== this.link.me).map((w) => w.nickname || "someone");
    let text = "Just you here";
    if (others.length === 1) text = `You and ${others[0]}`;
    else if (others.length === 2) text = `You, ${others[0]} and ${others[1]}`;
    else if (others.length > 2) text = `You, ${others[0]}, ${others[1]} and ${others.length - 2} more`;
    this.ui.watchers.textContent = text;
  }

  private showCard(name: string, where: string, text: string): void {
    const { card, cardName, cardWhere, cardText } = this.ui;
    cardName.textContent = name;
    cardWhere.textContent = where;
    cardText.textContent = text;
    card.hidden = false;
    card.classList.remove("show");
    void card.offsetWidth; // restart the animation
    card.classList.add("show");
    if (this.cardTimer) clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => {
      card.classList.remove("show");
      card.hidden = true;
    }, 6000);
  }

  // ---- Talking to Wisp, sealing the bubble -------------------------------------

  /** Something typed into the domain's message box. */
  say(text: string): void {
    const clean = text.replace(/\s+/g, " ").trim().slice(0, 160);
    if (!clean) return;
    if (this.link.mode === "live") {
      this.link.say(clean);
      return;
    }
    const reaction = readMessage(clean);
    const reactAt = this.simNow() + 0.7;
    this.applyMessage({ fromUserId: "", fromNickname: "You", text: clean, channelName: "", mood: reaction.mood, say: reaction.say, reactAt });
    if (reaction.mood === "sleepy") {
      this.asleep = true;
      this.trick = undefined;
      this.yawnUntil = this.t + 1.4;
      return;
    }
    this.wake();
    if (!this.holding && reaction.trick) this.startTrickLocal(reaction.trick, 0.7);
  }

  /** Puts the bubble back together. */
  seal(): void {
    if (!this.open) return;
    if (this.link.mode === "live") {
      this.link.reform();
      return;
    }
    this.open = false;
    this.trick = undefined;
    const inside = sanitize(this.body);
    this.body = { x: inside.x, y: inside.y, vx: inside.vx * 0.3, vy: inside.vy * 0.3, strain: 0 };
    this.renderOffset = { x: 0, y: 0 };
    this.reformFx("");
  }

  get isOpen(): boolean {
    return this.open;
  }

  // ---- Input ------------------------------------------------------------------

  private toDomain(e: PointerEvent): { x: number; y: number } {
    return toWorld(this.cam, e.clientX - this.rectLeft, e.clientY - this.rectTop);
  }

  private overWisp(p: { x: number; y: number }): boolean {
    return this.t > 1.1 && Math.hypot(p.x - this.body.x, p.y - this.body.y) < ORB_RADIUS * 1.8;
  }

  private insideArena(p: { x: number; y: number }): boolean {
    return this.open ? Math.abs(p.x) < OPEN_HALF_W && Math.abs(p.y) < OPEN_HALF_H : Math.hypot(p.x, p.y) < 1.15;
  }

  private wake(): void {
    this.lastInteraction = this.simNow();
    if (this.asleep) {
      this.asleep = false;
      this.wakeFx();
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
      this.pointer.inside = this.insideArena(p);
      if (this.pointer.inside && !this.asleep) this.lastInteraction = this.simNow();
      if (this.pointer.down) {
        if (!this.pointer.dragging && Math.hypot(p.x - this.pointer.downX, p.y - this.pointer.downY) * this.cam.s > 6) this.startHold();
        const at = performance.now();
        this.samples.push({ ...p, at });
        while (this.samples.length > 2 && at - this.samples[0].at > 90) this.samples.shift();
        if (this.holding) {
          const target = clampTarget(p, this.open);
          this.link.drag(target.x, target.y);
          this.lastDragSent = this.t;
        }
      }
      const over = this.overWisp(p);
      if (over && !this.pointer.down) {
        if (!this.petSince) this.petSince = this.t;
      } else this.petSince = 0;
      c.style.cursor = this.pointer.dragging ? "grabbing" : over ? "grab" : "default";
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
      this.petSince = 0;
    });

    c.addEventListener("keydown", (e) => {
      const angles: Record<string, number> = { ArrowRight: 0, ArrowDown: Math.PI / 2, ArrowLeft: Math.PI, ArrowUp: -Math.PI / 2 };
      if (e.key in angles) {
        // Arrow keys push in screen directions, whichever way the arena is turned.
        this.poke(angles[e.key] - this.cam.rot, false);
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
    this.trick = undefined;
    this.holder = { userId: this.link.me, nickname: "you" };
    this.reactGrab();
    const at = clampTarget({ x: this.pointer.x, y: this.pointer.y }, this.open);
    void this.link.grab(at.x, at.y).then((res) => {
      if (res.ok) return;
      // Someone else got there first.
      this.dropHold();
      if (res.event) this.applyEvent(res.event);
      if (this.holder && this.holder.userId !== this.link.me) this.setNotice(`${this.holder.nickname} has Wisp`, 1.5);
    });
  }

  /** Lets go without throwing (the bubble burst, or the server let go for me). */
  private dropHold(): void {
    this.holding = false;
    this.pointer.dragging = false;
    this.pointer.down = false;
    if (this.holder?.userId === this.link.me) this.holder = undefined;
    this.canvas.style.cursor = "default";
  }

  private throwWisp(): void {
    const s = this.samples;
    const a = s[0];
    const b = s[s.length - 1];
    const dt = Math.max(0.016, (b.at - a.at) / 1000);
    const strain = this.body.strain ?? 0;
    this.body = { ...sanitize({ x: this.body.x, y: this.body.y, vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt }, this.open), strain };
    const fast = Math.hypot(this.body.vx, this.body.vy) > FLING_SPEED;
    if (fast) this.flingUntil = this.simNow() + FLING_COAST;
    this.holding = false;
    this.holder = undefined;
    this.link.release(this.body);
    if (fast) this.reactFling();
  }

  private poke(angle: number, smile = true): void {
    if (this.holder && this.holder.userId !== this.link.me) return;
    this.wake();
    this.trick = undefined;
    const push = pokeImpulse(angle);
    this.body.vx += push.vx;
    this.body.vy += push.vy;
    if (smile) this.giggle();
    this.link.poke(angle);
  }

  // ---- Reactions to what happens ----------------------------------------------------

  private wispPx(): { x: number; y: number } {
    const [x, y] = toScreen(this.cam, this.body.x + this.renderOffset.x, this.body.y + this.renderOffset.y);
    return { x, y };
  }

  private speak(text: string, life = 1.8 + text.length * 0.045): void {
    this.speech = { text, born: this.t, life };
  }

  private applyMood(mood: Mood, say: string, seconds = 4.2): void {
    this.mood = mood;
    this.moodUntil = this.t + seconds;
    this.emotes.clearAttached();
    if (say) this.speak(say);
    const { x, y } = this.body;
    const t = this.t;
    switch (mood) {
      case "love":
        for (let i = 0; i < 6; i++) this.emotes.float("heart", x + rand(-0.08, 0.08), y - 0.05, rand(-0.25, 0.25), rand(-0.6, -0.3), t, rand(1.2, 1.8), rand(0.35, 0.6));
        break;
      case "excited":
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          this.emotes.float("star", x, y, Math.cos(a) * 0.6, Math.sin(a) * 0.6, t, 1, rand(0.35, 0.5));
        }
        break;
      case "curious":
        this.emotes.attach("question", 0.9, -1.25, t, 2.4, 0.55);
        break;
      case "grumpy":
        this.emotes.attach("anger", 0.85, -0.85, t, seconds, 0.5);
        break;
      case "scared":
        this.emotes.attach("bang", 0.95, -1.15, t, 1.4, 0.6);
        this.emotes.attach("sweat", -0.95, -0.55, t, 2, 0.45);
        break;
      case "shy":
        this.emotes.attach("sweat", 0.95, -0.6, t, 2.2, 0.4);
        break;
      case "sleepy":
        this.yawnUntil = t + 1.4;
        break;
      case "comfort":
        for (let i = 0; i < 3; i++) this.emotes.float("heart", x + rand(-0.1, 0.1), y - 0.06, rand(-0.12, 0.12), rand(-0.3, -0.18), t, 2, 0.4);
        break;
      default:
        break;
    }
    this.particles.burst(x, y, reduced ? 10 : 34, 260 * PX, [TINTS[mood], WHITE, CYAN]);
    this.wobble = 1;
  }

  private reactGrab(): void {
    this.surprisedUntil = this.t + 0.35;
    this.emotes.attach("bang", 0.95, -1.15, this.t, 0.6, 0.55);
    this.particles.burst(this.body.x, this.body.y, reduced ? 4 : 12, 160 * PX, [CYAN, WHITE]);
  }

  private reactFling(): void {
    if (Math.random() < 0.5) this.speak(pick(["wheee!", "whoosh!", "yahoo!", "weee~"]), 1.2);
    this.particles.burst(this.body.x, this.body.y, reduced ? 6 : 18, 200 * PX, [GOLD, WHITE, CYAN]);
  }

  private giggle(): void {
    this.giggleUntil = this.t + 0.9;
    this.wobble = 1;
    this.particles.burst(this.body.x, this.body.y, reduced ? 8 : 22, 260 * PX, [CYAN, VIOLET]);
    this.pokeCombo = this.t - this.lastPokeAt < 1.6 ? this.pokeCombo + 1 : 1;
    this.lastPokeAt = this.t;
    if (this.pokeCombo === 3) this.applyMood("laugh", pick(["hehehe!", "that tickles!", "hahaha"]), 1.6);
    else if (this.pokeCombo === 6) this.applyMood("grumpy", pick(["hey!!", "STOP IT", "hmph!"]), 1.8);
    else if (this.pokeCombo === 1 && Math.random() < 0.25) this.speak(pick(["hehe", "eep!", "boop!"]), 1);
  }

  private wakeFx(): void {
    this.blinkUntil = this.t + 0.15;
    this.stretchUntil = this.t + 0.6;
    this.emotes.attach("bang", 0.95, -1.15, this.t, 0.7, 0.5);
    this.particles.burst(this.body.x, this.body.y, reduced ? 4 : 10, 120 * PX, [CYAN, WHITE]);
  }

  private summonFx(by: string): void {
    this.setNotice(`summoned by ${by}!`, 3);
    this.speak(pick(["you called?", "✨ i'm here ✨", "hiii!"]));
    this.particles.burst(this.body.x, this.body.y, reduced ? 12 : 40, 320 * PX, [CYAN, VIOLET, GOLD]);
    this.wobble = 1;
  }

  private impact(nx: number, ny: number, speed: number): void {
    if (this.t - this.lastImpact < 0.12) return;
    this.lastImpact = this.t;
    const pxSpeed = speed * 250; // tuned in pixels on a 250px-radius domain
    const wall = this.open
      ? { x: this.body.x + nx * ORB_RADIUS, y: this.body.y + ny * ORB_RADIUS }
      : { x: nx, y: ny };
    this.ripples.push({ ...wall, nx, ny, born: this.t, power: Math.max(0.25, Math.min(1, pxSpeed / 1300)), open: this.open });
    this.particles.burst(wall.x - nx * 0.01, wall.y - ny * 0.01, Math.min(30, 6 + pxSpeed / 55), Math.min(340, 80 + pxSpeed * 0.2) * PX, [CYAN, VIOLET], -nx, -ny);
    this.wobble = Math.min(1, this.wobble + pxSpeed / 1600);
    this.squash = Math.max(this.squash, Math.min(1, pxSpeed / 1400));
    this.squashAngle = Math.atan2(ny, nx) + this.cam.rot;
    if (pxSpeed > 600) this.bonkUntil = this.t + 0.45;
    if (pxSpeed > 1500) {
      this.dizzyUntil = this.t + 1.4;
      if (Math.random() < 0.5) this.speak(pick(["ow!", "oof", "@_@", "ouch!"]), 1.1);
    }
    if (!reduced) this.shake = Math.max(this.shake, Math.min(1, (pxSpeed - 300) / 1500));
  }

  /** The bubble gives way: glass everywhere, a flash, and the domain opens up to the whole window. */
  private burstFx(byMe: boolean, by: string): void {
    const before = { x: this.cam.x + this.rectLeft, y: this.cam.y + this.rectTop, r: this.cam.s };
    const breakAngle = Math.atan2(this.body.y, this.body.x) + this.cam.rot;
    this.setOpen(true, true, byMe);
    this.shatter.explode(before.x - this.rectLeft, before.y - this.rectTop, before.r, breakAngle, this.t, reduced ? 16 : 48);
    this.shatter.flash(this.t, reduced ? 0.2 : 0.8);
    if (!reduced) this.shake = 1.6;
    this.cracks = [];
    this.crackLevel = 0;
    this.particles.burst(this.body.x, this.body.y, reduced ? 24 : 90, 700 * PX, [CYAN, VIOLET, WHITE, GOLD], undefined, undefined, 1.4);
    this.applyMood("excited", pick(["WHEEEEE!!", "FREEDOM!!", "I'M FREE!!", "WOOOOO!"]), 3.5);
    this.setNotice(byMe ? "you burst the bubble!" : `${by} burst the bubble!`, 3);
  }

  private reformFx(by: string | undefined): void {
    this.setOpen(false, true, false);
    const target = this.bubbleCam();
    this.shatter.implode(target.x, target.y, Math.hypot(this.W, this.H), target.s, this.t);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.ripples.push({ x: Math.cos(a), y: Math.sin(a), nx: Math.cos(a), ny: Math.sin(a), born: this.t + 0.5, power: 0.6, open: false });
    }
    for (let i = 0; i < (reduced ? 12 : 50); i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit(Math.cos(a), Math.sin(a), -Math.cos(a) * 0.4, -Math.sin(a) * 0.4, rand(0.6, 1.2), rand(1, 2.5), Math.random() < 0.3 ? VIOLET : CYAN);
    }
    this.cracks = [];
    this.crackLevel = 0;
    this.applyMood("curious", pick(["oh!", "home sweet bubble", "huh?"]), 1.8);
    if (by) this.setNotice(`${by} sealed the bubble`, 2.5);
  }

  /** Switches the page between the bubble window and the burst, full-window arena. */
  private setOpen(open: boolean, animate: boolean, byMe: boolean): void {
    if (open === this.layoutOpen) return;
    const from: Cam = { x: this.cam.x + this.rectLeft, y: this.cam.y + this.rectTop, s: this.cam.s, rot: this.cam.rot };
    document.body.classList.toggle("open", open);
    this.layoutOpen = open;
    this.resize();
    this.camFrom = animate && !reduced ? from : undefined;
    this.camTweenStart = this.t;
    this.onOpenChange?.(open, byMe);
  }

  private summonMotes(): void {
    if (reduced) return;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 0.85 + Math.random() * 0.2;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      this.particles.emit(x, y, (this.body.x - x) * 1.9, (this.body.y - y) * 1.9, 0.9 + Math.random() * 0.4, 1 + Math.random() * 2, Math.random() < 0.35 ? VIOLET : CYAN);
    }
  }

  // ---- Solo mode: the server's jobs, done here ------------------------------------------

  private startTrickLocal(kind: TrickKind, delay: number): void {
    this.trick = { kind, start: this.simNow() + delay, x: this.body.x, y: this.body.y, dir: Math.random() < 0.5 ? -1 : 1 };
    this.nextIdleTrick = this.simNow() + delay + 9 + Math.random() * 10;
  }

  private soloDuties(nowSim: number): void {
    if (this.link.mode !== "solo") return;
    if (!this.open && this.holding && isBursting(this.body)) {
      this.dropHold();
      burstLaunch(this.body);
      this.open = true;
      this.flingUntil = nowSim + BURST_COAST;
      this.lastInteraction = nowSim;
      this.burstFx(true, "you");
      return;
    }
    if (this.holding) return;
    if (this.open && nowSim - this.lastInteraction > OPEN_FOR) this.seal();
    if (!this.asleep && nowSim - this.lastInteraction > SLEEP_AFTER) {
      this.asleep = true;
      this.trick = undefined;
      this.yawnUntil = this.t + 1.4;
    }
    if (!this.asleep && !this.trick && nowSim > this.nextIdleTrick) this.startTrickLocal(idleTrick(), 0);
  }

  // ---- Frame ----------------------------------------------------------------------

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = rect.width;
    this.H = rect.height;
    this.rectLeft = rect.left;
    this.rectTop = rect.top;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
  }

  private bubbleCam(): Cam {
    return { x: this.W / 2, y: this.H / 2, s: Math.max(60, Math.min(this.W, this.H) / 2 - 18), rot: 0 };
  }

  /** The open arena fitted to the window, leaving room for the bar on top and the message box below. Turned sideways on tall screens. */
  private openCam(): Cam {
    const top = 64;
    const bottom = 84;
    const availW = this.W - 24;
    const availH = this.H - top - bottom;
    const portrait = availH > availW * 1.05;
    const s = portrait
      ? Math.min(availH / (2 * OPEN_HALF_W), availW / (2 * OPEN_HALF_H))
      : Math.min(availW / (2 * OPEN_HALF_W), availH / (2 * OPEN_HALF_H));
    return { x: this.W / 2, y: top + availH / 2, s: Math.max(40, s), rot: portrait ? Math.PI / 2 : 0 };
  }

  private updateCam(): void {
    const target = this.layoutOpen ? this.openCam() : this.bubbleCam();
    if (!this.camFrom) {
      this.cam = target;
      return;
    }
    const k = easeInOut((this.t - this.camTweenStart) / 0.9);
    if (k >= 1) {
      this.camFrom = undefined;
      this.cam = target;
      return;
    }
    const f = this.camFrom;
    this.cam = {
      x: f.x - this.rectLeft + (target.x - (f.x - this.rectLeft)) * k,
      y: f.y - this.rectTop + (target.y - (f.y - this.rectTop)) * k,
      s: f.s + (target.s - f.s) * k,
      rot: f.rot + (target.rot - f.rot) * k,
    };
  }

  private prevFrame = performance.now();

  private frame(ms: number): void {
    const dt = Math.min(0.05, (ms - this.prevFrame) / 1000);
    this.prevFrame = ms;
    this.t += dt;
    this.updateCam();
    this.simulate();
    this.updateLooks(dt);
    this.updateStatus();
    this.draw(dt);
    requestAnimationFrame((next) => this.frame(next));
  }

  private holdTarget(): { x: number; y: number } | undefined {
    return this.holding ? clampTarget({ x: this.pointer.x, y: this.pointer.y }, this.open) : this.remoteTarget;
  }

  private simulate(): void {
    const target = this.holdTarget();
    const until = this.simNow();
    if (until - this.simulatedUntil > 0.5) this.simulatedUntil = until - STEP;
    while (this.simulatedUntil + STEP <= until) {
      const hit = step(this.body, { t: this.simulatedUntil, ...this.forces(target) });
      this.simulatedUntil += STEP;
      if (hit && isSplash(hit)) this.impact(hit.nx, hit.ny, hit.speed);
    }
    // A trick that's over: a spin leaves Wisp a little dizzy.
    if (this.trick && until > this.trick.start && trickAge(this.trick, until) === undefined) {
      if (this.trick.kind === "spin") this.dizzyUntil = this.t + 0.8;
      this.trick = undefined;
    }
    // Holding still still counts as holding: tell the server we haven't let go.
    if (this.holding && this.t - this.lastDragSent > 0.5 && target) {
      this.link.drag(target.x, target.y);
      this.lastDragSent = this.t;
    }
    this.soloDuties(until);
  }

  /** The strain to show. While I'm the one pressing, my screen runs a hair ahead of the server, so the burst waits for its word. */
  private shownStrain(): number {
    const s = this.open ? 0 : this.body.strain ?? 0;
    return this.holding && this.link.mode === "live" ? Math.min(s, 0.985) : s;
  }

  private every(key: string, seconds: number): boolean {
    if (this.t - (this.emitAt[key] ?? -10) < seconds) return false;
    this.emitAt[key] = this.t;
    return true;
  }

  private updateLooks(dt: number): void {
    const t = this.t;
    const { x, y } = this.body;
    if (this.mood && t > this.moodUntil) this.mood = undefined;

    // A message reaching Wisp.
    if (this.pending && t >= this.pending.at) {
      const p = this.pending;
      this.pending = undefined;
      this.mote = undefined;
      this.particles.burst(x, y, reduced ? 8 : 26, 220 * PX, [WHITE, CYAN, TINTS[p.mood]]);
      this.applyMood(p.mood, p.say);
    }

    if (t > this.nextBlink && !this.asleep) {
      this.blinkUntil = t + 0.13;
      this.nextBlink = t + (Math.random() < 0.2 ? 0.25 : 2.5 + Math.random() * 4);
    }

    // Wall strain: cracks, ripples, a straining face.
    const strain = this.shownStrain();
    const pushing = !this.open && wallPush(this.body, this.holdTarget()) > 0.04;
    if (pushing) {
      this.strainAngle = Math.atan2(y, x);
      if (!reduced) this.shake = Math.max(this.shake, strain * 0.35);
      if (t - this.lastPressRipple > Math.max(0.12, 0.5 - strain * 0.4)) {
        this.lastPressRipple = t;
        this.ripples.push({ x: Math.cos(this.strainAngle), y: Math.sin(this.strainAngle), nx: Math.cos(this.strainAngle), ny: Math.sin(this.strainAngle), born: t, power: 0.3 + 0.7 * strain, open: false });
      }
      if (this.every("sweat", 0.5 - strain * 0.25)) {
        this.emotes.float("sweat", x + rand(-0.04, 0.04), y - 0.07, rand(-0.3, 0.3), -0.25, t, 0.8, 0.32, 1.4);
      }
    }
    if (strain > this.crackLevel + 0.09 && strain > 0.08) {
      this.crackLevel = strain;
      this.cracks.push(makeCrack(this.strainAngle + rand(-0.12, 0.12), strain, t));
      this.particles.burst(Math.cos(this.strainAngle), Math.sin(this.strainAngle), reduced ? 4 : 10, 140 * PX, [WHITE, CYAN]);
    }
    this.crackLevel = Math.min(this.crackLevel, strain);
    if (strain < 0.25) this.strainSaid = 0;
    else if (strain > 0.5 && this.strainSaid < 1) {
      this.strainSaid = 1;
      this.speak(pick(["nngh…!", "hrrk—", "it's… creaking…"]), 1.3);
    } else if (strain > 0.85 && this.strainSaid < 2) {
      this.strainSaid = 2;
      this.speak(pick(["it's gonna—!!", "IT'S CRACKING", "!!!!"]), 1.2);
    }

    // Moods give off emotes while they last.
    const mood = this.mood;
    if (mood === "love" && this.every("love", 0.28)) this.emotes.float("heart", x + rand(-0.06, 0.06), y - 0.08, rand(-0.15, 0.15), rand(-0.45, -0.3), t, 1.5, rand(0.3, 0.5));
    if (mood === "comfort" && this.every("comfort", 0.55)) this.emotes.float("heart", x + rand(-0.06, 0.06), y - 0.08, rand(-0.1, 0.1), -0.22, t, 1.8, 0.35);
    if (mood === "shy" && this.every("shy", 0.8)) this.emotes.float("heart", x + rand(-0.08, 0.08), y - 0.06, rand(-0.1, 0.1), -0.25, t, 1.2, 0.28);
    if ((mood === "excited" || mood === "laugh") && this.every("sparkle", mood === "excited" ? 0.14 : 0.35)) {
      const a = Math.random() * Math.PI * 2;
      this.emotes.float(mood === "excited" ? "star" : "spark", x, y, Math.cos(a) * 0.45, Math.sin(a) * 0.45, t, 0.8, rand(0.25, 0.4));
    }
    if (mood === "sad" && this.every("tear", 0.5)) {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.emotes.float("tear", x + side * ORB_RADIUS * 0.34, y + ORB_RADIUS * 0.1, side * 0.05, 0.05, t, 1.2, 0.28, 1.2);
    }
    if (mood === "scared" && this.every("scared", 0.45)) {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.emotes.float("sweat", x + side * ORB_RADIUS * 0.8, y - ORB_RADIUS * 0.4, side * 0.35, -0.2, t, 0.7, 0.3, 1.5);
    }
    if (this.asleep && Math.random() < dt * 0.7) this.emotes.float("z", x + ORB_RADIUS * 0.8, y - ORB_RADIUS * 0.9, 0.06, -0.12, t, 2.4, 0.4);

    // Tricks have their own flourishes.
    const trickNow = this.trick && trickAge(this.trick, this.simNow()) !== undefined ? this.trick.kind : undefined;
    if (trickNow === "dance" && this.every("note", 0.35)) this.emotes.float("note", x + rand(-0.06, 0.06), y - 0.08, rand(-0.2, 0.2), -0.35, t, 1.3, 0.45);
    if (trickNow === "heart" && !reduced) {
      // Wisp draws the heart in light as it flies.
      for (let i = 0; i < 2; i++) this.particles.emit(x + rand(-0.01, 0.01), y + rand(-0.01, 0.01), 0, 0, 2.6, rand(1.4, 2.4), PINK);
    }

    // Being petted (pointer resting on Wisp).
    const petted = this.petSince > 0 && t - this.petSince > 0.6 && !this.holding;
    if (petted && !this.asleep && this.every("pet", 0.7)) {
      this.emotes.float("heart", x + rand(-0.05, 0.05), y - 0.07, rand(-0.08, 0.08), -0.2, t, 1.1, 0.26);
      if (Math.random() < 0.12) this.speak(pick(["hehe~", "♡", "mmm~"]), 1.1);
    }

    // Where Wisp looks.
    const me = this.wispPx();
    let gx: number;
    let gy: number;
    let reach = 60;
    if (this.mote) {
      const mp = this.motePoint();
      gx = mp.x - me.x;
      gy = mp.y - me.y;
    } else if (this.pointer.inside && !this.asleep) {
      const [px, py] = toScreen(this.cam, this.pointer.x, this.pointer.y);
      gx = px - me.x;
      gy = py - me.y;
      reach = this.cam.s * 0.48;
    } else if (this.mood === "shy") {
      gx = -1;
      gy = 0.8;
      reach = 1;
    } else {
      const speed = Math.hypot(this.body.vx, this.body.vy);
      if (speed > 0.6) {
        const [vx, vy] = toScreen({ ...this.cam, x: 0, y: 0 }, this.body.vx, this.body.vy);
        gx = vx;
        gy = vy;
        reach = this.cam.s * 1.2;
      } else {
        // Idly looking around.
        if (!this.lookAt || t > this.lookAt.until) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.random() < 0.3 ? 0 : 1;
          this.lookAt = { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.7, until: t + 1.5 + Math.random() * 2.5 };
        }
        gx = this.lookAt.x;
        gy = this.lookAt.y;
        reach = 1;
      }
    }
    const gl = Math.hypot(gx, gy) || 1;
    const gm = Math.min(1, gl / reach);
    this.gaze.x += ((gx / gl) * gm - this.gaze.x) * Math.min(1, dt * 8);
    this.gaze.y += ((gy / gl) * gm - this.gaze.y) * Math.min(1, dt * 8);

    // Color follows the mood (or the trick), warming toward white as the wall strains.
    let tintTarget: RGB = this.mood ? TINTS[this.mood] : trickNow ? TINTS[TRICK_MOOD[trickNow]] : this.asleep ? TINTS.sleepy : CALM;
    if (!this.mood && trickNow) tintTarget = [(tintTarget[0] + CALM[0]) / 2, (tintTarget[1] + CALM[1]) / 2, (tintTarget[2] + CALM[2]) / 2];
    if (strain > 0) tintTarget = [tintTarget[0] + (255 - tintTarget[0]) * strain * 0.6, tintTarget[1] + (255 - tintTarget[1]) * strain * 0.6, tintTarget[2] + (255 - tintTarget[2]) * strain * 0.6];
    const k = Math.min(1, dt * 4);
    this.tint = [this.tint[0] + (tintTarget[0] - this.tint[0]) * k, this.tint[1] + (tintTarget[1] - this.tint[1]) * k, this.tint[2] + (tintTarget[2] - this.tint[2]) * k];

    this.wobble *= Math.exp(-3 * dt);
    this.squash *= Math.exp(-7 * dt);
    this.shake *= Math.exp(-6 * dt);
    const decay = Math.exp(-10 * dt);
    this.renderOffset.x *= decay;
    this.renderOffset.y *= decay;

    // Trail
    if (t > 1.1) {
      const speed = Math.hypot(this.body.vx, this.body.vy);
      let n = ((reduced ? 4 : 16) + speed * 250 * (reduced ? 0.01 : 0.05)) * dt;
      const ox = this.body.x + this.renderOffset.x;
      const oy = this.body.y + this.renderOffset.y;
      const trailColor: RGB = this.tint;
      while (n > 0) {
        if (Math.random() < n) {
          const a = Math.random() * Math.PI * 2;
          const o = ORB_RADIUS * 0.6 * Math.random();
          this.particles.emit(
            ox + Math.cos(a) * o,
            oy + Math.sin(a) * o,
            -this.body.vx * 0.12 + rand(-20, 20) * PX,
            -this.body.vy * 0.12 + rand(-20, 20) * PX,
            0.6 + Math.random() * 0.9,
            0.8 + Math.random() * 1.8,
            Math.random() < 0.25 ? VIOLET : trailColor,
          );
        }
        n -= 1;
      }
    }
  }

  private motePoint(): { x: number; y: number } {
    const m = this.mote!;
    const target = this.wispPx();
    const k = easeInOut((this.t - m.born) / Math.max(0.01, m.arrive - m.born));
    // A swooping curve from the message card down to Wisp.
    const cx = (m.x + target.x) / 2 + (target.y - m.y) * 0.35;
    const cy = (m.y + target.y) / 2 - Math.abs(target.x - m.x) * 0.2;
    const u = 1 - k;
    return { x: u * u * m.x + 2 * u * k * cx + k * k * target.x, y: u * u * m.y + 2 * u * k * cy + k * k * target.y };
  }

  private face(trickNow: TrickKind | undefined, strain: number): Face {
    const t = this.t;
    const speed = Math.hypot(this.body.vx, this.body.vy);
    if (this.asleep) {
      if (t < this.yawnUntil) return { eyes: "sleepy", mouth: "yawn", brows: "none", blush: 0 };
      return { eyes: "closed", mouth: "cat", brows: "none", blush: 0.2 };
    }
    if (t < this.yawnUntil) return { eyes: "sleepy", mouth: "yawn", brows: "none", blush: 0 };
    if (t < this.bonkUntil) return { eyes: "bonk", mouth: "wavy", brows: "none", blush: 0 };
    if (t < this.dizzyUntil) return { eyes: "dizzy", mouth: "wavy", brows: "none", blush: 0 };
    if (this.holding || this.holder) {
      if (strain > 0.12) return { eyes: "strain", mouth: "grit", brows: "sad", blush: 0.2 };
      if (t < this.surprisedUntil) return { eyes: "wide", mouth: "o", brows: "none", blush: 0 };
      if (speed > 2.6) return { eyes: "happy", mouth: "open", brows: "none", blush: 0.3 };
      return { eyes: "happy", mouth: "smile", brows: "none", blush: 0.45 };
    }
    if (this.mood) return MOOD_FACE[this.mood];
    if (this.pending) return { eyes: "wide", mouth: "o", brows: "raised", blush: 0 };
    if (t < this.surprisedUntil) return { eyes: "wide", mouth: "o", brows: "none", blush: 0 };
    if (t < this.giggleUntil) return { eyes: "happy", mouth: "open", brows: "none", blush: 0.5 };
    if (trickNow) return MOOD_FACE[TRICK_MOOD[trickNow]];
    if (speed > 3) return { eyes: "happy", mouth: "open", brows: "none", blush: 0.3 };
    if (this.petSince > 0 && t - this.petSince > 0.6) return { eyes: "happy", mouth: "cat", brows: "none", blush: 0.7 };
    if (this.open) return { eyes: "open", mouth: "grin", brows: "none", blush: 0.25 };
    return { eyes: "open", mouth: "smile", brows: "none", blush: 0.15 };
  }

  private computeLook(): Look {
    const t = this.t;
    const strain = this.shownStrain();
    const trickNow = this.trick && trickAge(this.trick, this.simNow()) !== undefined ? this.trick : undefined;
    const face = this.face(trickNow?.kind, strain);
    const intro = reduced ? 1 : easeOut((t - 0.75) / 0.6);
    let { x, y } = this.wispPx();
    const [svx, svy] = toScreen({ ...this.cam, x: 0, y: 0 }, this.body.vx, this.body.vy);
    const speedPx = Math.hypot(svx, svy);
    const pulse = 1 + 0.04 * Math.sin(t * 2.4) + 0.05 * this.wobble * Math.sin(t * 28);
    const r = ORB_RADIUS * this.cam.s * intro * pulse;

    // Shivers and strain shakes move the whole of Wisp a little.
    const jitter = (this.mood === "scared" ? 1.5 : 0) + strain * 2.2;
    if (jitter > 0 && !reduced) {
      x += rand(-jitter, jitter);
      y += rand(-jitter, jitter);
    }

    let tilt = Math.max(-0.35, Math.min(0.35, (svx / Math.max(1, this.cam.s)) * 0.08));
    if (this.mood === "curious" || this.pending) tilt += 0.22;
    if (face.eyes === "laugh") tilt += Math.sin(t * 22) * 0.12;
    if (this.mood === "shy") tilt -= 0.15;
    if (trickNow?.kind === "spin") {
      const u = (this.simNow() - trickNow.start) / TRICKS.spin;
      tilt += (trickNow.dir < 0 ? -1 : 1) * Math.PI * 2 * 3 * (u * u * (3 - 2 * u));
    }
    if (trickNow?.kind === "wiggle" || trickNow?.kind === "dance") tilt += Math.sin(t * 16) * 0.18;

    let scaleX = 1;
    let scaleY = 1;
    if (this.mood === "grumpy") scaleX = scaleY = 1.1 + 0.03 * Math.sin(t * 6);
    if (t < this.stretchUntil) {
      const k = 1 - (this.stretchUntil - t) / 0.6;
      const s = Math.sin(k * Math.PI) * 0.18;
      scaleX = 1 - s * 0.5;
      scaleY = 1 + s;
    }
    if (this.asleep) {
      const breathe = Math.sin(t * 1.8) * 0.03;
      scaleX *= 1 + breathe;
      scaleY *= 1 - breathe;
    }

    const glow = (this.asleep ? 0.7 : 1) * (1 + strain * 0.7) * (this.mood === "excited" || this.mood === "love" ? 1.25 : 1);
    return {
      x,
      y,
      r,
      tilt,
      stretch: 1 + Math.min(0.28, speedPx / 2600),
      stretchAngle: Math.atan2(svy, svx),
      squash: this.squash,
      squashAngle: this.squashAngle,
      scaleX,
      scaleY,
      tint: this.tint,
      glow,
      eyes: face.eyes,
      mouth: face.mouth,
      brows: face.brows,
      blush: face.blush,
      gaze: this.gaze,
      blink: t < this.blinkUntil,
    };
  }

  private updateStatus(): void {
    const t = this.t;
    const speed = Math.hypot(this.body.vx, this.body.vy);
    const strain = this.shownStrain();
    const trickNow = this.trick && trickAge(this.trick, this.simNow()) !== undefined ? this.trick.kind : undefined;
    let s = "drifting";
    if (t < 1.2) s = "summoning…";
    else if (t < this.noticeUntil) s = this.notice;
    else if (t < this.bonkUntil) s = "bonk!";
    else if (t < this.dizzyUntil) s = "dizzy…";
    else if (this.holding) s = strain > 0.15 ? "the wall is cracking…" : "held by you";
    else if (this.holder) s = strain > 0.15 ? `${this.holder.nickname} is cracking the wall…` : `held by ${this.holder.nickname}`;
    else if (this.pending) s = "listening…";
    else if (this.mood) s = MOOD_STATUS[this.mood];
    else if (this.asleep) s = "dozing";
    else if (t < this.giggleUntil) s = "giggling";
    else if (trickNow) s = TRICK_STATUS[trickNow];
    else if (speed > 2.6) s = "wheee!";
    else if (this.petSince > 0 && t - this.petSince > 0.6) s = "being petted";
    else if (this.open) s = "roaming free";
    if (s !== this.lastStatus) {
      this.ui.status.textContent = s;
      this.lastStatus = s;
    }
  }

  // ---- Drawing ----------------------------------------------------------------------

  private draw(dt: number): void {
    const ctx = this.ctx;
    const { W, H, t } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const sx = this.shake > 0.01 ? (Math.random() - 0.5) * 9 * this.shake : 0;
    const sy = this.shake > 0.01 ? (Math.random() - 0.5) * 9 * this.shake : 0;
    ctx.save();
    ctx.translate(sx, sy);

    const strain = this.shownStrain();
    const tweenK = this.camFrom ? easeInOut((t - this.camTweenStart) / 0.9) : 1;
    const opening = reduced ? 1 : Math.min(1, t / 0.9);
    const wallR = this.cam.s * (0.6 + 0.4 * easeOut(opening));

    if (this.layoutOpen) this.drawArena(tweenK);
    else this.drawBubble(wallR, this.camFrom ? tweenK : easeOut(opening), strain);

    const look = this.computeLook();
    ctx.save();
    // Wisp's light stays inside its world: everything glowing is clipped to the wall.
    this.clipToWorld(wallR);
    this.particles.draw(ctx, this.cam, dt);
    if (look.r > 0.5) {
      drawHalo(ctx, look);
      this.drawTether(look);
      drawWisp(ctx, look, t);
      if (t < this.dizzyUntil) this.drawDizzyStars(look);
    }
    this.emotes.draw(ctx, this.cam, look, t, dt, this.font);
    ctx.restore();

    if (!this.layoutOpen) {
      this.drawWallGlow(wallR, look, strain);
      drawCracks(ctx, this.cam, this.cracks, strain, t, wallR);
    } else {
      this.drawEdgeGlow(look);
    }
    drawRipples(ctx, this.cam, this.ripples, t, wallR);
    this.drawHolderTag(look);
    if (this.speech && look.r > 0.5) {
      drawSpeech(ctx, this.speech.text, look, t - this.speech.born, this.speech.life, W, H, this.font);
      if (t - this.speech.born > this.speech.life) this.speech = undefined;
    }
    if (this.mote) this.drawMote();
    ctx.restore();
    this.shatter.draw(ctx, W, H, t, dt);
  }

  private clipToWorld(wallR: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    if (this.layoutOpen) {
      const corners = [
        [-OPEN_HALF_W, -OPEN_HALF_H],
        [OPEN_HALF_W, -OPEN_HALF_H],
        [OPEN_HALF_W, OPEN_HALF_H],
        [-OPEN_HALF_W, OPEN_HALF_H],
      ].map(([cx, cy]) => toScreen(this.cam, cx, cy));
      corners.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.closePath();
    } else {
      ctx.arc(this.cam.x, this.cam.y, wallR - 1, 0, Math.PI * 2);
    }
    ctx.clip();
  }

  private drawStars(stars: Star[], alpha: number): void {
    const ctx = this.ctx;
    const t = this.t;
    const turn = reduced ? 0 : t * 0.006;
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    ctx.fillStyle = "#DDE8FF";
    for (const st of stars) {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * st.tw + st.ph));
      const [px, py] = toScreen(this.cam, c * st.x - s * st.y, s * st.x + c * st.y);
      ctx.globalAlpha = alpha * tw * 0.8;
      ctx.beginPath();
      ctx.arc(px, py, st.s * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawAuroras(r: number, alpha: number): void {
    const { ctx, t, cam } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    const auroras: Array<[number, number, string]> = [
      [Math.sin(t * 0.05) * r * 0.45, Math.cos(t * 0.07) * r * 0.35, "rgba(64, 196, 220, 0.16)"],
      [Math.cos(t * 0.04 + 2) * r * 0.5, Math.sin(t * 0.06 + 1) * r * 0.4, "rgba(150, 110, 255, 0.14)"],
    ];
    for (const [ax, ay, col] of auroras) {
      const ag = ctx.createRadialGradient(cam.x + ax, cam.y + ay, 0, cam.x + ax, cam.y + ay, r * 0.7);
      ag.addColorStop(0, col);
      ag.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = ag;
      ctx.fillRect(cam.x - r * 1.5, cam.y - r * 1.5, r * 3, r * 3);
    }
    ctx.restore();
  }

  /** The bubble: night sky inside, a glowing rim that bulges and shivers where it's being pushed. */
  private drawBubble(r: number, alpha: number, strain: number): void {
    const { ctx, cam, t } = this;
    const { x: cx, y: cy } = cam;
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
    this.drawAuroras(r, 1);
    this.drawStars(this.nearStars, alpha);
    ctx.restore();

    // The rim, pushed outward around where Wisp is straining against it.
    const rimPath = () => {
      ctx.beginPath();
      const n = 120;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        let d = a - this.strainAngle;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const bulge = strain * 0.035 * Math.exp(-((d / 0.32) ** 2));
        const quiver = strain > 0.35 && !reduced ? (Math.random() - 0.5) * 0.006 * strain : 0;
        const rr = r * (1 + bulge + quiver);
        const px = cx + Math.cos(a + cam.rot) * rr;
        const py = cy + Math.sin(a + cam.rot) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    };
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(127, 227, 255, 0.10)";
    rimPath();
    ctx.stroke();
    ctx.lineWidth = 1.6 + strain * 1.2;
    ctx.strokeStyle = `rgba(${190 + 65 * strain}, ${230 + 25 * strain}, 255, 0.85)`;
    ctx.shadowColor = "rgba(127, 227, 255, 0.9)";
    ctx.shadowBlur = 16 + strain * 14;
    rimPath();
    ctx.stroke();
    ctx.shadowBlur = 0;
    const ticks = 60;
    const spin = reduced ? 0 : -t * (0.02 + strain * 0.4);
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
    ctx.restore();
  }

  /** The burst world: the same night sky, much bigger, with only a faint edge. */
  private drawArena(alpha: number): void {
    const { ctx, cam } = this;
    const corners = [
      [-OPEN_HALF_W, -OPEN_HALF_H],
      [OPEN_HALF_W, -OPEN_HALF_H],
      [OPEN_HALF_W, OPEN_HALF_H],
      [-OPEN_HALF_W, OPEN_HALF_H],
    ].map(([x, y]) => toScreen(cam, x, y));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    corners.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
    const g = ctx.createRadialGradient(cam.x, cam.y, 0, cam.x, cam.y, cam.s * 2.4);
    g.addColorStop(0, "rgba(27, 40, 80, 0.85)");
    g.addColorStop(1, "rgba(9, 14, 34, 0.35)");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    this.drawAuroras(cam.s * 2, 1);
    this.drawStars(this.nearStars, alpha);
    this.drawStars(this.farStars, alpha);
    ctx.restore();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(127, 227, 255, 0.16)";
    ctx.stroke();
    ctx.restore();
  }

  /** Where Wisp is close, its light pools on the wall instead of passing through it. */
  private drawWallGlow(r: number, look: Look, strain: number): void {
    const bx = this.body.x + this.renderOffset.x;
    const by = this.body.y + this.renderOffset.y;
    const gap = r - Math.hypot(bx, by) * this.cam.s - look.r;
    const near = Math.max(0, 1 - gap / (look.r * 3.5));
    if (near <= 0) return;
    const a = Math.atan2(by, bx) + this.cam.rot;
    const spread = 0.12 + 0.18 * (1 - near) + (look.r / r) * 1.2 + strain * 0.25;
    const { ctx, cam } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 2 + 3 * near + strain * 4;
    ctx.strokeStyle = rgba(this.tint, Math.min(1, 0.75 * near * (this.asleep ? 0.6 : 1) + strain * 0.3));
    ctx.shadowColor = rgba(this.tint, 1);
    ctx.shadowBlur = 14 * near + strain * 20;
    ctx.beginPath();
    ctx.arc(cam.x, cam.y, r, a - spread, a + spread);
    ctx.stroke();
    ctx.restore();
  }

  /** In the open arena, the edge only shows where Wisp comes near it. */
  private drawEdgeGlow(look: Look): void {
    const { ctx, cam } = this;
    const bx = this.body.x + this.renderOffset.x;
    const by = this.body.y + this.renderOffset.y;
    const edges: Array<[number, number, number]> = [
      [1, 0, OPEN_HALF_W - Math.abs(bx)],
      [0, 1, OPEN_HALF_H - Math.abs(by)],
    ];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const [ex, ey, gapUnits] of edges) {
      const gap = gapUnits * cam.s - look.r;
      const near = Math.max(0, 1 - gap / (look.r * 3.5));
      if (near <= 0) continue;
      const sign = ex ? Math.sign(bx) || 1 : Math.sign(by) || 1;
      const wx = ex ? sign * OPEN_HALF_W : bx;
      const wy = ey ? sign * OPEN_HALF_H : by;
      const half = 0.25 + 0.2 * (1 - near);
      const [ax, ay] = toScreen(cam, wx - ey * half, wy - ex * half);
      const [bx2, by2] = toScreen(cam, wx + ey * half, wy + ex * half);
      ctx.lineWidth = 2 + 3 * near;
      ctx.strokeStyle = rgba(this.tint, 0.7 * near);
      ctx.shadowColor = rgba(this.tint, 1);
      ctx.shadowBlur = 14 * near;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx2, by2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A thread of light from Wisp to the hand holding it. */
  private drawTether(look: Look): void {
    const target = this.holdTarget();
    if (!target) return;
    const [tx, ty] = toScreen(this.cam, target.x, target.y);
    const d = Math.hypot(tx - look.x, ty - look.y);
    if (d < look.r * 1.2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.setLineDash([3, 6]);
    ctx.lineDashOffset = -this.t * 30;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(this.tint, 0.55);
    ctx.beginPath();
    ctx.moveTo(look.x, look.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.restore();
  }

  /** Whose hand Wisp is in, when it isn't mine. */
  private drawHolderTag(look: Look): void {
    if (!this.holder || this.holder.userId === this.link.me || !this.remoteTarget || look.r <= 0.5) return;
    const ctx = this.ctx;
    const [tx, ty] = toScreen(this.cam, this.remoteTarget.x, this.remoteTarget.y);
    const label = this.holder.nickname;
    ctx.save();
    ctx.font = `600 12px ${this.font}`;
    const w = ctx.measureText(label).width + 14;
    const x = Math.max(4, Math.min(this.W - w - 4, tx - w / 2));
    const y = Math.max(4, Math.min(this.H - 24, ty + 10));
    ctx.fillStyle = "rgba(14, 20, 38, 0.85)";
    ctx.strokeStyle = rgba(this.tint, 0.6);
    ctx.beginPath();
    ctx.roundRect(x, y, w, 20, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#E7EDFB";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 7, y + 10.5);
    ctx.restore();
  }

  private drawDizzyStars(look: Look): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "#FFD86E";
    for (let i = 0; i < 3; i++) {
      const a = this.t * 5 + (i / 3) * Math.PI * 2;
      const px = look.x + Math.cos(a) * look.r * 1.1;
      const py = look.y - look.r * 1.15 + Math.sin(a) * look.r * 0.3;
      const s = look.r * 0.22;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 === 0 ? s : s * 0.45;
        const aa = (k / 10) * Math.PI * 2 - Math.PI / 2;
        if (k === 0) ctx.moveTo(px + Math.cos(aa) * rr, py + Math.sin(aa) * rr);
        else ctx.lineTo(px + Math.cos(aa) * rr, py + Math.sin(aa) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** The message, as a bright mote flying from the card to Wisp. */
  private drawMote(): void {
    const ctx = this.ctx;
    const p = this.motePoint();
    if (!reduced && Math.random() < 0.8) {
      const w = toWorld(this.cam, p.x, p.y);
      this.particles.emit(w.x, w.y, rand(-30, 30) * PX, rand(-30, 30) * PX, 0.5, rand(0.8, 1.6), Math.random() < 0.5 ? WHITE : CYAN);
    }
    const size = 16 + 4 * Math.sin(this.t * 20);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(glowSprite(WHITE), p.x - size, p.y - size, size * 2, size * 2);
    ctx.drawImage(glowSprite(CYAN), p.x - size * 1.6, p.y - size * 1.6, size * 3.2, size * 3.2);
    ctx.restore();
  }
}
