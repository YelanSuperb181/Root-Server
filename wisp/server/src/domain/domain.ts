// Wisp's domain, server side. The server owns the one true Wisp: it runs the
// shared physics, decides who's holding it, and tells every open domain
// window what happened. Windows predict motion with the same physics between
// messages, so the server only speaks when something changes (a grab, a
// throw, a poke, a hit on the rim) plus a gentle keyframe every few seconds.

import { rootServer, ChannelGuid, Client, ClientEvent } from "@rootsdk/server-app";
import { WispDomainServiceBase } from "@wisp/gen-server";
import {
  DragRequest,
  GrabRequest,
  GrabResponse,
  JoinRequest,
  JoinResponse,
  PokeRequest,
  ReleaseRequest,
  StateEvent,
  Watcher,
  WispState,
} from "@wisp/gen-shared";
import {
  Body,
  FLING_COAST,
  FLING_SPEED,
  LIMIT,
  SLEEP_AFTER,
  STEP,
  isSplash,
  pokeImpulse,
  sanitize,
  step,
} from "@wisp/shared";
import { read } from "../core/api";
import { errMessage, log } from "../core/log";
import { isPerson, nickname } from "../core/members";

const TICK_MS = 1000 / 60;
/** While someone holds Wisp, everyone else gets its position this often. */
const HELD_BROADCAST_MS = 1000 / 12;
/** A correction for drift between windows, while anyone is watching. */
const KEYFRAME_MS = 2500;
/** A holder whose window stops sending (closed tab, lost signal) lets go. */
const HOLD_TIMEOUT_MS = 3000;
/** Rim hits are announced at most this often. */
const IMPACT_BROADCAST_MS = 150;

const clock = () => performance.now() / 1000;

interface Holder {
  userId: string;
  nickname: string;
  target: { x: number; y: number };
  lastSeen: number;
}

class Domain {
  body: Body = { x: 0, y: 0, vx: 0, vy: 0 };
  asleep = false;
  holder: Holder | undefined;
  flingUntil = 0;
  lastInteraction = clock();
  seq = 0;
  simulatedUntil = clock();
  watchers = new Map<string, string>(); // userId -> nickname
  channelId: string | undefined;
  channelName = "wisps-domain";

  private timer: ReturnType<typeof setInterval> | undefined;
  private lastHeldBroadcast = 0;
  private lastKeyframe = 0;
  private lastImpactBroadcast = 0;

  state(): WispState {
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
    };
  }

  watcherList(): Watcher[] {
    return [...this.watchers].map(([userId, nick]) => ({ userId, nickname: nick }));
  }

  /** Simulates up to now, in fixed steps. */
  catchUp(): void {
    const now = clock();
    // Nobody was watching: don't replay the gap, just carry on from here.
    if (now - this.simulatedUntil > 2) this.simulatedUntil = now - STEP;
    while (this.simulatedUntil + STEP <= now) {
      const hit = step(this.body, {
        t: this.simulatedUntil,
        target: this.holder?.target,
        asleep: this.asleep,
        flingUntil: this.flingUntil,
      });
      this.simulatedUntil += STEP;
      if (hit && isSplash(hit) && now * 1000 - this.lastImpactBroadcast > IMPACT_BROADCAST_MS) {
        this.lastImpactBroadcast = now * 1000;
        this.announce("impact");
      }
    }
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
    const nowMs = clock() * 1000;
    if (this.holder && nowMs - this.holder.lastSeen * 1000 > HOLD_TIMEOUT_MS) this.release(this.holder.userId);
    if (!this.holder && !this.asleep && clock() - this.lastInteraction > SLEEP_AFTER) {
      this.asleep = true;
      this.announce("sleep");
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

  grab(userId: string, at: { x: number; y: number }): boolean {
    this.catchUp();
    if (this.holder && this.holder.userId !== userId) return false;
    this.touch();
    this.holder = { userId, nickname: this.watchers.get(userId) ?? "someone", target: clampTarget(at), lastSeen: clock() };
    this.announce("grab", userId, this.holder.nickname);
    return true;
  }

  drag(userId: string, target: { x: number; y: number }): void {
    if (this.holder?.userId !== userId) return;
    this.catchUp();
    this.holder.target = clampTarget(target);
    this.holder.lastSeen = clock();
    this.lastInteraction = clock();
  }

  /** Lets go. With a body from the holder's window, Wisp flies off exactly as they threw it. */
  release(userId: string, thrown?: Body): void {
    if (this.holder?.userId !== userId) return;
    this.catchUp();
    const by = this.holder;
    this.holder = undefined;
    if (thrown) {
      this.body = sanitize(thrown);
      if (Math.hypot(this.body.vx, this.body.vy) > FLING_SPEED) this.flingUntil = this.simulatedUntil + FLING_COAST;
    }
    this.touch();
    this.announce("release", by.userId, by.nickname);
  }

  poke(userId: string, angle: number): void {
    if (this.holder) return;
    this.catchUp();
    this.touch();
    const push = pokeImpulse(Number.isFinite(angle) ? angle : 0);
    this.body.vx += push.vx;
    this.body.vy += push.vy;
    this.announce("poke", userId, this.watchers.get(userId) ?? "someone");
  }

  /** `!wisp` in chat: everyone already inside sees Wisp light up. */
  summon(byUserId: string, byNickname: string): void {
    this.catchUp();
    this.touch();
    this.announce("summon", byUserId, byNickname);
  }
}

/** A pointer may be outside the domain (that's how you slam Wisp), but not absurdly far. */
function clampTarget(p: { x: number; y: number }): { x: number; y: number } {
  const x = Number.isFinite(p.x) ? p.x : 0;
  const y = Number.isFinite(p.y) ? p.y : 0;
  const d = Math.hypot(x, y);
  const max = LIMIT + 0.6;
  return d > max ? { x: (x * max) / d, y: (y * max) / d } : { x, y };
}

export const domain = new Domain();

class WispDomainService extends WispDomainServiceBase {
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
}

export const domainService = new WispDomainService();

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
