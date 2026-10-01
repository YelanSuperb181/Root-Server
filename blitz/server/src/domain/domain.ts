// Blitz's domain, server side. The server owns the one true Blitz: it runs the
// shared physics, decides who's holding it, picks its tricks, cracks and
// bursts its bubble, and tells every open domain window what happened.
// Windows predict motion with the same physics between messages, so the
// server only speaks when something changes (a grab, a throw, a poke, a hit,
// a trick, a burst) plus a gentle keyframe every few seconds.

import { rootServer, ChannelGuid, Client, ClientEvent } from "@rootsdk/server-app";
import { BlitzDomainServiceBase } from "@blitz/gen-server";
import {
  DragRequest,
  GrabRequest,
  GrabResponse,
  JoinRequest,
  JoinResponse,
  MessageEvent,
  PokeRequest,
  ReformRequest,
  ReleaseRequest,
  SayRequest,
  StateEvent,
  Watcher,
  BlitzState,
} from "@blitz/gen-shared";
import {
  BURST_COAST,
  Body,
  FLING_COAST,
  FLING_SPEED,
  Forces,
  OPEN_FOR,
  Reaction,
  SLEEP_AFTER,
  STEP,
  Trick,
  TrickKind,
  Point,
  burstLaunch,
  clampTarget,
  idleTrick,
  isBursting,
  isSplash,
  landingPoint,
  pokeImpulse,
  readMessage,
  sanitize,
  step,
  trickAge,
} from "@blitz/shared";
import { config } from "../config";
import { read } from "../core/api";
import { errMessage, log } from "../core/log";
import { isPerson, nickname } from "../core/members";
import { findBlockedWord } from "../logic/automod";
import { think } from "./brain";
import { recentTalk, rememberTalk } from "./memory";

const TICK_MS = 1000 / 60;
/** While someone holds Blitz, everyone else gets its position this often. */
const HELD_BROADCAST_MS = 1000 / 12;
/** A correction for drift between windows, while anyone is watching. */
const KEYFRAME_MS = 2500;
/** A holder whose window stops sending (closed tab, lost signal) lets go. */
const HOLD_TIMEOUT_MS = 3000;
/** Rim hits are announced at most this often. */
const IMPACT_BROADCAST_MS = 150;
/** A message flies over to Blitz before it reacts, in seconds. */
const REACT_DELAY = 0.7;
/** Once Blitz has thought it over, how soon it reacts. */
const ANSWER_DELAY = 0.15;
/** Seconds between Blitz's own little tricks, when nobody's playing with it. */
const IDLE_TRICK_MIN = 9;
const IDLE_TRICK_SPREAD = 10;
/** One message into the domain per person this often, in ms. */
const SAY_COOLDOWN_MS = 1200;
/** Longest message shown in the domain. */
export const MAX_SAY = 160;

const clock = () => performance.now() / 1000;

interface Holder {
  userId: string;
  nickname: string;
  target: { x: number; y: number };
  lastSeen: number;
}

export interface Heard {
  /** Ties the "thinking" announcement to the reaction that follows it. */
  id: string;
  userId: string;
  nickname: string;
  /** What they said, ready to show. */
  text: string;
  /** Chat channel it came from; empty when typed in the domain. */
  channelName: string;
}

class Domain {
  body: Body = { x: 0, y: 0, vx: 0, vy: 0, strain: 0 };
  asleep = false;
  open = false;
  /** In open space, the spot Blitz drifts around. */
  anchor: Point = { x: 0, y: 0 };
  holder: Holder | undefined;
  trick: Trick | undefined;
  flingUntil = 0;
  lastInteraction = clock();
  seq = 0;
  simulatedUntil = clock();
  watchers = new Map<string, string>(); // userId -> nickname
  channelId: string | undefined;
  channelName = "blitz-domain";

  private timer: ReturnType<typeof setInterval> | undefined;
  private lastHeldBroadcast = 0;
  private lastKeyframe = 0;
  private lastImpactBroadcast = 0;
  private nextIdleTrick = clock() + IDLE_TRICK_MIN;
  private lastSaid = new Map<string, number>();
  /** Messages Blitz is still thinking about: when their mote lands in the domain. */
  private listening = new Map<string, number>();

  state(): BlitzState {
    return {
      x: this.body.x,
      y: this.body.y,
      vx: this.body.vx,
      vy: this.body.vy,
      simTime: this.simulatedUntil,
      asleep: this.asleep,
      holderUserId: this.holder?.userId ?? "",
      holderNickname: this.holder?.nickname ?? "",
      targetX: this.holder?.target.x ?? 0,
      targetY: this.holder?.target.y ?? 0,
      flingUntil: this.flingUntil,
      seq: ++this.seq,
      strain: this.body.strain ?? 0,
      open: this.open,
      trick: this.trick?.kind ?? "",
      trickStart: this.trick?.start ?? 0,
      trickX: this.trick?.x ?? 0,
      trickY: this.trick?.y ?? 0,
      trickDir: this.trick?.dir ?? 1,
      anchorX: this.anchor.x,
      anchorY: this.anchor.y,
    };
  }

