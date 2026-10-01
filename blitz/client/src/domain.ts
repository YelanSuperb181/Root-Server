// The domain window: draws Blitz and its world, turns pointer input into
// grabs, throws and pokes, keeps the local Blitz in step with the server's, and
// decides how Blitz looks and feels from moment to moment.
//
// Physics runs in domain units (the bubble's radius is 1) through
// @blitz/shared, the same code the server runs. Everything visual (the
// universe, faces, emotes, particles, ripples, cracks, the shatter) is local
// decoration on top. Inside the bubble the camera holds still; once the
// bubble bursts it follows Blitz through open space.

import type { MessageEvent, StateEvent, Watcher, BlitzState } from "@blitz/gen-shared";
import {
  BURST_COAST,
  Body,
  FLING_COAST,
  FLING_SPEED,
  Impact,
  MOODS,
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
  advance,
  burstLaunch,
  clampTarget,
  hash32,
  idleTrick,
  isBursting,
  isSplash,
  isTrick,
  landingPoint,
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
  glowSprite,
  makeCrack,
  mixCam,
  rand,
  rgba,
  toScreen,
  toWorld,
} from "./fx";
import type { DomainLink } from "./net";
import { Universe } from "./universe";
import { Brows, Eyes, Look, Mouth, drawBlitz, drawCrackle, drawHalo } from "./blitz";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const now = () => performance.now() / 1000;
const pick = <T>(list: readonly T[]): T => list[(Math.random() * list.length) | 0];
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Particle speeds were tuned in pixels on a 250px domain; this turns them into domain units. */
const PX = 1 / 250;

const CYAN: RGB = [150, 235, 255];
const VIOLET: RGB = [200, 168, 255];
const GOLD: RGB = [255, 214, 120];
const PINK: RGB = [255, 140, 200];
const WHITE: RGB = [255, 255, 255];
const DUST: RGB = [176, 186, 210];

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
/** The first moments after the burst play in slow motion. */
const SLOW_MO = 0.35;
/** How far Blitz's light reaches across open space, in domain units. */
const LIGHT_REACH = 3.2;

/** How one rock looks: its lumpy outline, craters and crystals, all from its id. */
interface RockLook {
  verts: number[];
  craters: Array<[number, number, number]>;
  crystals: Array<[number, number, boolean]>;
  warm: number;
}

export interface DomainUi {
  status: HTMLElement;
  watchers: HTMLElement;
  card: HTMLElement;
  cardName: HTMLElement;
  cardWhere: HTMLElement;
  cardText: HTMLElement;
}

