// The domain window: everyone who opens it gets their own Blitz, which lives
// entirely here. It draws Blitz and its world, turns pointer input into
// grabs, throws and pokes, runs Blitz's life (naps, tricks, the bursting
// bubble), and decides how Blitz looks and feels from moment to moment. The
// only thing it asks anyone else is a thought, when someone types to Blitz.
//
// Physics runs in domain units (the bubble's radius is 1) through
// @blitz/shared. Everything visual (the universe, faces, emotes, particles,
// ripples, cracks, the shatter) is decoration on top. Inside the bubble the
// camera holds still; once the bubble bursts it follows Blitz through open
// space.

import {
  BURST_COAST,
  Body,
  FLING_COAST,
  FLING_SPEED,
  Impact,
  Mood,
  OPEN_FOR,
  ORB_RADIUS,
  Point,
  Reaction,
  Rock,
  SLEEP_AFTER,
  STEP,
  Situation,
  TRICKS,
  Trick,
  TrickKind,
  burstLaunch,
  clampTarget,
  hash32,
  idleTrick,
  isBursting,
  isSplash,
  landingPoint,
  plainText,
  pokeImpulse,
  readMessage,
  rocksNear,
  sanitize,
  step,
  trickAge,
  unit,
  wallPush,
} from "@blitz/shared";
import { ChromeRects, chromeBurst, chromeReform, measureChrome } from "./chrome";
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
  drawThought,
  easeInOut,
  easeOut,
  glowStamp,
  makeCrack,
  mixCam,
  rand,
  rgba,
  stampAt,
  toScreen,
  toWorld,
} from "./fx";
import { STILL_PARTS, Universe, UniverseView, finishPainting } from "./universe";
import { RockArt, SUN, drawRockArt, makeRockArt } from "./rockart";
import { Brows, Eyes, Look, Mouth, drawBlitz, drawHalo } from "./blitz";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const now = () => performance.now() / 1000;
const pick = <T>(list: readonly T[]): T => list[(Math.random() * list.length) | 0];
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
/** Runs `work` when the browser has a moment between frames (or, where it can't say, a little later with a few ms to use). */
const whenIdle: (work: (deadline: IdleDeadline) => void) => void =
  typeof requestIdleCallback === "function"
    ? (work) => requestIdleCallback(work)
    : (work) =>
        setTimeout(() => {
          const start = performance.now();
          work({ didTimeout: false, timeRemaining: () => Math.max(0, 5 - (performance.now() - start)) });
        }, 50);

/** Particle speeds were tuned in pixels on a 250px domain; this turns them into domain units. */
const PX = 1 / 250;

const CYAN: RGB = [150, 235, 255];
const VIOLET: RGB = [200, 168, 255];
const GOLD: RGB = [255, 214, 120];
const PINK: RGB = [255, 140, 200];
const WHITE: RGB = [255, 255, 255];
const DUST: RGB = [176, 186, 210];

const CALM: RGB = [127, 227, 255];

/** "#ff8fc7" -> [255, 143, 199]. */
function hexRgb(hex: string): RGB {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const TRAIL_COLORS: Record<string, RGB[]> = {
  bubbles: [[191, 239, 255], [230, 250, 255]],
  ember: [[255, 154, 74], [255, 210, 110], [255, 100, 60]],
  frost: [[159, 232, 255], [235, 250, 255], [190, 210, 255]],
  hearts: [[255, 127, 180], [255, 180, 210]],
};

/** A trail particle's colour; the rainbow one shifts through the hues as it goes. */
function trailColor(trail: string, t: number): RGB {
  if (trail === "rainbow") {
    const hue = (t * 120 + Math.random() * 40) % 360;
    const f = (n: number) => {
      const k = (n + hue / 60) % 6;
      return Math.round(255 * (1 - 0.55 * Math.max(0, Math.min(k, 4 - k, 1))));
    };
    return [f(5), f(3), f(1)];
  }
  const list = TRAIL_COLORS[trail] ?? TRAIL_COLORS.frost;
  return list[Math.floor(Math.random() * list.length)];
}
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

/** How Blitz feels while doing a trick on its own. */
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

/** Room left for the floating bar on top and the message box below, once the domain fills the window. */
const HUD_TOP = 64;
const HUD_BOTTOM = 84;
/** How the burst plays out: the universe opens in `REVEAL` s while the camera swings over in `BURST_CAM` s. */
const REVEAL = 1.4;
const BURST_CAM = 1.4;
/** The universe folds back into the bubble over this long. */
const GATHER = 0.95;
/** The sharpest the full-window universe draws (the bubble goes up to 2x): a softer screen keeps it smooth. */
const OPEN_DPR = 1.25;

/** Frames slower than this on average (about 45 fps) make the domain draw a little softer; faster than SMOOTH lets it sharpen again. */
const SLOW_FRAME_MS = 22;
const SMOOTH_FRAME_MS = 18;
const MIN_QUALITY = 0.45;

/** The bubble glass's darkness at its middle, 70% out, and its rim. */
const GLASS = [0.35, 0.45, 0.8] as const;

/** How dark the glass is `d` of the way out from its middle (0 to 1). */
function glassAt(d: number): number {
  if (d <= 0.7) return GLASS[0] + (GLASS[1] - GLASS[0]) * (d / 0.7);
  return GLASS[1] + (GLASS[2] - GLASS[1]) * Math.min(1, (d - 0.7) / 0.3);
}

/** How long a typed message takes to fly over to Blitz, in seconds. */
const MESSAGE_FLIGHT = 0.7;

/** The first moments after the burst play in slow motion. */
const SLOW_MO = 0.35;
/** How far Blitz's light reaches across open space, in domain units. */
const LIGHT_REACH = 3.2;

export interface DomainUi {
  status: HTMLElement;
  /** The darkened edges of open space, laid over the canvas (the browser draws it, for free). */
  vignette: HTMLElement;
  card: HTMLElement;
  cardName: HTMLElement;
  cardWhere: HTMLElement;
  cardText: HTMLElement;
}

/** A way to ask Claude how Blitz reacts to something typed to it (Blitz's server inside Root; the prototype's viewer outside). */
export type Brain = (situation: Situation) => Promise<Reaction | undefined>;

/** A painted copy of open space's drifting layers (see drawOpenUniverse). */
interface StillCopy {
  canvas: HTMLCanvasElement;
  /** What it shows (Universe.stillKey) and where the camera was (Universe.camKey). */
  key: string;
  cam: string;
  /** While it's being painted: the next step (see OPEN_STEPS), and whether the deep sky was all there. */
  step: number;
  complete: boolean;
}

/** Open space's copy is painted in these steps of drawStill's layers, a step per frame: deep sky, near stars, far stars and planet. The distant rocks are drawn live. */
const OPEN_STEPS: ReadonlyArray<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, STILL_PARTS - 1],
];

/** A canvas that's painted edge to edge: opaque, which makes copying it quicker. */
function opaqueCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.getContext("2d", { alpha: false });
  return c;
}

interface Transition {
  kind: "burst" | "reform";
  start: number;
  /** The camera at the start, in viewport pixels. */
  from: Cam;
  /** Reform only: where the bubble will be, in viewport pixels. */
  to?: Cam;
  /** The window around the domain before the change, for its own animation. */
  chrome?: ChromeRects;
}

export class DomainView {
  /** Called when the bubble bursts (with the press that burst it, for fullscreen) or re-forms. */
  onOpenChange: ((open: boolean) => void) | undefined;
  /** Called before the universe folds back into the bubble (to leave fullscreen first). */
  beforeReform: (() => Promise<void>) | undefined;
  /** Asked how Blitz reacts to what's typed in; without one (or when it has no answer) Blitz reads the mood from keywords. */
  brain: Brain | undefined;

  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private rectLeft = 0;
  private rectTop = 0;
  private cam: Cam = { x: 0, y: 0, s: 100, fx: 0, fy: 0 };
  private follow = { fx: 0, fy: 0, s: 0 };
  private layoutOpen = false;
  private trans: Transition | undefined;
  private reforming = false;
  private font: string;
  private universe = new Universe(reduced);

  // Blitz (domain units, seconds on the page's clock)
  private body: Body = { x: 0, y: 0, vx: 0, vy: 0, strain: 0 };
  private simulatedUntil = 0;
  private asleep = false;
  private open = false;
  private anchor: Point = { x: 0, y: 0 };
  private flingUntil = 0;
  private trick: Trick | undefined;
  private lastInteraction = 0;
  private nextIdleTrick = 0;

  // Me
  private pointer = { x: 0, y: 0, cx: 0, cy: 0, inside: false, down: false, dragging: false, downAt: 0, downX: 0, downY: 0 };
  private samples: Array<{ x: number; y: number; at: number }> = [];
  private holding = false;
  private notice = "";
  private noticeUntil = 0;
  /** Recent exchanges with Blitz, for a brain that doesn't keep its own. */
  private talk: Array<{ from: string; text: string; blitz: string }> = [];