  watcherList(): Watcher[] {
    return [...this.watchers].map(([userId, nick]) => ({ userId, nickname: nick }));
  }

  private forces(t: number): Forces {
    return { t, target: this.holder?.target, asleep: this.asleep, flingUntil: this.flingUntil, trick: this.trick, open: this.open, anchor: this.anchor };
  }

  /** Simulates up to now, in fixed steps. */
  catchUp(): void {
    const now = clock();
    // Nobody was watching: don't replay the gap, just carry on from here.
    if (now - this.simulatedUntil > 2) this.simulatedUntil = now - STEP;
    while (this.simulatedUntil + STEP <= now) {
      const hit = step(this.body, this.forces(this.simulatedUntil));
      this.simulatedUntil += STEP;
      if (!this.open && this.holder && isBursting(this.body)) {
        this.burst();
        continue;
      }
      if (hit && isSplash(hit) && now * 1000 - this.lastImpactBroadcast > IMPACT_BROADCAST_MS) {
        this.lastImpactBroadcast = now * 1000;
        this.announce("impact");
      }
    }
    if (this.trick && this.simulatedUntil > this.trick.start && trickAge(this.trick, this.simulatedUntil) === undefined) this.trick = undefined;
  }

  touch(): void {
    this.lastInteraction = clock();
    if (this.asleep) {
      this.asleep = false;
      this.announce("wake");
    }
  }

  tick(): void {
    this.catchUp();
    const now = clock();
    const nowMs = now * 1000;
    if (this.holder && nowMs - this.holder.lastSeen * 1000 > HOLD_TIMEOUT_MS) this.release(this.holder.userId);
    if (this.open && !this.holder && now - this.lastInteraction > OPEN_FOR) this.reform();
    if (!this.holder && !this.asleep && now - this.lastInteraction > SLEEP_AFTER) {
      this.asleep = true;
      this.trick = undefined;
      this.announce("sleep");
    }
    if (!this.holder && !this.asleep && !this.trick && now > this.nextIdleTrick) {
      this.startTrick(idleTrick(), 0, "trick");
    }
    if (this.holder && nowMs - this.lastHeldBroadcast > HELD_BROADCAST_MS) {
      this.lastHeldBroadcast = nowMs;
      this.announce("drag", this.holder.userId, this.holder.nickname);
    }
    if (nowMs - this.lastKeyframe > KEYFRAME_MS) {
      this.lastKeyframe = nowMs;
      this.announce("keyframe");
    }
  }

  ensureRunning(): void {
    if (this.watchers.size > 0 && !this.timer) {
      this.simulatedUntil = clock();
      this.timer = setInterval(() => {
        try {
          this.tick();
        } catch (err) {
          log("warn", "domain tick failed", { error: errMessage(err) });
        }
      }, TICK_MS);
    } else if (this.watchers.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      // Everyone left: the next visitor finds Blitz back in a whole bubble.
      this.holder = undefined;
      this.trick = undefined;
      if (this.open) {
        this.open = false;
        this.anchor = { x: 0, y: 0 };
        this.body = { ...sanitize(this.body), strain: 0 };
      }
    }
  }

  announce(cause: string, byUserId = "", byNickname = ""): void {
    if (this.watchers.size === 0) return;
    const event: StateEvent = { state: this.state(), cause, byUserId, byNickname };
    try {
      domainService.broadcastState(event, "all");
    } catch (err) {
      log("warn", "domain broadcast failed", { cause, error: errMessage(err) });
    }
  }

  announceWatchers(): void {
    try {
      domainService.broadcastWatchers({ watchers: this.watcherList() }, "all");
    } catch (err) {
      log("warn", "watcher broadcast failed", { error: errMessage(err) });
    }
  }

  async addWatcher(userId: string): Promise<void> {
    if (!isPerson(userId) || this.watchers.has(userId)) return;
    this.watchers.set(userId, "someone");
    this.ensureRunning();
    this.watchers.set(userId, await nickname(userId));
    this.announceWatchers();
  }

  removeWatcher(userId: string): void {
    if (!this.watchers.delete(userId)) return;
    if (this.holder?.userId === userId) this.release(userId);
    this.announceWatchers();
    this.ensureRunning();
  }