/** A way for a solo domain to ask Claude how Blitz reacts (the browser prototype has one). */
export type SoloBrain = (situation: Situation) => Promise<Reaction | undefined>;

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
  /** Called when the bubble bursts or re-forms; `byMe` when this viewer burst it. */
  onOpenChange: ((open: boolean, byMe: boolean) => void) | undefined;
  /** Called before the universe folds back into the bubble (to leave fullscreen first). */
  beforeReform: (() => Promise<void>) | undefined;
  /** When set, a solo domain asks it how Blitz reacts to what's typed in. */
  brain: SoloBrain | undefined;

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

  // Shared state (domain units, server clock)
  private body: Body = { x: 0, y: 0, vx: 0, vy: 0, strain: 0 };
  private clockOffset = 0;
  private haveClock = false;
  private simulatedUntil = 0;
  private asleep = false;
  private open = false;
  private anchor: Point = { x: 0, y: 0 };
  private flingUntil = 0;
  private trick: Trick | undefined;
  private holder: { userId: string; nickname: string } | undefined;
  private remoteTarget: Point | undefined;
  private lastInteraction = 0;
  private watchers: Watcher[] = [];
  private nextIdleTrick = 0;

  // Me
  private pointer = { x: 0, y: 0, cx: 0, cy: 0, inside: false, down: false, dragging: false, downAt: 0, downX: 0, downY: 0 };
  private samples: Array<{ x: number; y: number; at: number }> = [];
  private holding = false;
  private lastDragSent = 0;
  private notice = "";
  private noticeUntil = 0;
  private soloTalk: Array<{ from: string; text: string; blitz: string }> = [];

  // Looks
  private t = 0;
  /** Effects time: runs slower for a moment after the burst. */
  private fxT = 0;
  private slowUntil = -1;
  private gaze = { x: 0, y: 0 };
  private lookAt: { x: number; y: number; until: number } | undefined;
  private blinkUntil = 0;
  private nextBlink = 2;
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
  private rockLooks = new Map<number, RockLook>();
  private rockHits = new Map<number, { born: number; power: number; x: number; y: number }>();
  /** Extra static after a hit or the burst, fading out. */
  private zap = 0;
  /** A screen point Blitz is watching for a moment (a shooting star). */
  private watch: { x: number; y: number; until: number } | undefined;
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
    this.universe.onShootingStar = (x, y) => this.noticeShootingStar(x, y);
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
  start(initial?: BlitzState, watchers?: Watcher[]): void {
    if (initial) {
      this.syncClock(initial.simTime);
      this.adopt(initial, false);
      if (this.open) {
        this.follow = { fx: this.body.x, fy: this.body.y, s: 0 };
        this.setLayout(true);
      }
    }
    if (watchers) this.setWatchers(watchers);
    this.summonMotes();
    requestAnimationFrame((ms) => this.frame(ms));
  }

  /** Takes a server state as the truth, advanced to now. `smooth` hides the jump (up to `maxJump`). */
  private adopt(s: BlitzState, smooth: boolean, maxJump = 0.3): void {
    this.asleep = s.asleep;
    this.flingUntil = s.flingUntil;
    this.open = s.open;
    this.anchor = { x: s.anchorX, y: s.anchorY };
    this.holder = s.holderUserId ? { userId: s.holderUserId, nickname: s.holderNickname || "someone" } : undefined;
    this.remoteTarget = this.holder && this.holder.userId !== this.link.me ? { x: s.targetX, y: s.targetY } : undefined;
    this.trick = s.trick && isTrick(s.trick) ? { kind: s.trick, start: s.trickStart, x: s.trickX, y: s.trickY, dir: s.trickDir } : undefined;
    if (this.holding) return; // My own hand is the truth while I hold Blitz.

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

  private forces(target: Point | undefined) {
    return { target, asleep: this.asleep, flingUntil: this.flingUntil, trick: this.trick, open: this.open, anchor: this.anchor };
  }

  private applyEvent(e: StateEvent): void {
    if (!e.state) return;
    this.syncClock(e.state.simTime);
    const me = this.link.me;
    const byMe = e.byUserId !== "" && e.byUserId === me;
    const byOther = e.byUserId !== "" && !byMe;
    // The burst knocks Blitz out of whoever's hand; the server letting go of me (timeout) ends my hold too.
    if (this.holding && (e.cause === "burst" || (e.cause === "release" && byMe))) this.dropHold();
    const wasOpen = this.open;
    const before = { x: this.body.x + this.renderOffset.x, y: this.body.y + this.renderOffset.y };
    this.adopt(e.state, true, e.cause === "reform" ? 0 : 0.3);
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
        this.startBurst(byMe, e.byNickname || "someone");
        break;
      case "reform":
        this.glideFrom(before);
        void this.startReform(e.byNickname);
        break;
    }
    // Joined mid-burst, or missed the moment: just match the layout.
    if (this.open !== wasOpen && e.cause !== "burst" && e.cause !== "reform") {
      this.setLayout(this.open);
      this.onOpenChange?.(this.open, false);
    }
  }

  private applyMessage(m: MessageEvent): void {
    const mine = m.fromUserId !== "" && m.fromUserId === this.link.me;
    const name = mine ? "You" : m.fromNickname || "someone";
    const where = m.channelName ? `in #${m.channelName}` : "in the domain";
    const delay = Math.max(0.25, Math.min(2, m.reactAt - this.simNow()));
    if (m.thinking) {
      this.showCard(name, where, m.text || "…");
      this.keepCard(30); // up for as long as Blitz ponders
      this.launchMote(delay);
      this.thinking = { id: m.id, since: this.t, landsAt: this.t + delay };
      this.pending = undefined;
      return;
    }
    const mood = (MOODS as readonly string[]).includes(m.mood) ? (m.mood as Mood) : "happy";
    if (m.id !== "" && this.thinking?.id === m.id) {
      // Blitz has made up its mind about the message it was pondering.
      const landsAt = this.thinking.landsAt;
      this.thinking = undefined;
      this.keepCard(4.5);
      this.pending = { mood, say: m.say, at: Math.max(this.t + 0.12, landsAt) };
      return;
    }
    this.showCard(name, where, m.text || "…");
    this.launchMote(delay);
    this.pending = { mood, say: m.say, at: this.t + delay };
  }

  private launchMote(delay: number): void {
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

  /** Something typed into the domain's message box. */
  async say(text: string): Promise<void> {
    const clean = text.replace(/\s+/g, " ").trim().slice(0, 160);
    if (!clean) return;
    if (this.link.mode === "live") {
      this.link.say(clean);
      return;
    }
    const id = `solo-${Date.now()}`;
    const base = { id, fromUserId: "", fromNickname: "You", text: clean, channelName: "", mood: "", say: "" };
    let reaction: Reaction | undefined;
    if (this.brain) {
      this.applyMessage({ ...base, thinking: true, reactAt: this.simNow() + 0.7 });
      reaction = await this.brain({ from: "you", text: clean, channel: "", chat: [], memory: this.soloTalk, asleep: this.asleep, open: this.open, watching: 1 }).catch(() => undefined);
      if (reaction) {
        this.soloTalk.push({ from: "you", text: clean, blitz: reaction.say });
        if (this.soloTalk.length > 6) this.soloTalk.shift();
      }
    }
    reaction ??= readMessage(clean);
    this.applyMessage({ ...base, thinking: false, mood: reaction.mood, say: reaction.say, reactAt: this.simNow() + (this.brain ? 0.1 : 0.7) });
    if (reaction.mood === "sleepy") {
      this.asleep = true;
      this.trick = undefined;
      this.yawnUntil = this.t + 1.4;
      return;
    }
    this.wake();
    const delay = this.pending ? Math.max(0.1, this.pending.at - this.t) : 0.7;
    if (!this.holding && reaction.trick) this.startTrickLocal(reaction.trick, delay);
  }

  /** Puts the bubble back together. */
  seal(): void {
    if (!this.open || this.reforming) return;
    if (this.link.mode === "live") {
      this.link.reform();
      return;
    }
    const before = { x: this.body.x, y: this.body.y };
    this.open = false;
    this.anchor = { x: 0, y: 0 };
    this.trick = undefined;
    const inside = sanitize(this.body);
    this.body = { x: inside.x, y: inside.y, vx: inside.vx * 0.3, vy: inside.vy * 0.3, strain: 0 };
    this.glideFrom(before);
    void this.startReform("");
  }

  get isOpen(): boolean {
    return this.open;
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
      const p = this.toDomain(e.clientX, e.clientY);
      Object.assign(this.pointer, p, { cx: e.clientX, cy: e.clientY, inside: true });
      if (!this.overBlitz(p) || this.trans) return;
      if (this.holder && this.holder.userId !== this.link.me) {
        this.setNotice(`${this.holder.nickname} has Blitz`, 1.5);
        return;
      }
      this.wake();
      c.setPointerCapture(e.pointerId);
      Object.assign(this.pointer, { down: true, dragging: false, downAt: performance.now(), downX: p.x, downY: p.y });
      this.samples = [{ ...p, at: performance.now() }];
    });

    c.addEventListener("pointermove", (e) => {
      const p = this.toDomain(e.clientX, e.clientY);
      Object.assign(this.pointer, p, { cx: e.clientX, cy: e.clientY });
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
    this.holder = { userId: this.link.me, nickname: "you" };
    this.reactGrab();
    const at = clampTarget({ x: this.pointer.x, y: this.pointer.y }, this.open);
    void this.link.grab(at.x, at.y).then((res) => {
      if (res.ok) return;
      // Someone else got there first.
      this.dropHold();
      if (res.event) this.applyEvent(res.event);
      if (this.holder && this.holder.userId !== this.link.me) this.setNotice(`${this.holder.nickname} has Blitz`, 1.5);
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

  private throwBlitz(): void {
    const s = this.samples;
    const a = s[0];
    const b = s[s.length - 1];
    const dt = Math.max(0.016, (b.at - a.at) / 1000);
    const strain = this.body.strain ?? 0;
    this.body = { ...sanitize({ x: this.body.x, y: this.body.y, vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt }, this.open), strain };
    const fast = Math.hypot(this.body.vx, this.body.vy) > FLING_SPEED;
    if (fast) this.flingUntil = this.simNow() + FLING_COAST;
    // Out in open space Blitz settles wherever it's flung (the server works it out the same way).
    if (this.open) this.anchor = landingPoint(this.body);
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

  private summonFx(by: string): void {
    this.setNotice(`summoned by ${by}!`, 3);
    this.speak(pick(["you called?", "✨ i'm here ✨", "hiii!"]));
    this.particles.burst(this.body.x, this.body.y, reduced ? 12 : 40, 320 * PX, [CYAN, VIOLET, GOLD]);
    this.wobble = 1;
  }

  private impact(hit: Impact): void {
    if (this.t - this.lastImpact < 0.12) return;
    this.lastImpact = this.t;
    const { nx, ny, speed } = hit;
    const pxSpeed = speed * 250; // tuned in pixels on a 250px-radius domain
    const power = Math.max(0.25, Math.min(1, pxSpeed / 1300));
    this.zap = Math.max(this.zap, power);
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
    if (!this.layoutOpen || this.trans || this.asleep || this.holding || this.mood || this.thinking || this.speech) return;
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
  private startBurst(byMe: boolean, by: string): void {
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
    this.zap = 1.5;
    if (!reduced) this.shake = 1.6;
    this.cracks = [];
    this.crackLevel = 0;
    this.particles.burst(this.body.x, this.body.y, reduced ? 24 : 90, 700 * PX, [CYAN, VIOLET, WHITE, GOLD], undefined, undefined, 1.4);
    this.applyMood("excited", pick(["WHEEEEE!!", "FREEDOM!!", "I'M FREE!!", "WOOOOO!"]), 3.5);
    this.setNotice(byMe ? "you burst the bubble!" : `${by} burst the bubble!`, 3);
    this.onOpenChange?.(true, byMe);
  }

  /**
   * The bubble re-forms. First (still full-window) the universe folds back
   * in toward where the bubble will be, its glass gathering out of the dark
   * while the camera glides home; then the window settles back around it.
   */
  private async startReform(by: string | undefined): Promise<void> {
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
      if (by) this.setNotice(`${by} sealed the bubble`, 2.5);
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
    this.onOpenChange?.(false, false);
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
      this.anchor = landingPoint(this.body);
      this.flingUntil = nowSim + BURST_COAST;
      this.lastInteraction = nowSim;
      this.startBurst(true, "you");
      return;
    }
    if (this.holding || this.trans) return;
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
    // Fullscreen canvases are big; a slightly softer resolution keeps them smooth.
    this.dpr = Math.min(window.devicePixelRatio || 1, this.layoutOpen ? 1.5 : 2);
    this.W = rect.width;
    this.H = rect.height;
    this.rectLeft = rect.left;
    this.rectTop = rect.top;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
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
    this.cam = this.layoutOpen ? this.followCam(dt) : this.bubbleCam();
  }

  private prevFrame = performance.now();

  private frame(ms: number): void {
    const dt = Math.min(0.05, (ms - this.prevFrame) / 1000);
    this.prevFrame = ms;
    this.t += dt;
    const slow = this.t < this.slowUntil ? 0.3 + 0.7 * clamp01(1 - (this.slowUntil - this.t) / SLOW_MO) ** 2 : 1;
    this.fxT += dt * slow;
    this.simulate();
    this.updateCam(dt);
    this.updateLooks(dt);
    this.updateStatus();
    this.draw(dt, dt * slow);
    requestAnimationFrame((next) => this.frame(next));
  }

  private holdTarget(): Point | undefined {
    if (!this.holding) return this.remoteTarget;
    // The camera may have moved under a still pointer; aim where the pointer is now.
    const p = this.toDomain(this.pointer.cx, this.pointer.cy);
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    return clampTarget(p, this.open);
  }

  private simulate(): void {
    const target = this.holdTarget();
    const until = this.simNow();
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
    // Holding still still counts as holding; and in open space the camera can move the aim.
    if (this.holding && target && (this.t - this.lastDragSent > 0.5 || this.layoutOpen)) {
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
    const trickNow = this.trick && trickAge(this.trick, this.simNow()) !== undefined ? this.trick.kind : undefined;
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
    let tintTarget: RGB = this.mood ? TINTS[this.mood] : this.thinking ? TINTS.curious : trickNow ? TINTS[TRICK_MOOD[trickNow]] : this.asleep ? TINTS.sleepy : CALM;
    if (!this.mood && trickNow) tintTarget = [(tintTarget[0] + CALM[0]) / 2, (tintTarget[1] + CALM[1]) / 2, (tintTarget[2] + CALM[2]) / 2];
    if (strain > 0) tintTarget = [tintTarget[0] + (255 - tintTarget[0]) * strain * 0.6, tintTarget[1] + (255 - tintTarget[1]) * strain * 0.6, tintTarget[2] + (255 - tintTarget[2]) * strain * 0.6];
    const k = Math.min(1, dt * 4);
    this.tint = [this.tint[0] + (tintTarget[0] - this.tint[0]) * k, this.tint[1] + (tintTarget[1] - this.tint[1]) * k, this.tint[2] + (tintTarget[2] - this.tint[2]) * k];

    this.wobble *= Math.exp(-3 * dt);
    this.zap *= Math.exp(-2.5 * dt);
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
          this.particles.emit(
            o.x + Math.cos(a) * r,
            o.y + Math.sin(a) * r,
            -this.body.vx * 0.12 + rand(-20, 20) * PX,
            -this.body.vy * 0.12 + rand(-20, 20) * PX,
            0.6 + Math.random() * 0.9,
            0.8 + Math.random() * 1.8,
            Math.random() < 0.25 ? VIOLET : this.tint,
          );
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
    if (this.holding || this.holder) {
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
    const trickNow = this.trick && trickAge(this.trick, this.simNow()) !== undefined ? this.trick : undefined;
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
      const u = (this.simNow() - trickNow.start) / TRICKS.spin;
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
    else if (this.trans?.kind === "reform") s = "sealing the bubble…";
    else if (t < this.bonkUntil) s = "bonk!";
    else if (t < this.dizzyUntil) s = "dizzy…";
    else if (this.holding) s = strain > 0.15 ? "the wall is cracking…" : this.open ? "carrying Blitz through space" : "held by you";
    else if (this.holder) s = strain > 0.15 ? `${this.holder.nickname} is cracking the wall…` : `held by ${this.holder.nickname}`;
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
    ctx.clearRect(0, 0, W, H);
    const sx = this.shake > 0.01 ? (Math.random() - 0.5) * 9 * this.shake : 0;
    const sy = this.shake > 0.01 ? (Math.random() - 0.5) * 9 * this.shake : 0;
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
      const view = { alpha: 1, vignette: true, shooting: !tr };
      if (reveal !== undefined) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, reveal, 0, Math.PI * 2);
        ctx.clip();
        this.universe.draw(ctx, W, H, this.cam, t, dt, view);
        this.drawRocks();
        ctx.restore();
        this.drawRevealRing(cx, cy, reveal, tr!.kind === "burst" ? clamp01((t - tr!.start) / REVEAL) : clamp01((t - tr!.start) / GATHER));
      } else {
        this.universe.draw(ctx, W, H, this.cam, t, dt, view);
        this.drawRocks();
      }
      if (tr?.kind === "reform") this.drawRim(cx, cy, wallR, clamp01((t - tr.start) / GATHER), 0);
    } else {
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
      if (!reduced) drawCrackle(ctx, look, this.crackle(), t);
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
    this.drawHolderTag(look);
    if (this.thinking && t >= this.thinking.landsAt && look.r > 0.5) drawThought(ctx, look, t - this.thinking.landsAt, W);
    else if (this.speech && look.r > 0.5) {
      drawSpeech(ctx, this.speech.text, look, t - this.speech.born, this.speech.life, W, H, this.font);
      if (t - this.speech.born > this.speech.life) this.speech = undefined;
    }
    if (this.mote) this.drawMote();
    ctx.restore();
    this.shatter.draw(ctx, W, H, this.fxT, fxDt);
  }

  private rockLook(id: number): RockLook {
    let look = this.rockLooks.get(id);
    if (look) return look;
    const u = (n: number) => unit(hash32(id, n, 7));
    const n = 18;
    const raw = Array.from({ length: n }, (_, i) => 1 + (u(i) - 0.5) * 0.5);
    const verts = raw.map((v, i) => (raw[(i + n - 1) % n] + 2 * v + raw[(i + 1) % n]) / 4);
    const craters = Array.from({ length: 1 + Math.floor(u(40) * 3) }, (_, k): [number, number, number] => [u(41 + k) * Math.PI * 2, 0.2 + 0.45 * u(50 + k), 0.1 + 0.16 * u(60 + k)]);
    const crystals = Array.from({ length: 2 + Math.floor(u(80) * 2) }, (_, k): [number, number, boolean] => [u(81 + k) * Math.PI * 2, 0.28 + 0.2 * u(90 + k), u(100 + k) < 0.5]);
    look = { verts, craters, crystals, warm: u(110) };
    if (this.rockLooks.size > 400) this.rockLooks.clear();
    this.rockLooks.set(id, look);
    return look;
  }

  /** The rocks around the camera, lit by Blitz's glow on the side that faces it. */
  private drawRocks(): void {
    const { W, H, cam } = this;
    const middle = toWorld(cam, W / 2, H / 2);
    const rocks = rocksNear(middle.x, middle.y, Math.hypot(W, H) / 2 / cam.s + 0.2, this.simNow());
    const blitz = this.drawnBody();
    for (const rock of rocks) this.drawRock(rock, blitz);
  }

  private drawRock(rock: Rock, blitz: Point): void {
    const { ctx, cam, t } = this;
    const [sx, sy] = toScreen(cam, rock.x, rock.y);
    const R = rock.r * cam.s;
    if (sx < -R * 1.6 || sy < -R * 1.6 || sx > this.W + R * 1.6 || sy > this.H + R * 1.6) return;
    const look = this.rockLook(rock.id);
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
    const angle = rock.spin + wobble;
    // Blitz's light, in the rock's own (turning) frame.
    const dx = blitz.x - rock.x;
    const dy = blitz.y - rock.y;
    const dist = Math.hypot(dx, dy) || 1;
    const lit = Math.pow(clamp01(1 - (dist - rock.r) / LIGHT_REACH), 1.6);
    const la = Math.atan2(dy, dx) - angle;
    const lx = dist < 50 ? Math.cos(la) : -0.6;
    const ly = dist < 50 ? Math.sin(la) : -0.8;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    const n = look.verts.length;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = R * look.verts[i];
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    const body = ctx.createRadialGradient(lx * R * 0.45, ly * R * 0.45, R * 0.05, 0, 0, R * 1.25);
    body.addColorStop(0, look.warm < 0.5 ? "#6E7795" : "#7A6E86");
    body.addColorStop(0.45, look.warm < 0.5 ? "#353B53" : "#3C3448");
    body.addColorStop(1, "#0D0E16");
    ctx.fillStyle = body;
    ctx.fill();
    ctx.save();
    ctx.clip();
    for (const [a, d, cr] of look.craters) {
      const px = Math.cos(a) * d * R;
      const py = Math.sin(a) * d * R;
      ctx.fillStyle = "rgba(4, 5, 12, 0.32)";
      ctx.beginPath();
      ctx.arc(px, py, cr * R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(220, 230, 255, 0.10)";
      ctx.lineWidth = Math.max(0.6, R * 0.03);
      ctx.beginPath();
      ctx.arc(px, py, cr * R, Math.atan2(ly, lx) + Math.PI * 0.6, Math.atan2(ly, lx) + Math.PI * 1.4);
      ctx.stroke();
    }
    if (lit > 0.01 || flash > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(lx * R, ly * R, 0, lx * R, ly * R, R * 1.5);
      glow.addColorStop(0, rgba(this.tint, 0.55 * lit + 0.5 * flash));
      glow.addColorStop(1, rgba(this.tint, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(-R * 1.6, -R * 1.6, R * 3.2, R * 3.2);
    }
    ctx.restore();
    ctx.strokeStyle = `rgba(170, 195, 240, ${0.12 + 0.35 * lit})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (rock.crystal) {
      // Crystals poking out of the surface, glowing on their own.
      ctx.globalCompositeOperation = "lighter";
      for (const [a, size, cyan] of look.crystals) {
        const i = Math.floor(((a / (Math.PI * 2)) % 1) * n);
        const rr = R * look.verts[i] * 0.86;
        const pulse = 0.7 + 0.3 * Math.sin(t * 2.2 + a * 3);
        const c: RGB = cyan ? [120, 235, 255] : [200, 150, 255];
        ctx.save();
        ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.rotate(a + Math.PI / 2);
        const h = size * R;
        ctx.drawImage(glowSprite(c), -h * 1.2, -h * 1.6, h * 2.4, h * 2.4);
        ctx.fillStyle = rgba(c, 0.85 * pulse);
        ctx.beginPath();
        ctx.moveTo(0, -h);
        ctx.lineTo(h * 0.28, -h * 0.25);
        ctx.lineTo(0, h * 0.2);
        ctx.lineTo(-h * 0.28, -h * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /** How much static Blitz gives off right now: speed, excitement, strain and recent hits. */
  private crackle(): number {
    const speed = Math.hypot(this.body.vx, this.body.vy);
    let c = Math.max(0, (speed - 2.6) / 5) + this.zap * 0.8 + this.shownStrain() * 0.6;
    if (this.mood === "excited") c += 0.35;
    if (this.mood === "grumpy") c += 0.2;
    if (this.asleep) c = 0;
    return Math.min(1.3, c);
  }

  /** The bright edge of the universe as it opens out or folds back in. */
  private drawRevealRing(cx: number, cy: number, r: number, k: number): void {
    const ctx = this.ctx;
    const fade = Math.sin(Math.PI * Math.min(1, k * 1.2));
    if (fade <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const [width, color, blur] of [
      [10, `rgba(127, 227, 255, ${0.35 * fade})`, 30],
      [2, `rgba(235, 250, 255, ${0.9 * fade})`, 12],
    ] as const) {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.shadowColor = "rgba(127, 227, 255, 1)";
      ctx.shadowBlur = blur;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The bubble: the universe seen through dark glass, with a glowing rim. */
  private drawBubble(cx: number, cy: number, r: number, alpha: number, strain: number, dt: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    this.universe.draw(ctx, this.W, this.H, this.cam, this.t, dt, { alpha, vignette: false, shooting: false });
    const glass = ctx.createRadialGradient(cx, cy - r * 0.2, r * 0.05, cx, cy, r);
    glass.addColorStop(0, "rgba(27, 40, 80, 0.35)");
    glass.addColorStop(0.7, "rgba(15, 23, 52, 0.45)");
    glass.addColorStop(1, "rgba(9, 14, 34, 0.8)");
    ctx.fillStyle = glass;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // A curved sheen across the top of the glass, like light on a soap bubble.
    ctx.globalCompositeOperation = "lighter";
    const sheen = ctx.createLinearGradient(cx - r, cy - r, cx, cy);
    sheen.addColorStop(0, "rgba(200, 235, 255, 0.10)");
    sheen.addColorStop(1, "rgba(200, 235, 255, 0)");
    ctx.strokeStyle = sheen;
    ctx.lineWidth = r * 0.07;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.88, Math.PI * 1.08, Math.PI * 1.42);
    ctx.stroke();
    ctx.lineWidth = r * 0.02;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.8, Math.PI * 1.12, Math.PI * 1.22);
    ctx.stroke();
    ctx.restore();
    this.drawRim(cx, cy, r, alpha, strain);
  }

  /** The rim, pushed outward around where Blitz is straining against it, with its slow ring of ticks. */
  private drawRim(cx: number, cy: number, r: number, alpha: number, strain: number): void {
    const { ctx, t } = this;
    if (alpha <= 0) return;
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
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
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
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 2 + 3 * near + strain * 4;
    ctx.strokeStyle = rgba(this.tint, Math.min(1, 0.75 * near * (this.asleep ? 0.6 : 1) + strain * 0.3));
    ctx.shadowColor = rgba(this.tint, 1);
    ctx.shadowBlur = 14 * near + strain * 20;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a - spread, a + spread);
    ctx.stroke();
    ctx.restore();
  }

  /** A thread of light from Blitz to the hand holding it. */
  private drawTether(look: Look): void {
    const target = this.holding ? clampTarget({ x: this.pointer.x, y: this.pointer.y }, this.open) : this.remoteTarget;
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

  /** Whose hand Blitz is in, when it isn't mine. */
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

  /** The message, as a bright mote flying from the card to Blitz. */
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