  // Looks
  private t = 0;
  /** Effects time: runs slower for a moment after the burst. */
  private fxT = 0;
  private slowUntil = -1;
  private gaze = { x: 0, y: 0 };
  private lookAt: { x: number; y: number; until: number } | undefined;
  private blinkUntil = 0;
  private nextBlink = 2;
  private outfit: { hat?: string; trail?: string; glow?: RGB } = {};
  private shieldUp = false;
  private mood: Mood | undefined;
  private moodUntil = 0;
  private pending: { mood: Mood; say: string; at: number } | undefined;
  private thinking: { id: string; since: number; landsAt: number } | undefined;
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
  private faceKey = "";
  private facePopAt = -1;
  private tint: RGB = [...CALM];
  private renderOffset = { x: 0, y: 0 };
  /** A long glide of Blitz's drawn position (the re-seal), instead of the usual quick catch-up. */
  private glide: { x: number; y: number; start: number; dur: number } | undefined;
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
  private rockArts = new Map<number, RockArt>();
  /** Open space's drifting layers: the copy on screen, the next one being painted, and the camera last frame (see drawOpenUniverse). */
  private openStill: { front?: StillCopy; back?: StillCopy; lastCam: string } = { lastCam: "" };
  /** The bubble's drifting layers and glass (`plain`), and the same with the rim (`rimmed`), painted once and reused (see drawBubble). */
  private bubbleStill: { plain: HTMLCanvasElement; rimmed: HTMLCanvasElement; key: string; left: number; top: number } | undefined;
  private vignetteShown = -1;
  private bubbleShape = "";
  private rockHits = new Map<number, { born: number; power: number; x: number; y: number }>();
  /** A screen point Blitz is watching for a moment (a shooting star). */
  private watch: { x: number; y: number; until: number } | undefined;
  /** Where Blitz floats while showing the menu it summoned out in open space (world units), if it is. */
  private dreamHold: Point | undefined;
  private lastStatus = "";
  private cardTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private canvas: HTMLCanvasElement,
    private ui: DomainUi,
    brain?: Brain,
  ) {
    this.brain = brain;
    this.ctx = canvas.getContext("2d")!;
    this.font = getComputedStyle(document.body).fontFamily;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    this.bindInput();
    this.universe.onShootingStar = (x, y) => this.noticeShootingStar(x, y);
    this.simulatedUntil = now();
    this.lastInteraction = now();
    this.nextIdleTrick = now() + 6;
  }

  start(): void {
    this.summonMotes();
    requestAnimationFrame((ms) => this.frame(ms));
  }

  private forces(target: Point | undefined) {
    return { target, asleep: this.asleep, flingUntil: this.flingUntil, trick: this.trick, open: this.open, anchor: this.anchor, still: this.dreamHold !== undefined };
  }

  private launchMote(delay: number): void {
    const rect = this.ui.card.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    this.mote = { x: rect.left + rect.width / 2 - canvasRect.left, y: rect.bottom - canvasRect.top, born: this.t, arrive: this.t + delay };
  }

  private showCard(name: string, where: string, text: string): void {
    const { card, cardName, cardWhere, cardText } = this.ui;
    cardName.textContent = name;
    cardWhere.textContent = where;
    cardText.textContent = text;
    card.hidden = false;
    card.classList.remove("show", "hold");
    void card.offsetWidth; // restart the animation
    card.classList.add("show");
    this.keepCard(6);
  }

  /** Keeps the message card up for another `seconds`. */
  private keepCard(seconds: number): void {
    const { card } = this.ui;
    if (this.cardTimer) clearTimeout(this.cardTimer);
    card.classList.add("hold");
    this.cardTimer = setTimeout(() => {
      card.classList.remove("hold");
      card.classList.add("leaving");
      this.cardTimer = setTimeout(() => {
        card.classList.remove("show", "leaving");
        card.hidden = true;
      }, 450);
    }, seconds * 1000);
  }

  // ---- Talking to Blitz, sealing the bubble -------------------------------------

  /** Something typed into the domain's message box: it flies over to Blitz, who thinks it over and reacts. */
  async say(text: string): Promise<void> {
    const clean = text.replace(/\s+/g, " ").trim().slice(0, 160);
    if (!clean) return;
    this.showCard("You", "to Blitz", clean);
    const landsAt = this.t + MESSAGE_FLIGHT;
    this.launchMote(MESSAGE_FLIGHT);
    this.pending = undefined;
    let reaction: Reaction | undefined;
    if (this.brain) {
      const id = `${Date.now()}`;
      this.thinking = { id, since: this.t, landsAt };
      this.keepCard(30); // up for as long as Blitz ponders
      reaction = await this.brain({ from: "you", text: clean, channel: "", chat: [], memory: this.talk, asleep: this.asleep, open: this.open }).catch(() => undefined);
      if (this.thinking?.id !== id) return; // a newer message took over
      this.thinking = undefined;
      this.keepCard(4.5);
      if (reaction) {
        this.talk.push({ from: "you", text: clean, blitz: reaction.say });
        if (this.talk.length > 6) this.talk.shift();
      }
    }
    reaction ??= readMessage(clean);
    this.pending = { mood: reaction.mood, say: reaction.say, at: Math.max(this.t + 0.12, landsAt) };
    if (reaction.mood === "sleepy") {
      // Blitz yawns and dozes off where it is.
      this.asleep = true;
      this.trick = undefined;
      return;
    }
    this.wake();
    if (!this.holding && reaction.trick) this.startTrick(reaction.trick, this.pending.at - this.t);
  }

  /** Puts the bubble back together. */
  seal(): void {
    if (!this.open || this.reforming) return;
    const before = { x: this.body.x, y: this.body.y };
    this.open = false;
    this.anchor = { x: 0, y: 0 };
    this.trick = undefined;
    const inside = sanitize(this.body);
    this.body = { x: inside.x, y: inside.y, vx: inside.vx * 0.3, vy: inside.vy * 0.3, strain: 0 };
    this.glideFrom(before);
    void this.startReform();
  }

  get isOpen(): boolean {
    return this.open;
  }

  // ---- The menu Blitz summons out in open space (see menu/dream.ts) ------------------

  /** Where Blitz is drawn, in CSS pixels within the domain, and its radius. */
  blitzAt(): { x: number; y: number; r: number } {
    return { ...this.blitzPx(), r: ORB_RADIUS * this.cam.s };
  }

  /** The domain's size, and the open space between the floating bar (top) and the message box (bottom). */
  stageBox(): { w: number; h: number; top: number; bottom: number } {
    return { w: this.W, h: this.H, top: HUD_TOP, bottom: this.H - HUD_BOTTOM };
  }

  /** What this person's Blitz wears (bought with Stardust in the menu). */
  setOutfit(outfit: { hat?: string; trail?: string; glow?: string }): void {
    this.outfit = {
      hat: outfit.hat || undefined,
      trail: outfit.trail || undefined,
      glow: outfit.glow ? hexRgb(outfit.glow) : undefined,
    };
  }

  /** A shield is up in the community (a raid, or everything locked): Blitz stands guard. */
  setShield(on: boolean): void {
    this.shieldUp = on;
  }

  /**
   * Blitz floats over to a point on screen and stays there, looking at
   * `look`, until let go (no point). The camera holds still meanwhile.
   */
  hold(at?: { x: number; y: number }, look?: { x: number; y: number }): void {
    if (!at) {
      this.dreamHold = undefined;
      this.watch = undefined;
      return;
    }
    const p = toWorld(this.cam, at.x, at.y);
    this.dreamHold = p;
    this.anchor = p;
    this.trick = undefined;
    this.flingUntil = 0;
    // A push toward it, so Blitz goes there with purpose rather than drifting.
    const dx = p.x - this.body.x;
    const dy = p.y - this.body.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.05) {
      const v = Math.min(3, d * 1.3);
      this.body.vx = (dx / d) * v;
      this.body.vy = (dy / d) * v;
    }
    this.watch = look ? { x: look.x, y: look.y, until: Infinity } : undefined;
    this.wake();
  }

  /** The summoning: Blitz lights up, light rings out, and sparks trail out to each of `points` (where the menu appears). */
  summonFx(points: Array<{ x: number; y: number }>, say: string): void {
    const b = this.drawnBody();
    const t = this.fxT;
    this.applyMood("excited", say, 2.6);
    const [bx, by] = toScreen(this.cam, b.x, b.y);
    if (!reduced) this.shatter.ring(bx, by, t);
    for (const pt of points) {
      const w = toWorld(this.cam, pt.x, pt.y);
      for (let i = 0; i < (reduced ? 2 : 8); i++) {
        const k = (i + Math.random()) / 8;
        // Along a gentle curve out to the point.
        const bend = Math.sin(k * Math.PI) * 0.25;
        const x = b.x + (w.x - b.x) * k - (w.y - b.y) * bend;
        const y = b.y + (w.y - b.y) * k + (w.x - b.x) * bend;
        this.particles.emit(x, y, rand(-25, 25) * PX, rand(-25, 25) * PX, rand(0.5, 1.2), rand(1, 2.6), pick([CYAN, VIOLET, WHITE, GOLD]));
      }
    }
  }

  /** The menu fading away: motes of it drift back into Blitz from around `from`, and Blitz says goodbye to it. */
  dismissFx(from: { x: number; y: number }, spread: number, say: string): void {
    if (!this.speech) this.speak(say, 1.4);
    const b = this.drawnBody();
    for (let i = 0; i < (reduced ? 6 : 36); i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * spread;
      const w = toWorld(this.cam, from.x + Math.cos(a) * d, from.y + Math.sin(a) * d * 0.7);
      // Fast enough to reach Blitz before they fade (particles slow down as they go).
      this.particles.emit(w.x, w.y, (b.x - w.x) * 1.5, (b.y - w.y) * 1.5, rand(0.7, 1), rand(1, 2.4), pick([CYAN, VIOLET, WHITE]));
    }
    this.wobble = 1;
  }

  /** Blitz reacts to something picked in the menu: says (the start of) its reply, pleased or puzzled. */
  react(text: string, ok: boolean): void {
    // The first line, and the next too when the first is only a heading (like the 8-ball's question before its answer).
    const lines = plainText(text).split("\n").map((l) => l.trim()).filter(Boolean);
    const line = lines[0] && lines[0].length < 40 && lines[1] ? `${lines[0]} ${lines[1]}` : lines[0] ?? "";
    const short = line.length > 80 ? `${line.slice(0, 77).trimEnd()}…` : line;
    this.wake();
    this.applyMood(ok ? pick(["happy", "excited"] as const) : "curious", short, 3);
  }

  // ---- Input ------------------------------------------------------------------

  private toDomain(clientX: number, clientY: number): Point {
    return toWorld(this.cam, clientX - this.rectLeft, clientY - this.rectTop);
  }

  private overBlitz(p: Point): boolean {
    return this.t > 1.1 && Math.hypot(p.x - this.body.x, p.y - this.body.y) < ORB_RADIUS * 1.8;
  }

  private insideArena(p: Point): boolean {
    return this.open || Math.hypot(p.x, p.y) < 1.15;
  }

  private wake(): void {
    this.lastInteraction = now();
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
      const p = this.toDomain(e.clientX, e.clientY);
      Object.assign(this.pointer, p, { cx: e.clientX, cy: e.clientY, inside: true });
      if (!this.overBlitz(p) || this.trans) return;
      this.wake();
      c.setPointerCapture(e.pointerId);
      Object.assign(this.pointer, { down: true, dragging: false, downAt: performance.now(), downX: p.x, downY: p.y });
      this.samples = [{ ...p, at: performance.now() }];
    });

    c.addEventListener("pointermove", (e) => {
      const p = this.toDomain(e.clientX, e.clientY);
      Object.assign(this.pointer, p, { cx: e.clientX, cy: e.clientY });
      this.pointer.inside = this.insideArena(p);
      if (this.pointer.inside && !this.asleep) this.lastInteraction = now();
      if (this.pointer.down) {
        if (!this.pointer.dragging && Math.hypot(p.x - this.pointer.downX, p.y - this.pointer.downY) * this.cam.s > 6) this.startHold();
        const at = performance.now();
        this.samples.push({ ...p, at });
        while (this.samples.length > 2 && at - this.samples[0].at > 90) this.samples.shift();
      }
      const over = this.overBlitz(p);
      if (over && !this.pointer.down) {
        if (!this.petSince) this.petSince = this.t;
      } else this.petSince = 0;
      c.style.cursor = this.pointer.dragging ? "grabbing" : over ? "grab" : "default";
    });

    const release = () => {
      if (!this.pointer.down) return;
      const quick = performance.now() - this.pointer.downAt < 240;
      if (this.holding) this.throwBlitz();
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
    this.trick = undefined;
    this.reactGrab();
  }

  /** Lets go without throwing (the bubble burst out of my hand). */
  private dropHold(): void {
    this.holding = false;
    this.pointer.dragging = false;
    this.pointer.down = false;
    this.canvas.style.cursor = "default";
  }

  private throwBlitz(): void {
    const s = this.samples;
    const a = s[0];
    const b = s[s.length - 1];
    const dt = Math.max(0.016, (b.at - a.at) / 1000);
    const strain = this.body.strain ?? 0;
    this.body = { ...sanitize({ x: this.body.x, y: this.body.y, vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt }, this.open), strain };
    const fast = Math.hypot(this.body.vx, this.body.vy) > FLING_SPEED;
    if (fast) this.flingUntil = now() + FLING_COAST;
    // Out in open space Blitz settles wherever it's flung.
    if (this.open) this.anchor = landingPoint(this.body);
    this.holding = false;
    if (fast) this.reactFling();
  }

  private poke(angle: number, smile = true): void {
    if (this.holding) return;
    this.wake();
    this.trick = undefined;
    const push = pokeImpulse(angle);
    this.body.vx += push.vx;
    this.body.vy += push.vy;
    if (smile) this.giggle();
  }

  // ---- Reactions to what happens ----------------------------------------------------

  private drawnBody(): Point {
    return { x: this.body.x + this.renderOffset.x, y: this.body.y + this.renderOffset.y };
  }

  private blitzPx(): Point {
    const b = this.drawnBody();
    const [x, y] = toScreen(this.cam, b.x, b.y);
    return { x, y };
  }

  private speak(text: string, life = 1.8 + Math.min(6, text.length * 0.06)): void {
    this.speech = { text, born: this.t, life };
  }

  private applyMood(mood: Mood, say: string, seconds = 4.2): void {
    this.mood = mood;
    this.moodUntil = this.t + seconds;
    this.emotes.clearAttached();
    if (say) this.speak(say);
    const { x, y } = this.body;
    const t = this.fxT;
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
        this.yawnUntil = this.t + 1.4;
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
    this.emotes.attach("bang", 0.95, -1.15, this.fxT, 0.6, 0.55);
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
    this.emotes.attach("bang", 0.95, -1.15, this.fxT, 0.7, 0.5);
    this.particles.burst(this.body.x, this.body.y, reduced ? 4 : 10, 120 * PX, [CYAN, WHITE]);
  }

  private impact(hit: Impact): void {
    if (this.t - this.lastImpact < 0.12) return;
    this.lastImpact = this.t;
    const { nx, ny, speed } = hit;
    const pxSpeed = speed * 250; // tuned in pixels on a 250px-radius domain
    const power = Math.max(0.25, Math.min(1, pxSpeed / 1300));
    if (hit.rock !== undefined && hit.at) {
      // A rock: a puff of dust and chips off its face, and it rocks on its axis.
      this.rockHits.set(hit.rock, { born: this.t, power, x: hit.at.x, y: hit.at.y });
      const n = Math.min(36, 8 + pxSpeed / 45);
      this.particles.burst(hit.at.x, hit.at.y, n, Math.min(320, 70 + pxSpeed * 0.18) * PX, [DUST, DUST, WHITE, this.tint], -nx, -ny, 1.1);
      if (pxSpeed > 900 && Math.random() < 0.4) this.speak(pick(["BONK", "rock!!", "oof—", "who put that there"]), 1.2);
    } else {
      this.ripples.push({ nx, ny, born: this.t, power });
      this.particles.burst(nx * 0.99, ny * 0.99, Math.min(30, 6 + pxSpeed / 55), Math.min(340, 80 + pxSpeed * 0.2) * PX, [CYAN, VIOLET], -nx, -ny);
    }
    this.wobble = Math.min(1, this.wobble + pxSpeed / 1600);
    this.squash = Math.max(this.squash, Math.min(1, pxSpeed / 1400));
    this.squashAngle = Math.atan2(ny, nx);
    if (pxSpeed > 600) this.bonkUntil = this.t + 0.45;
    if (pxSpeed > 1500) {
      this.dizzyUntil = this.t + 1.4;
      if (Math.random() < 0.5) this.speak(pick(["ow!", "oof", "@_@", "ouch!"]), 1.1);
    }
    if (!reduced) this.shake = Math.max(this.shake, Math.min(1, (pxSpeed - 300) / 1500));
  }

  /** Out in the universe, a shooting star catches Blitz's eye now and then. */
  private noticeShootingStar(x: number, y: number): void {
    if (!this.layoutOpen || this.trans || this.asleep || this.holding || this.mood || this.thinking || this.speech || this.dreamHold) return;
    this.watch = { x, y, until: this.t + 1.2 };
    if (Math.random() < 0.3) this.speak(pick(["ooh!! a shooting star", "make a wish!", "✨ did you see that ✨", "woah"]), 1.6);
  }

  /** Blitz's drawn position glides from `from` to where it really is, over the re-seal. */
  private glideFrom(from: Point): void {
    this.glide = { x: from.x - this.body.x, y: from.y - this.body.y, start: this.t, dur: GATHER };
    this.renderOffset = { x: this.glide.x, y: this.glide.y };
  }

  /** The current camera, in viewport pixels (so it survives the canvas changing size). */
  private viewportCam(): Cam {
    return { ...this.cam, x: this.cam.x + this.rectLeft, y: this.cam.y + this.rectTop };
  }

  /**
   * The bubble gives way. In one orchestrated moment: a flash and shockwaves,
   * the glass flies outward in slow motion, the window around it breaks away,
   * and the universe opens out from where the bubble was while the camera
   * swings over to follow Blitz.
   */
  private startBurst(): void {
    const chrome = measureChrome();
    const from = this.viewportCam();
    const [bx, by_] = toScreen(this.cam, 0, 0);
    const center = { x: bx + this.rectLeft, y: by_ + this.rectTop };
    const radius = this.cam.s;
    const breakAngle = Math.atan2(this.body.y, this.body.x);
    this.setLayout(true);
    chromeBurst(chrome);
    this.follow = { fx: 0, fy: 0, s: from.s };
    this.trans = { kind: "burst", start: this.t, from, chrome };
    this.shatter.explode(center.x - this.rectLeft, center.y - this.rectTop, radius, breakAngle, this.fxT, reduced ? 16 : 48);
    this.shatter.flash(this.fxT, reduced ? 0.2 : 0.6);
    this.slowUntil = this.t + SLOW_MO;
    if (!reduced) this.shake = 1.6;
    this.cracks = [];
    this.crackLevel = 0;
    this.particles.burst(this.body.x, this.body.y, reduced ? 24 : 90, 700 * PX, [CYAN, VIOLET, WHITE, GOLD], undefined, undefined, 1.4);
    this.applyMood("excited", pick(["WHEEEEE!!", "FREEDOM!!", "I'M FREE!!", "WOOOOO!"]), 3.5);
    this.setNotice("you burst the bubble!", 3);
    this.onOpenChange?.(true);
  }

  /**
   * The bubble re-forms. First (still full-window) the universe folds back
   * in toward where the bubble will be, its glass gathering out of the dark
   * while the camera glides home; then the window settles back around it.
   */
  private async startReform(): Promise<void> {
    if (this.reforming) return;
    this.reforming = true;
    try {
      await this.beforeReform?.().catch(() => undefined);
      await nextFrame();
      this.resize();
      const to = this.measureBubbleCam();
      const from = this.viewportCam();
      this.trans = { kind: "reform", start: this.t, from, to, chrome: measureChrome() };
      this.shatter.gather(to.x - this.rectLeft, to.y - this.rectTop, to.s, Math.hypot(this.W, this.H) * 0.7, this.fxT, GATHER, reduced ? 14 : 44);
      this.cracks = [];
      this.crackLevel = 0;
    } finally {
      this.reforming = false;
    }
  }

  /** The re-seal's second half: the window comes back around the newly whole bubble. */
  private finishReform(): void {
    const chrome = this.trans?.chrome;
    this.trans = undefined;
    this.setLayout(false);
    chromeReform(chrome);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.ripples.push({ nx: Math.cos(a), ny: Math.sin(a), born: this.t + i * 0.03, power: 0.7 });
    }
    for (let i = 0; i < (reduced ? 12 : 40); i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit(Math.cos(a), Math.sin(a), -Math.cos(a) * 0.35, -Math.sin(a) * 0.35, rand(0.6, 1.2), rand(1, 2.5), Math.random() < 0.3 ? VIOLET : CYAN);
    }
    this.applyMood("curious", pick(["oh!", "home sweet bubble", "huh?"]), 1.8);
    this.onOpenChange?.(false);
  }

  /** Where the bubble sits once the window is back, in viewport pixels (measured without showing anything). */
  private measureBubbleCam(): Cam {
    const wasOpen = document.body.classList.contains("open");
    document.body.classList.remove("open");
    const rect = this.canvas.getBoundingClientRect();
    if (wasOpen) document.body.classList.add("open");
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, s: Math.max(60, Math.min(rect.width, rect.height) / 2 - 18), fx: 0, fy: 0 };
  }

  /** Switches the page between the bubble window and the full-window universe. */
  private setLayout(open: boolean): void {
    if (open === this.layoutOpen) return;
    // The universe and the bubble cost different amounts to draw: judge each afresh.
    this.tooSlowAt = Infinity;
    document.body.classList.toggle("open", open);
    this.layoutOpen = open;
    this.resize();
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

  // ---- Blitz's life: bursting, re-forming, naps and tricks ----------------------------

  private startTrick(kind: TrickKind, delay: number): void {
    this.trick = { kind, start: now() + delay, x: this.body.x, y: this.body.y, dir: Math.random() < 0.5 ? -1 : 1 };
    this.nextIdleTrick = now() + delay + 9 + Math.random() * 10;
  }

  private live(nowSim: number): void {
    if (!this.open && this.holding && isBursting(this.body)) {
      this.dropHold();
      burstLaunch(this.body);
      this.open = true;
      this.anchor = landingPoint(this.body);
      this.flingUntil = nowSim + BURST_COAST;
      this.lastInteraction = nowSim;
      this.startBurst();
      return;
    }
    if (this.holding || this.trans) return;
    // Showing the menu: Blitz stays put and attentive (no naps, no wandering off, no sealing the bubble on its own).
    if (this.dreamHold) {
      this.lastInteraction = nowSim;
      this.anchor = this.dreamHold;
      return;
    }
    if (this.open && nowSim - this.lastInteraction > OPEN_FOR) this.seal();
    if (!this.asleep && nowSim - this.lastInteraction > SLEEP_AFTER) {
      this.asleep = true;
      this.trick = undefined;
      this.yawnUntil = this.t + 1.4;
    }
    if (!this.asleep && !this.trick && nowSim > this.nextIdleTrick) this.startTrick(idleTrick(), 0);
  }

  // ---- Frame ----------------------------------------------------------------------

  /**
   * Render sharpness, adjusted to the computer: 1 draws at the screen's full
   * resolution (up to a cap); when frames come too slowly it steps down, and
   * after a long smooth stretch it tries a step back up, but only until the
   * first time it's too slow (per layout), so it doesn't keep flip-flopping.
   */
  private quality = 1;
  private tooSlowAt = Infinity;
  private frameAvg = 16.7;
  private slowMs = 0;
  private smoothMs = 0;
  private settleUntil = 0;

  private adaptQuality(frameMs: number): void {
    // Hidden tabs, resizes and layout changes cause one-off hitches; don't judge those.
    if (frameMs > 250 || this.t < this.settleUntil) return;
    this.frameAvg += (frameMs - this.frameAvg) * 0.05;
    this.slowMs = this.frameAvg > SLOW_FRAME_MS ? this.slowMs + frameMs : 0;
    this.smoothMs = this.frameAvg < SMOOTH_FRAME_MS ? this.smoothMs + frameMs : 0;
    if (this.slowMs > 1000 && this.quality > MIN_QUALITY) {
      this.tooSlowAt = this.quality;
      this.setQuality(Math.max(MIN_QUALITY, this.quality * 0.8));
    } else if (this.smoothMs > 8000 && this.quality < 1 && this.tooSlowAt === Infinity) {
      // Sharpening back up only until the first time it's too slow in this layout: going back
      // and forth would mean repainting everything over and over.
      this.setQuality(Math.min(1, this.quality * 1.15));
    }
  }

  private setQuality(q: number): void {
    this.quality = q;
    this.slowMs = 0;
    this.smoothMs = 0;
    this.frameAvg = 16.7;
    this.resize();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.prewarmed = false; // the window (or sharpness) changed: open space needs painting for it
    // Fullscreen canvases are big; a softer resolution keeps them smooth.
    this.dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, this.layoutOpen ? OPEN_DPR : 2) * this.quality);
    this.settleUntil = this.t + 1;
    this.W = rect.width;
    this.H = rect.height;
    // Space is scaled to the window and its tiles painted for open space, so they serve the bubble too.
    this.universe.setScreen(window.innerWidth, window.innerHeight, Math.max(0.5, Math.min(window.devicePixelRatio || 1, OPEN_DPR) * this.quality));
    this.rectLeft = rect.left;
    this.rectTop = rect.top;
    // Setting a canvas's size (even to the same value) throws its pixels away, so only when it really changes.
    const w = Math.round(this.W * this.dpr);
    const h = Math.round(this.H * this.dpr);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  private bubbleCam(): Cam {
    return { x: this.W / 2, y: this.H / 2, s: Math.max(60, Math.min(this.W, this.H) / 2 - 18), fx: 0, fy: 0 };
  }

  /**
   * Out in open space the camera follows Blitz loosely: it only moves once
   * Blitz strays from the middle of the screen, leads a little in the
   * direction of flight, and pulls back as Blitz speeds up. Carrying Blitz to
   * the edge of the screen pans across the universe.
   */
  private followCam(dt: number): Cam {
    const availH = Math.max(120, this.H - HUD_TOP - HUD_BOTTOM);
    const base = Math.max(135, Math.min(this.W, availH) / 2 / 1.6);
    const speed = Math.hypot(this.body.vx, this.body.vy);
    const target = base / (1 + 0.045 * Math.min(speed, 12));
    if (this.follow.s <= 0) this.follow.s = target;
    this.follow.s += (target - this.follow.s) * Math.min(1, dt * 1.6);
    const b = this.drawnBody();
    const tx = b.x + this.body.vx * 0.2;
    const ty = b.y + this.body.vy * 0.2;
    const dx = tx - this.follow.fx;
    const dy = ty - this.follow.fy;
    const m = Math.hypot(dx, dy);
    const deadZone = (0.16 * Math.min(this.W, availH)) / this.follow.s;
    if (m > deadZone) {
      const k = (1 - deadZone / m) * Math.min(1, dt * 4);
      this.follow.fx += dx * k;
      this.follow.fy += dy * k;
    }
    return { x: this.W / 2, y: HUD_TOP + availH / 2, s: this.follow.s, fx: this.follow.fx, fy: this.follow.fy };
  }

  private updateCam(dt: number): void {
    const tr = this.trans;
    if (tr?.kind === "burst") {
      const k = (this.t - tr.start) / BURST_CAM;
      const target = this.followCam(dt);
      const from = { ...tr.from, x: tr.from.x - this.rectLeft, y: tr.from.y - this.rectTop };
      this.cam = mixCam(from, target, easeInOut(k));
      if (k >= 1 && this.t - tr.start >= REVEAL) this.trans = undefined;
      return;
    }
    if (tr?.kind === "reform" && tr.to) {
      const k = (this.t - tr.start) / GATHER;
      const from = { ...tr.from, x: tr.from.x - this.rectLeft, y: tr.from.y - this.rectTop };
      const to = { ...tr.to, x: tr.to.x - this.rectLeft, y: tr.to.y - this.rectTop };
      this.cam = mixCam(from, to, easeInOut(k));
      if (k >= 1) this.finishReform();
      return;
    }
    // While Blitz shows its menu the camera holds still, so the menu and Blitz stay where they were put.
    if (this.dreamHold && this.layoutOpen) return;
    this.cam = this.layoutOpen ? this.followCam(dt) : this.bubbleCam();
  }

  private prevFrame = performance.now();
  private frameCount = 0;
  private skipped = false;

  /**
   * While the bubble sits quietly, open space's textures are painted ahead of
   * time, so bursting the bubble doesn't stall: in the browser's idle time
   * between frames, a piece at a time, and only when the piece fits.
   */
  private prewarmed = false;
  private idleAsked = false;

  private askIdle(): void {
    if (this.idleAsked || this.prewarmed || this.layoutOpen) return;
    this.idleAsked = true;
    whenIdle((deadline) => this.idle(deadline));
  }

  private idle(deadline: IdleDeadline): void {
    this.idleAsked = false;
    if (this.prewarmed || this.layoutOpen || this.trans || this.t < 3) return;
    const view = this.burstView();
    for (;;) {
      // A millisecond to spare, so a piece that runs a little long still doesn't hold up the next frame.
      const state = this.universe.prewarm(view.W, view.H, view.cam, deadline.timeRemaining() - 1);
      if (state === "done") this.prewarmed = true;
      if (state !== "more") return;
    }
  }

  /** Open space as the burst begins: the full window, the camera centred above the message box, on the middle of the bubble. */
  private burstView(): { W: number; H: number; cam: Cam } {
    const inset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--top-inset")) || 0;
    const W = window.innerWidth;
    const H = Math.max(1, window.innerHeight - inset);
    const availH = Math.max(120, H - HUD_TOP - HUD_BOTTOM);
    return { W, H, cam: { x: W / 2, y: HUD_TOP + availH / 2, s: this.cam.s, fx: 0, fy: 0 } };
  }

  private frame(ms: number): void {
    // The next frame is asked for first, so even a mistake in this one can't stop Blitz.
    requestAnimationFrame((next) => this.frame(next));
    // A dozing Blitz barely moves: half the frames are plenty, and kinder to batteries.
    if (this.asleep && !this.pointer.down && !this.trans && !this.mote && !this.speech && (this.frameCount++ & 1) === 1) {
      this.skipped = true;
      return;
    }
    // A skipped frame doubles the gap; that isn't the computer being slow.
    this.adaptQuality((ms - this.prevFrame) / (this.skipped ? 2 : 1));
    this.skipped = false;
    const dt = Math.min(0.05, (ms - this.prevFrame) / 1000);
    this.prevFrame = ms;
    this.t += dt;
    const slow = this.t < this.slowUntil ? 0.3 + 0.7 * clamp01(1 - (this.slowUntil - this.t) / SLOW_MO) ** 2 : 1;
    this.fxT += dt * slow;
    this.universe.tick(dt, this.layoutOpen);
    this.simulate();
    this.updateCam(dt);
    this.updateLooks(dt);
    this.updateStatus();
    try {
      this.draw(dt, dt * slow);
    } catch (err) {
      // Don't leave the canvas half set up (clipped, or moved) for the next frame.
      this.ctx.reset();
      throw err;
    }
    this.askIdle();
  }

  private holdTarget(): Point | undefined {
    if (!this.holding) return undefined;
    // The camera may have moved under a still pointer; aim where the pointer is now.
    const p = this.toDomain(this.pointer.cx, this.pointer.cy);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    return clampTarget(p, this.open);
  }

  private simulate(): void {
    const target = this.holdTarget();
    const until = now();
    if (until - this.simulatedUntil > 0.5) this.simulatedUntil = until - STEP;
    while (this.simulatedUntil + STEP <= until) {
      const hit = step(this.body, { t: this.simulatedUntil, ...this.forces(target) });
      this.simulatedUntil += STEP;
      if (hit && isSplash(hit)) this.impact(hit);
    }
    // A trick that's over: a spin leaves Blitz a little dizzy.
    if (this.trick && until > this.trick.start && trickAge(this.trick, until) === undefined) {
      if (this.trick.kind === "spin") this.dizzyUntil = this.t + 0.8;
      this.trick = undefined;
    }
    this.live(until);
  }

  private shownStrain(): number {
    return this.open ? 0 : this.body.strain ?? 0;
  }

  private every(key: string, seconds: number): boolean {
    if (this.t - (this.emitAt[key] ?? -10) < seconds) return false;
    this.emitAt[key] = this.t;
    return true;
  }

  private updateLooks(dt: number): void {
    const t = this.t;
    const ft = this.fxT;
    const { x, y } = this.body;
    if (this.mood && t > this.moodUntil) this.mood = undefined;
    if (this.thinking && t - this.thinking.since > 30) this.thinking = undefined;

    // A message reaching Blitz.
    if (this.mote && t >= this.mote.arrive) {
      this.mote = undefined;
      this.particles.burst(x, y, reduced ? 6 : 18, 180 * PX, [WHITE, CYAN]);
    }
    if (this.pending && t >= this.pending.at) {
      const p = this.pending;
      this.pending = undefined;
      this.particles.burst(x, y, reduced ? 8 : 26, 220 * PX, [WHITE, CYAN, TINTS[p.mood]]);
      this.applyMood(p.mood, p.say, 4.2 + Math.min(4, p.say.length * 0.04));
    }

    if (t > this.nextBlink && !this.asleep) {
      this.blinkUntil = t + 0.13;
      this.nextBlink = t + (Math.random() < 0.2 ? 0.25 : 2.5 + Math.random() * 4);
    }

    // Wall strain: cracks, ripples, a straining face. Cracks fade as the wall heals.
    const strain = this.shownStrain();
    const pushing = !this.open && wallPush(this.body, this.holdTarget()) > 0.04;
    if (pushing) {
      this.strainAngle = Math.atan2(y, x);
      if (!reduced) this.shake = Math.max(this.shake, strain * 0.35);
      if (t - this.lastPressRipple > Math.max(0.12, 0.5 - strain * 0.4)) {
        this.lastPressRipple = t;
        this.ripples.push({ nx: Math.cos(this.strainAngle), ny: Math.sin(this.strainAngle), born: t, power: 0.3 + 0.7 * strain });
      }
      if (this.every("sweat", 0.5 - strain * 0.25)) {
        this.emotes.float("sweat", x + rand(-0.04, 0.04), y - 0.07, rand(-0.3, 0.3), -0.25, ft, 0.8, 0.32, 1.4);
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
    if (mood === "love" && this.every("love", 0.28)) this.emotes.float("heart", x + rand(-0.06, 0.06), y - 0.08, rand(-0.15, 0.15), rand(-0.45, -0.3), ft, 1.5, rand(0.3, 0.5));
    if (mood === "comfort" && this.every("comfort", 0.55)) this.emotes.float("heart", x + rand(-0.06, 0.06), y - 0.08, rand(-0.1, 0.1), -0.22, ft, 1.8, 0.35);
    if (mood === "shy" && this.every("shy", 0.8)) this.emotes.float("heart", x + rand(-0.08, 0.08), y - 0.06, rand(-0.1, 0.1), -0.25, ft, 1.2, 0.28);
    if ((mood === "excited" || mood === "laugh") && this.every("sparkle", mood === "excited" ? 0.14 : 0.35)) {
      const a = Math.random() * Math.PI * 2;
      this.emotes.float(mood === "excited" ? "star" : "spark", x, y, Math.cos(a) * 0.45, Math.sin(a) * 0.45, ft, 0.8, rand(0.25, 0.4));
    }
    if (mood === "sad" && this.every("tear", 0.5)) {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.emotes.float("tear", x + side * ORB_RADIUS * 0.34, y + ORB_RADIUS * 0.1, side * 0.05, 0.05, ft, 1.2, 0.28, 1.2);
    }
    if (mood === "scared" && this.every("scared", 0.45)) {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.emotes.float("sweat", x + side * ORB_RADIUS * 0.8, y - ORB_RADIUS * 0.4, side * 0.35, -0.2, ft, 0.7, 0.3, 1.5);
    }
    if (this.asleep && Math.random() < dt * 0.7) this.emotes.float("z", x + ORB_RADIUS * 0.8, y - ORB_RADIUS * 0.9, 0.06, -0.12, ft, 2.4, 0.4);

    // Tricks have their own flourishes.
    const trickNow = this.trick && trickAge(this.trick, now()) !== undefined ? this.trick.kind : undefined;
    if (trickNow === "dance" && this.every("note", 0.35)) this.emotes.float("note", x + rand(-0.06, 0.06), y - 0.08, rand(-0.2, 0.2), -0.35, ft, 1.3, 0.45);
    if (trickNow === "heart" && !reduced) {
      // Blitz draws the heart in light as it flies.
      for (let i = 0; i < 2; i++) this.particles.emit(x + rand(-0.01, 0.01), y + rand(-0.01, 0.01), 0, 0, 2.6, rand(1.4, 2.4), PINK);
    }

    // Being petted (pointer resting on Blitz).
    const petted = this.petSince > 0 && t - this.petSince > 0.6 && !this.holding;
    if (petted && !this.asleep && this.every("pet", 0.7)) {
      this.emotes.float("heart", x + rand(-0.05, 0.05), y - 0.07, rand(-0.08, 0.08), -0.2, ft, 1.1, 0.26);
      if (Math.random() < 0.12) this.speak(pick(["hehe~", "♡", "mmm~"]), 1.1);
    }

    // Where Blitz looks.
    const me = this.blitzPx();
    let gx: number;
    let gy: number;
    let reach = 60;
    if (this.mote) {
      const mp = this.motePoint();
      gx = mp.x - me.x;
      gy = mp.y - me.y;
    } else if (this.watch && t < this.watch.until && !this.asleep) {
      gx = this.watch.x - me.x;
      gy = this.watch.y - me.y;
    } else if (this.thinking) {
      // Pondering: eyes up and off to the side.
      gx = 0.65;
      gy = -0.8;
      reach = 1;
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
        gx = this.body.vx;
        gy = this.body.vy;
        reach = 1.2;
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
    // A glow bought with Stardust takes the place of Blitz's calm cyan.
    const calm = this.outfit.glow ?? CALM;
    let tintTarget: RGB = this.mood ? TINTS[this.mood] : this.thinking ? TINTS.curious : trickNow ? TINTS[TRICK_MOOD[trickNow]] : this.asleep ? TINTS.sleepy : calm;
    if (!this.mood && trickNow) tintTarget = [(tintTarget[0] + calm[0]) / 2, (tintTarget[1] + calm[1]) / 2, (tintTarget[2] + calm[2]) / 2];
    if (strain > 0) tintTarget = [tintTarget[0] + (255 - tintTarget[0]) * strain * 0.6, tintTarget[1] + (255 - tintTarget[1]) * strain * 0.6, tintTarget[2] + (255 - tintTarget[2]) * strain * 0.6];
    const k = Math.min(1, dt * 4);
    this.tint = [this.tint[0] + (tintTarget[0] - this.tint[0]) * k, this.tint[1] + (tintTarget[1] - this.tint[1]) * k, this.tint[2] + (tintTarget[2] - this.tint[2]) * k];

    this.wobble *= Math.exp(-3 * dt);
    this.squash *= Math.exp(-7 * dt);
    this.shake *= Math.exp(-6 * dt);
    if (this.glide) {
      // The long, eased glide back into the bubble.
      const g = this.glide;
      const left = 1 - easeInOut((t - g.start) / g.dur);
      this.renderOffset = { x: g.x * left, y: g.y * left };
      if (left <= 0) this.glide = undefined;
    } else {
      const decay = Math.exp(-10 * dt);
      this.renderOffset.x *= decay;
      this.renderOffset.y *= decay;
    }

    // Trail
    if (t > 1.1) {
      const speed = Math.hypot(this.body.vx, this.body.vy);
      let n = ((reduced ? 4 : 16) + speed * 250 * (reduced ? 0.01 : 0.05)) * dt;
      const o = this.drawnBody();
      while (n > 0) {
        if (Math.random() < n) {
          const a = Math.random() * Math.PI * 2;
          const r = ORB_RADIUS * 0.6 * Math.random();
          const trail = this.outfit.trail;
          const big = trail === "bubbles";
          this.particles.emit(
            o.x + Math.cos(a) * r,
            o.y + Math.sin(a) * r,
            -this.body.vx * 0.12 + rand(-20, 20) * PX,
            -this.body.vy * 0.12 + rand(-20, 20) * PX + (trail === "ember" ? -18 * PX : 0),
            (0.6 + Math.random() * 0.9) * (big ? 1.4 : 1),
            (0.8 + Math.random() * 1.8) * (big ? 1.8 : 1),
            trail ? trailColor(trail, t) : Math.random() < 0.25 ? VIOLET : this.tint,
          );
          // Hearts now and then, for the heart trail.
          if (trail === "hearts" && !reduced && Math.random() < 0.05) this.emotes.float("heart", o.x, o.y, rand(-0.2, 0.2), rand(-0.45, -0.25), this.fxT, rand(1, 1.5), rand(0.22, 0.32));
        }
        n -= 1;
      }
    }
  }

  private motePoint(): Point {
    const m = this.mote!;
    const target = this.blitzPx();
    const k = easeInOut((this.t - m.born) / Math.max(0.01, m.arrive - m.born));
    // A swooping curve from the message card down to Blitz.
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
    if (this.holding) {
      if (strain > 0.12) return { eyes: "strain", mouth: "grit", brows: "sad", blush: 0.2 };
      if (t < this.surprisedUntil) return { eyes: "wide", mouth: "o", brows: "none", blush: 0 };
      if (speed > 2.6) return { eyes: "happy", mouth: "open", brows: "none", blush: 0.3 };
      return { eyes: "happy", mouth: "smile", brows: "none", blush: 0.45 };
    }
    if (this.mood) return MOOD_FACE[this.mood];
    if (this.thinking && t >= this.thinking.landsAt) return { eyes: "open", mouth: "flat", brows: "raised", blush: 0 };
    if (this.pending || this.mote) return { eyes: "wide", mouth: "o", brows: "raised", blush: 0 };
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
    const trickNow = this.trick && trickAge(this.trick, now()) !== undefined ? this.trick : undefined;
    const face = this.face(trickNow?.kind, strain);
    // A new expression arrives with a little pop.
    const key = `${face.eyes}|${face.mouth}`;
    if (key !== this.faceKey) {
      this.faceKey = key;
      this.facePopAt = t;
    }
    const pop = reduced ? 1 : 1 + 0.08 * Math.sin(Math.PI * clamp01((t - this.facePopAt) / 0.22));
    const intro = reduced ? 1 : easeOut((t - 0.75) / 0.6);
    let { x, y } = this.blitzPx();
    const svx = this.body.vx * this.cam.s;
    const svy = this.body.vy * this.cam.s;
    const speedPx = Math.hypot(svx, svy);
    const pulse = 1 + 0.04 * Math.sin(t * 2.4) + 0.05 * this.wobble * Math.sin(t * 28);
    const r = ORB_RADIUS * this.cam.s * intro * pulse;

    // Shivers and strain shakes move the whole of Blitz a little.
    const jitter = (this.mood === "scared" ? 1.5 : 0) + strain * 2.2;
    if (jitter > 0 && !reduced) {
      x += rand(-jitter, jitter);
      y += rand(-jitter, jitter);
    }

    let tilt = Math.max(-0.35, Math.min(0.35, this.body.vx * 0.08));
    if (this.mood === "curious" || this.pending || this.thinking) tilt += 0.22;
    if (face.eyes === "laugh") tilt += Math.sin(t * 22) * 0.12;
    if (this.mood === "shy") tilt -= 0.15;
    if (trickNow?.kind === "spin") {
      const u = (now() - trickNow.start) / TRICKS.spin;
      tilt += (trickNow.dir < 0 ? -1 : 1) * Math.PI * 2 * 3 * (u * u * (3 - 2 * u));
    }
    if (trickNow?.kind === "wiggle" || trickNow?.kind === "dance") tilt += Math.sin(t * 16) * 0.18;

    let scaleX = pop;
    let scaleY = pop;
    if (this.mood === "grumpy") {
      scaleX *= 1.1 + 0.03 * Math.sin(t * 6);
      scaleY *= 1.1 + 0.03 * Math.sin(t * 6);
    }
    if (t < this.stretchUntil) {
      const k = 1 - (this.stretchUntil - t) / 0.6;
      const s = Math.sin(k * Math.PI) * 0.18;
      scaleX *= 1 - s * 0.5;
      scaleY *= 1 + s;
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
      hat: this.outfit.hat,
    };
  }

  private updateStatus(): void {
    const t = this.t;
    const speed = Math.hypot(this.body.vx, this.body.vy);
    const strain = this.shownStrain();
    const trickNow = this.trick && trickAge(this.trick, now()) !== undefined ? this.trick.kind : undefined;
    let s = "drifting";
    if (t < 1.2) s = "summoning…";
    else if (t < this.noticeUntil) s = this.notice;
    else if (this.trans?.kind === "reform") s = "sealing the bubble…";
    else if (t < this.bonkUntil) s = "bonk!";
    else if (t < this.dizzyUntil) s = "dizzy…";
    else if (this.holding) s = strain > 0.15 ? "the wall is cracking…" : this.open ? "carrying Blitz through space" : "held by you";
    else if (this.thinking) s = "thinking…";
    else if (this.pending || this.mote) s = "listening…";
    else if (this.mood) s = MOOD_STATUS[this.mood];
    else if (this.asleep) s = "dozing";
    else if (t < this.giggleUntil) s = "giggling";
    else if (trickNow) s = TRICK_STATUS[trickNow];
    else if (speed > 2.6) s = "wheee!";
    else if (this.petSince > 0 && t - this.petSince > 0.6) s = "being petted";
    else if (this.open) s = "roaming the universe";
    if (s !== this.lastStatus) {
      this.ui.status.textContent = s;
      this.lastStatus = s;
    }
  }

  // ---- Drawing ----------------------------------------------------------------------

  private draw(dt: number, fxDt: number): void {
    const ctx = this.ctx;
    const { W, H, t } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Open space paints every pixel anyway (unless it's opening, closing or shaking), so only clear otherwise.
    if (!this.layoutOpen || this.trans || this.shake > 0.01) ctx.clearRect(0, 0, W, H);
    // Shakes move in whole device pixels, so the pixel-for-pixel copies stay crisp and cheap.
    const sx = this.shake > 0.01 ? Math.round((Math.random() - 0.5) * 9 * this.shake * this.dpr) / this.dpr : 0;
    const sy = this.shake > 0.01 ? Math.round((Math.random() - 0.5) * 9 * this.shake * this.dpr) / this.dpr : 0;
    ctx.save();
    ctx.translate(sx, sy);

    const strain = this.shownStrain();
    const opening = reduced ? 1 : Math.min(1, t / 0.9);
    const wallR = this.cam.s * (0.6 + 0.4 * easeOut(opening));
    const [cx, cy] = toScreen(this.cam, 0, 0);
    const tr = this.trans;

    if (this.layoutOpen) {
      // The universe, opening out from (or folding back into) where the bubble is.
      // Big enough to cover the whole screen from wherever the bubble's middle is right now.
      const full = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy)) + 40;
      let reveal: number | undefined;
      if (tr?.kind === "burst") {
        const k = (t - tr.start) / REVEAL;
        if (k < 1) reveal = wallR + (full - wallR) * easeInOut(k);
      } else if (tr?.kind === "reform") {
        const k = (t - tr.start) / GATHER;
        reveal = wallR + (full - wallR) * (1 - easeInOut(k));
      }
      const view = { alpha: 1, shooting: !tr, farRocks: true };
      // The darkened edges come in as the universe opens out, and go as it folds back.
      this.showVignette(tr?.kind === "burst" ? easeInOut((t - tr.start) / REVEAL) : tr?.kind === "reform" ? 1 - easeInOut((t - tr.start) / GATHER) : 1);
      if (reveal !== undefined) {
        // Clipping to the circle would send every pixel of the universe through a mask. Instead: clip to
        // the circle's box (on whole device pixels, which is nearly free), then clear the corners outside it.
        // (The box is worked out on screen, where the shake has moved the circle to.)
        const k = this.dpr;
        const x0 = Math.max(0, Math.floor((cx + sx - reveal) * k) / k);
        const y0 = Math.max(0, Math.floor((cy + sy - reveal) * k) / k);
        const x1 = Math.min(W, Math.ceil((cx + sx + reveal) * k) / k);
        const y1 = Math.min(H, Math.ceil((cy + sy + reveal) * k) / k);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 - sx, y0 - sy, x1 - x0, y1 - y0);
        ctx.clip();
        this.drawOpenUniverse(dt, view);
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.rect(x0 - sx, y0 - sy, x1 - x0, y1 - y0);
        ctx.arc(cx, cy, reveal, 0, Math.PI * 2);
        ctx.fill("evenodd");
        ctx.restore();
        this.drawRevealRing(cx, cy, reveal, tr!.kind === "burst" ? clamp01((t - tr!.start) / REVEAL) : clamp01((t - tr!.start) / GATHER));
      } else {
        this.drawOpenUniverse(dt, view);
      }
      if (tr?.kind === "reform") {
        this.drawRim(ctx, cx, cy, wallR, clamp01((t - tr.start) / GATHER), 0);
        this.drawTicks(cx, cy, wallR, clamp01((t - tr.start) / GATHER), 0);
      }
    } else {
      this.showVignette(0);
      this.drawBubble(cx, cy, wallR, tr ? 1 : easeOut(opening), strain, dt);
    }

    const look = this.computeLook();
    ctx.save();
    // Inside the bubble Blitz's light stays behind the glass: everything glowing is clipped to the wall.
    if (!this.layoutOpen) {
      ctx.beginPath();
      ctx.arc(cx, cy, wallR - 1, 0, Math.PI * 2);
      ctx.clip();
    }
    this.particles.draw(ctx, this.cam, fxDt);
    if (look.r > 0.5) {
      drawHalo(ctx, look);
      this.drawTether(look);
      drawBlitz(ctx, look, t);
      if (this.shieldUp) this.drawGuard(look, t);
      if (t < this.dizzyUntil) this.drawDizzyStars(look);
    }
    this.emotes.draw(ctx, this.cam, look, this.fxT, fxDt, this.font);
    ctx.restore();

    if (!this.layoutOpen) {
      this.drawWallGlow(cx, cy, wallR, look, strain);
      drawCracks(ctx, this.cam, this.cracks, strain, t, wallR, (mx, my) => {
        // A healed crack sparkles shut.
        this.particles.burst(mx, my, reduced ? 3 : 9, 60 * PX, [WHITE, CYAN], undefined, undefined, 0.7);
      });
      drawRipples(ctx, this.cam, this.ripples, t, wallR);
    }
    if (this.thinking && t >= this.thinking.landsAt && look.r > 0.5) drawThought(ctx, look, t - this.thinking.landsAt, W);
    else if (this.speech && look.r > 0.5) {
      drawSpeech(ctx, this.speech.text, look, t - this.speech.born, this.speech.life, W, H, this.font);
      if (t - this.speech.born > this.speech.life) this.speech = undefined;
    }
    if (this.mote) this.drawMote();
    ctx.restore();
    this.shatter.draw(ctx, W, H, this.fxT, fxDt);
  }

  private rockArt(rock: Rock): RockArt {
    let art = this.rockArts.get(rock.id);
    if (art) return art;
    art = makeRockArt((n) => unit(hash32(rock.id, n, 7)), rock.crystal);
    if (this.rockArts.size > 400) this.rockArts.clear();
    this.rockArts.set(rock.id, art);
    return art;
  }

  /** The rocks around the camera, lit by Blitz's glow on the side that faces it. */
  private drawRocks(): void {
    const { W, H, cam } = this;
    const middle = toWorld(cam, W / 2, H / 2);
    const rocks = rocksNear(middle.x, middle.y, Math.hypot(W, H) / 2 / cam.s + 0.2, now());
    const blitz = this.drawnBody();
    for (const rock of rocks) this.drawRock(rock, blitz);
  }

  private drawRock(rock: Rock, blitz: Point): void {
    const { ctx, cam, t } = this;
    const [sx, sy] = toScreen(cam, rock.x, rock.y);
    const R = rock.r * cam.s;
    if (sx < -R * 1.8 || sy < -R * 1.8 || sx > this.W + R * 1.8 || sy > this.H + R * 1.8) return;
    const hit = this.rockHits.get(rock.id);
    let wobble = 0;
    let flash = 0;
    if (hit) {
      const age = t - hit.born;
      if (age > 1.5) this.rockHits.delete(rock.id);
      else {
        wobble = Math.sin(age * 26) * 0.14 * hit.power * Math.exp(-age * 4) * (0.25 / Math.max(0.12, rock.r));
        flash = hit.power * Math.exp(-age * 5);
      }
    }
    // Blitz's glow, strongest up close.
    const dx = blitz.x - rock.x;
    const dy = blitz.y - rock.y;
    const dist = Math.hypot(dx, dy) || 1;
    const glow = Math.pow(clamp01(1 - (dist - rock.r) / LIGHT_REACH), 1.6);
    // The light swings round from the sun toward Blitz as it comes close.
    const sun = Math.atan2(SUN.y, SUN.x);
    let turn = Math.atan2(dy, dx) - sun;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const la = sun + turn * clamp01(glow * 1.5);
    drawRockArt(ctx, this.rockArt(rock), sx, sy, R, rock.spin + wobble, { lx: Math.cos(la), ly: Math.sin(la), glow, tint: this.tint, gx: dx / dist, gy: dy / dist, flash }, t);
  }

  /** Sets how strongly the darkened edges show, touching the page only when it changes. */
  private showVignette(v: number): void {
    const shown = Math.round(clamp01(v) * 100) / 100;
    if (shown === this.vignetteShown) return;
    this.vignetteShown = shown;
    this.ui.vignette.style.opacity = `${shown}`;
  }

  /**
   * Open space. Its drifting layers are shown from a painted copy, copied
   * pixel for pixel. While the camera moves they're drawn fresh instead. Once
   * it stops (or when only the slow drift has moved a layer by a pixel, and the
   * old copy is still good enough to show) a new copy is painted on the side,
   * a step per frame, and swapped in when it's done, so no one frame has to
   * paint everything.
   */
  private drawOpenUniverse(dt: number, view: UniverseView): void {
    const { ctx, W, H, cam, t, universe } = this;
    const k = this.dpr;
    const st = this.openStill;
    const key = universe.stillKey(W, H, cam, k, false);
    const camKey = universe.camKey(W, H, cam, k);
    const steady = camKey === st.lastCam;
    st.lastCam = camKey;
    const front = st.front;
    if (!this.trans && front?.key === key) this.blit(front.canvas);
    else {
      const drifted = !this.trans && front?.cam === camKey;
      if (drifted) this.blit(front!.canvas);
      else universe.drawStill(ctx, W, H, cam, 1, 0, STILL_PARTS - 1);
      if (!this.trans && (drifted || steady) && universe.skyReady(W, H, cam)) this.paintOpenStep(key, camKey);
    }
    universe.drawLively(ctx, W, H, cam, t, dt, view);
    // The rocks Blitz can bump into, in front of the far-off sky.
    this.drawRocks();
  }

  /** Copies a canvas the size of the screen onto it pixel for pixel (shaken along with everything else). */
  private blit(c: HTMLCanvasElement): void {
    const { ctx } = this;
    const m = ctx.getTransform();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, Math.round(m.e), Math.round(m.f));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, 0, 0);
    ctx.restore();
  }

  /** Paints the next step of open space's new copy, and swaps it in once it's whole. */
  private paintOpenStep(key: string, camKey: string): void {
    const { W, H, cam, universe } = this;
    const k = this.dpr;
    const st = this.openStill;
    let back = st.back;
    if (back?.key === key && back.step >= OPEN_STEPS.length) {
      // The view is back where an earlier copy was painted (only whole copies keep their key): show that one again.
      st.back = st.front;
      st.front = back;
      return;
    }
    if (!back || back.key !== key) {
      const canvas = back?.canvas ?? opaqueCanvas();
      const w = Math.round(W * k);
      const h = Math.round(H * k);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      back = st.back = { canvas, key, cam: camKey, step: 0, complete: true };
    }
    const g = back.canvas.getContext("2d")!;
    g.setTransform(k, 0, 0, k, 0, 0);
    const [from, to] = OPEN_STEPS[back.step];
    if (!universe.drawStill(g, W, H, cam, 1, from, to)) back.complete = false;
    // Paint it now, not when it's first shown.
    finishPainting(back.canvas);
    if (++back.step < OPEN_STEPS.length) return;
    if (back.complete) {
      st.back = st.front;
      st.front = back;
    } else back.key = ""; // a deep-sky tile was missing: start over
  }

  /** The bright edge of the universe as it opens out or folds back in. */
  private drawRevealRing(cx: number, cy: number, r: number, k: number): void {
    const ctx = this.ctx;
    const fade = Math.sin(Math.PI * Math.min(1, k * 1.2));
    if (fade <= 0.01) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    // Layered strokes for the glow: a blurred shadow on a circle this size would cover the whole screen, every frame.
    // Blended normally rather than as added light: on dark space it looks the same, and is several times quicker.
    for (const [width, color] of [
      [44, `rgba(127, 227, 255, ${0.05 * fade})`],
      [22, `rgba(127, 227, 255, ${0.1 * fade})`],
      [10, `rgba(127, 227, 255, ${0.3 * fade})`],
      [2, `rgba(235, 250, 255, ${0.9 * fade})`],
    ] as const) {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The bubble: the universe seen through dark glass, with a glowing rim.
   * Inside the bubble the camera holds still, so the drifting layers, the
   * glass and the rim are painted once into a copy that's reused; only the
   * twinkling stars, dust and the rim's slow ticks are drawn fresh every frame.
   */
  private drawBubble(cx: number, cy: number, wallR: number, alpha: number, strain: number, dt: number): void {
    const { ctx, W, H, cam } = this;
    const k = this.dpr;
    // The copy is painted for the bubble at its full size; while it opens it shows through the growing circle.
    const r = this.cam.s;
    const shape = `${r}|${cx}|${cy}|${k}`;
    // While the window is being resized the copy would be stale by the next frame, so draw directly.
    const changing = shape !== this.bubbleShape;
    this.bubbleShape = shape;
    const key = `${shape}|${this.universe.stillKey(W, H, cam, k)}`;
    // Also draw directly until every deep-sky tile in view is painted, so the copy doesn't keep gaps.
    if (changing || (this.bubbleStill?.key !== key && !this.universe.skyReady(W, H, cam))) {
      this.drawBubbleFresh(cx, cy, wallR, alpha, dt);
      this.drawRim(ctx, cx, cy, wallR, alpha, strain);
      this.drawTicks(cx, cy, wallR, alpha, strain);
      return;
    }
    let still = this.bubbleStill;
    if (!still || still.key !== key) still = this.paintBubbleCopies(cx, cy, r, key);
    // The copy with the rim, once the bubble is whole and the rim isn't bulging.
    const opening = wallR < r - 0.5;
    const rimmed = !opening && alpha >= 1 && strain < 0.001;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (opening) {
      ctx.beginPath();
      ctx.arc(cx, cy, wallR, 0, Math.PI * 2);
      ctx.clip();
    }
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    // Copied pixel for pixel onto the device pixels it was painted for.
    const c = rimmed ? still.rimmed : still.plain;
    ctx.drawImage(c, still.left / k, still.top / k, c.width / k, c.height / k);
    ctx.imageSmoothingEnabled = smooth;
    if (!opening) {
      ctx.beginPath();
      ctx.arc(cx, cy, wallR, 0, Math.PI * 2);
      ctx.clip();
    }
    this.drawBubbleLively(cx, cy, wallR, alpha, dt);
    ctx.restore();
    if (!rimmed) this.drawRim(ctx, cx, cy, wallR, alpha, strain);
    this.drawTicks(cx, cy, wallR, alpha, strain);
  }

  /** Paints the bubble's copies: the sky through the glass, and the same with the rim on top. */
  private paintBubbleCopies(cx: number, cy: number, r: number, key: string): { plain: HTMLCanvasElement; rimmed: HTMLCanvasElement; key: string; left: number; top: number } {
    const k = this.dpr;
    const old = this.bubbleStill;
    // Room around the bubble for the rim's glow.
    const margin = 8;
    const size = Math.ceil((r + margin) * 2 * k) + 2;
    const left = Math.floor((cx - r - margin) * k) - 1;
    const top = Math.floor((cy - r - margin) * k) - 1;
    const plain = old?.plain ?? document.createElement("canvas");
    const rimmed = old?.rimmed ?? document.createElement("canvas");
    for (const c of [plain, rimmed]) {
      if (c.width !== size) c.width = size;
      if (c.height !== size) c.height = size;
    }
    const g = plain.getContext("2d")!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, size, size);
    // Canvas pixel (0, 0) is the device pixel at the copy's top-left corner.
    g.setTransform(k, 0, 0, k, -left, -top);
    const complete = this.paintBubbleStill(g, cx, cy, r);
    const gr = rimmed.getContext("2d")!;
    gr.setTransform(1, 0, 0, 1, 0, 0);
    gr.clearRect(0, 0, size, size);
    gr.drawImage(plain, 0, 0);
    gr.setTransform(k, 0, 0, k, -left, -top);
    this.drawRim(gr, cx, cy, r, 1, 0);
    // Painted before every deep-sky tile was ready: paint it again next frame.
    this.bubbleStill = { plain, rimmed, key: complete ? key : "", left, top };
    return this.bubbleStill;
  }

  /** The drifting layers seen through the bubble's tinted glass, clipped to the bubble. */
  private paintBubbleStill(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, alpha = 1): boolean {
    g.save();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.clip();
    const complete = this.universe.drawStill(g, this.W, this.H, this.cam, alpha);
    g.globalAlpha = alpha;
    const glass = g.createRadialGradient(cx, cy - r * 0.2, r * 0.05, cx, cy, r);
    glass.addColorStop(0, `rgba(27, 40, 80, ${GLASS[0]})`);
    glass.addColorStop(0.7, `rgba(15, 23, 52, ${GLASS[1]})`);
    glass.addColorStop(1, `rgba(9, 14, 34, ${GLASS[2]})`);
    g.fillStyle = glass;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.restore();
    return complete;
  }

  /** The twinkling stars and dust, dimmed by the glass (which darkens toward the rim). Call with the bubble clipped. */
  private drawBubbleLively(cx: number, cy: number, r: number, alpha: number, dt: number): void {
    const dim = (x: number, y: number) => 1 - glassAt(Math.hypot(x - cx, y - (cy - r * 0.2)) / r);
    this.universe.drawLively(this.ctx, this.W, this.H, this.cam, this.t, dt, { alpha, shooting: false, dim });
  }

  /** The bubble drawn straight onto the screen, for frames where it's changing size. */
  private drawBubbleFresh(cx: number, cy: number, r: number, alpha: number, dt: number): void {
    const { ctx } = this;
    ctx.save();
    this.paintBubbleStill(ctx, cx, cy, r, alpha);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    this.drawBubbleLively(cx, cy, r, alpha, dt);
    ctx.restore();
  }

  /** The rim, pushed outward around where Blitz is straining against it. */
  private drawRim(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, alpha: number, strain: number): void {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    if (strain < 0.001) ctx.arc(cx, cy, r, 0, Math.PI * 2);
    else {
      const n = 120;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        let d = a - this.strainAngle;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const bulge = strain * 0.035 * Math.exp(-((d / 0.32) ** 2));
        const quiver = strain > 0.35 && !reduced ? (Math.random() - 0.5) * 0.006 * strain : 0;
        const rr = r * (1 + bulge + quiver);
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
    // The glow: wide, faint strokes under the line (a blurred shadow this size is slow to draw every frame).
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(127, 227, 255, 0.10)";
    ctx.stroke();
    for (const [width, alpha] of [
      [11 + strain * 12, 0.035],
      [6 + strain * 6, 0.07],
      [3 + strain * 3, 0.14],
    ] as const) {
      ctx.lineWidth = width;
      ctx.strokeStyle = `rgba(127, 227, 255, ${alpha + strain * 0.1})`;
      ctx.stroke();
    }
    ctx.lineWidth = 1.6 + strain * 1.2;
    ctx.strokeStyle = `rgba(${190 + 65 * strain}, ${230 + 25 * strain}, 255, 0.85)`;
    ctx.stroke();
    ctx.restore();
  }

  /** The ring of ticks for the rim's current size, built once and turned as it spins. */
  private tickPaths: { r: number; short: Path2D; long: Path2D } | undefined;

  /** The slow ring of ticks just outside the rim: every fifth one long and violet. One path for each kind. */
  private drawTicks(cx: number, cy: number, r: number, alpha: number, strain: number): void {
    const { ctx, t } = this;
    if (alpha <= 0) return;
    if (this.tickPaths?.r !== r) {
      const ticks = 60;
      const short = new Path2D();
      const long = new Path2D();
      for (let i = 0; i < ticks; i++) {
        const isLong = i % 5 === 0;
        const a = (i / ticks) * Math.PI * 2;
        const r2 = r + (isLong ? 12 : 9);
        const path = isLong ? long : short;
        path.moveTo(Math.cos(a) * (r + 6), Math.sin(a) * (r + 6));
        path.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      }
      this.tickPaths = { r, short, long };
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(reduced ? 0 : -t * (0.02 + strain * 0.4));
    ctx.strokeStyle = "rgba(160, 200, 255, 0.22)";
    ctx.lineWidth = 1;
    ctx.stroke(this.tickPaths.short);
    ctx.strokeStyle = "rgba(200, 168, 255, 0.55)";
    ctx.lineWidth = 1.4;
    ctx.stroke(this.tickPaths.long);
    ctx.restore();
  }


  /** Where Blitz is close, its light pools on the wall instead of passing through it. */
  private drawWallGlow(cx: number, cy: number, r: number, look: Look, strain: number): void {
    const b = this.drawnBody();
    const gap = r - Math.hypot(b.x, b.y) * this.cam.s - look.r;
    const near = Math.max(0, 1 - gap / (look.r * 3.5));
    if (near <= 0) return;
    const a = Math.atan2(b.y, b.x);
    const spread = 0.12 + 0.18 * (1 - near) + (look.r / r) * 1.2 + strain * 0.25;
    const { ctx } = this;
    ctx.save();
    const width = 2 + 3 * near + strain * 4;
    const strength = Math.min(1, 0.75 * near * (this.asleep ? 0.6 : 1) + strain * 0.3);
    ctx.beginPath();
    ctx.arc(cx, cy, r, a - spread, a + spread);
    // A soft spill of light around the bright line.
    ctx.lineCap = "round";
    ctx.lineWidth = width * 4;
    ctx.strokeStyle = rgba(this.tint, strength * 0.15);
    ctx.stroke();
    ctx.lineWidth = width * 2.2;
    ctx.strokeStyle = rgba(this.tint, strength * 0.3);
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.strokeStyle = rgba(this.tint, strength);
    ctx.stroke();
    ctx.restore();
  }

  /** A thread of light from Blitz to the hand holding it. */
  private drawTether(look: Look): void {
    if (!this.holding) return;
    const target = clampTarget({ x: this.pointer.x, y: this.pointer.y }, this.open);
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

  /** Standing guard while a shield is up: two arcs of warm light circling Blitz, and three sparks riding them. */
  private drawGuard(look: Look, t: number): void {
    const ctx = this.ctx;
    const R = look.r * 1.75;
    const pulse = 0.55 + Math.sin(t * 3) * 0.2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1.5, look.r * 0.09);
    ctx.strokeStyle = `rgba(250, 178, 25, ${pulse * 0.7})`;
    for (let i = 0; i < 2; i++) {
      const a = t * 1.3 + i * Math.PI;
      ctx.beginPath();
      ctx.arc(look.x, look.y, R, a, a + Math.PI * 0.62);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(255, 226, 150, ${pulse})`;
    for (let i = 0; i < 3; i++) {
      const a = -t * 0.9 + (i / 3) * Math.PI * 2;
      const px = look.x + Math.cos(a) * R;
      const py = look.y + Math.sin(a) * R;
      const s = look.r * 0.13;
      ctx.beginPath();
      ctx.moveTo(px, py - s);
      ctx.lineTo(px + s * 0.6, py);
      ctx.lineTo(px, py + s);
      ctx.lineTo(px - s * 0.6, py);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** The message, as a bright mote flying from the card to Blitz. */
  private drawMote(): void {
    const ctx = this.ctx;
    const p = this.motePoint();
    if (!reduced && Math.random() < 0.8) {
      const w = toWorld(this.cam, p.x, p.y);
      this.particles.emit(w.x, w.y, rand(-30, 30) * PX, rand(-30, 30) * PX, 0.5, rand(0.8, 1.6), Math.random() < 0.5 ? WHITE : CYAN);
    }
    const size = 16 + 4 * Math.sin(this.t * 20);
    const m = ctx.getTransform();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    const dx = m.a * p.x + m.e;
    const dy = m.d * p.y + m.f;
    stampAt(ctx, glowStamp(WHITE, size * m.a), dx, dy);
    stampAt(ctx, glowStamp(CYAN, size * 1.6 * m.a), dx, dy);
    ctx.restore();
  }
}