  /** Starts a trick `delay` seconds from now, from wherever Blitz is. */
  startTrick(kind: TrickKind, delay: number, cause: string, byUserId = "", byNickname = ""): void {
    this.trick = { kind, start: this.simulatedUntil + delay, x: this.body.x, y: this.body.y, dir: Math.random() < 0.5 ? -1 : 1 };
    this.nextIdleTrick = clock() + delay + IDLE_TRICK_MIN + Math.random() * IDLE_TRICK_SPREAD;
    this.announce(cause, byUserId, byNickname);
  }

  grab(userId: string, at: { x: number; y: number }): boolean {
    this.catchUp();
    if (this.holder && this.holder.userId !== userId) return false;
    this.touch();
    this.trick = undefined;
    this.holder = { userId, nickname: this.watchers.get(userId) ?? "someone", target: clampTarget(at, this.open), lastSeen: clock() };
    this.announce("grab", userId, this.holder.nickname);
    return true;
  }

  drag(userId: string, target: { x: number; y: number }): void {
    if (this.holder?.userId !== userId) return;
    this.catchUp();
    // The catch-up may have burst the bubble and knocked Blitz out of their hand.
    if (this.holder?.userId !== userId) return;
    this.holder.target = clampTarget(target, this.open);
    this.holder.lastSeen = clock();
    this.lastInteraction = clock();
  }

  /** Lets go. With a body from the holder's window, Blitz flies off exactly as they threw it. */
  release(userId: string, thrown?: Body): void {
    if (this.holder?.userId !== userId) return;
    this.catchUp();
    if (this.holder?.userId !== userId) return;
    const by = this.holder;
    this.holder = undefined;
    if (thrown) {
      this.body = { ...sanitize(thrown, this.open), strain: this.body.strain ?? 0 };
      if (Math.hypot(this.body.vx, this.body.vy) > FLING_SPEED) this.flingUntil = this.simulatedUntil + FLING_COAST;
    }
    // Out in open space Blitz settles wherever it's flung or let go.
    if (this.open) this.anchor = landingPoint(this.body);
    this.touch();
    this.announce("release", by.userId, by.nickname);
  }

  poke(userId: string, angle: number): void {
    if (this.holder) return;
    this.catchUp();
    this.touch();
    this.trick = undefined;
    const push = pokeImpulse(Number.isFinite(angle) ? angle : 0);
    this.body.vx += push.vx;
    this.body.vy += push.vy;
    this.announce("poke", userId, this.watchers.get(userId) ?? "someone");
  }

  /** The wall gave way: the bubble bursts, knocks Blitz out of the holder's hand and flings it free. */
  private burst(): void {
    const by = this.holder;
    this.holder = undefined;
    this.trick = undefined;
    burstLaunch(this.body);
    this.open = true;
    this.anchor = landingPoint(this.body);
    this.flingUntil = this.simulatedUntil + BURST_COAST;
    this.lastInteraction = clock();
    log("info", "the bubble burst", { by: by?.nickname });
    this.announce("burst", by?.userId ?? "", by?.nickname ?? "");
  }

  /** Puts the bubble back together around Blitz, wherever it is. */
  reform(byUserId = "", byNickname = ""): void {
    if (!this.open) return;
    this.catchUp();
    this.open = false;
    this.anchor = { x: 0, y: 0 };
    this.trick = undefined;
    const inside = sanitize(this.body);
    this.body = { x: inside.x, y: inside.y, vx: inside.vx * 0.3, vy: inside.vy * 0.3, strain: 0 };
    if (this.holder) this.holder.target = clampTarget(this.holder.target);
    this.announce("reform", byUserId, byNickname);
  }

  /** `!blitz` in chat: everyone already inside sees Blitz light up and spin. */
  summon(byUserId: string, byNickname: string): void {
    this.catchUp();
    this.touch();
    if (this.holder) this.announce("summon", byUserId, byNickname);
    else this.startTrick("spin", 0, "summon", byUserId, byNickname);
  }

  /** What Blitz's brain needs to know about Blitz right now. */
  status(): { asleep: boolean; open: boolean; watching: number } {
    return { asleep: this.asleep, open: this.open, watching: this.watchers.size };
  }

  /** Someone said something to Blitz: everyone in the domain sees it fly over while Blitz thinks. */
  listen(h: Heard): void {
    if (this.watchers.size === 0) return;
    this.catchUp();
    const landsAt = this.simulatedUntil + REACT_DELAY;
    this.listening.set(h.id, landsAt);
    this.broadcastMessage({
      id: h.id,
      thinking: true,
      fromUserId: h.userId,
      fromNickname: h.nickname,
      text: h.text,
      channelName: h.channelName,
      mood: "",
      say: "",
      reactAt: landsAt,
    });
  }

  /** Blitz's reaction to something it heard: its face, its words, and what it does. */
  respond(h: Heard, reaction: Reaction): void {
    const landsAt = this.listening.get(h.id);
    this.listening.delete(h.id);
    if (this.watchers.size === 0) return;
    this.catchUp();
    const reactAt = Math.max(this.simulatedUntil + ANSWER_DELAY, landsAt ?? this.simulatedUntil + REACT_DELAY);
    this.broadcastMessage({
      id: h.id,
      thinking: false,
      fromUserId: h.userId,
      fromNickname: h.nickname,
      text: h.text,
      channelName: h.channelName,
      mood: reaction.mood,
      say: reaction.say,
      reactAt,
    });
    if (reaction.mood === "sleepy") {
      // Blitz yawns and dozes off where it is.
      this.trick = undefined;
      this.asleep = true;
      this.lastInteraction = clock();
      this.announce("sleep", h.userId, h.nickname);
      return;
    }
    this.touch();
    if (!this.holder && reaction.trick) this.startTrick(reaction.trick, reactAt - this.simulatedUntil, "trick", h.userId, h.nickname);
  }

  private broadcastMessage(message: MessageEvent): void {
    try {
      domainService.broadcastMessage(message, "all");
    } catch (err) {
      log("warn", "message broadcast failed", { error: errMessage(err) });
    }
  }

  /** Something typed into the domain itself. Blitz thinks it over (with Claude when it can) and answers out loud. */
  async say(userId: string, raw: string): Promise<void> {
    const now = Date.now();
    if (now - (this.lastSaid.get(userId) ?? 0) < SAY_COOLDOWN_MS) return;
    const text = raw.replace(/\s+/g, " ").trim().slice(0, MAX_SAY);
    if (!text || findBlockedWord(text, config.automod.blockedWords) !== undefined) return;
    this.lastSaid.set(userId, now);
    const heard: Heard = { id: `domain-${now}-${Math.random().toString(36).slice(2, 8)}`, userId, nickname: this.watchers.get(userId) ?? "someone", text, channelName: "" };
    this.listen(heard);
    const smart = await think({ from: heard.nickname, text, channel: "", chat: [], memory: recentTalk("domain"), ...this.status() });
    if (smart) rememberTalk("domain", heard.nickname, text, smart.say);
    this.respond(heard, smart ?? readMessage(text));
  }
}

export const domain = new Domain();

class BlitzDomainService extends BlitzDomainServiceBase {
  async join(_request: JoinRequest, client: Client): Promise<JoinResponse> {
    await domain.addWatcher(client.userId);
    domain.catchUp();
    return { state: domain.state(), watchers: domain.watcherList() };
  }

  async grab(request: GrabRequest, client: Client): Promise<GrabResponse> {
    await domain.addWatcher(client.userId);
    const ok = domain.grab(client.userId, { x: request.x, y: request.y });
    return { ok, state: domain.state() };
  }

  async drag(request: DragRequest, client: Client): Promise<void> {
    domain.drag(client.userId, { x: request.targetX, y: request.targetY });
  }

  async release(request: ReleaseRequest, client: Client): Promise<void> {
    domain.release(client.userId, { x: request.x, y: request.y, vx: request.vx, vy: request.vy });
  }

  async poke(request: PokeRequest, client: Client): Promise<void> {
    await domain.addWatcher(client.userId);
    domain.poke(client.userId, request.angle);
  }

  async say(request: SayRequest, client: Client): Promise<void> {
    await domain.addWatcher(client.userId);
    void domain.say(client.userId, request.text ?? "").catch((err) => log("warn", "domain message failed", { error: errMessage(err) }));
  }

  async reform(_request: ReformRequest, client: Client): Promise<void> {
    await domain.addWatcher(client.userId);
    domain.reform(client.userId, domain.watchers.get(client.userId) ?? "someone");
  }
}

export const domainService = new BlitzDomainService();

/** Hooks the domain up to Root: who has it open, and which channel it lives in. */
export async function initDomain(channelId: string): Promise<void> {
  domain.channelId = channelId;
  try {
    const channel = await read("channels.get", () => rootServer.community.channels.get({ id: channelId as ChannelGuid }));
    domain.channelName = channel.name || domain.channelName;
  } catch (err) {
    log("warn", "couldn't read the domain channel", { error: errMessage(err) });
  }
  rootServer.clients.on(ClientEvent.UserAttached, (c: Client) => void domain.addWatcher(c.userId));
  rootServer.clients.on(ClientEvent.UserDetached, (c: Client) => domain.removeWatcher(c.userId));
  for (const c of rootServer.clients.getClients()) await domain.addWatcher(c.userId);
}
