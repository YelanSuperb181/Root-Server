// The domain's connection to Blitz's server. Inside Root, every open domain
// shares one Blitz through it. Anywhere else (a plain browser, or if the
// server doesn't answer) the domain runs solo: same Blitz, just yours.

import { rootClient } from "@rootsdk/client-app";
import { BlitzDomainServiceClientEvent, blitzDomainServiceClient } from "@blitz/gen-client";
import type { JoinResponse, MessageEvent, StateEvent, Watcher } from "@blitz/gen-shared";
import type { Body } from "@blitz/shared";

export interface DomainLink {
  mode: "live" | "solo";
  /** This viewer's user ID ("" when solo). */
  me: string;
  grab(x: number, y: number): Promise<{ ok: boolean; event?: StateEvent }>;
  drag(x: number, y: number): void;
  release(body: Body): void;
  poke(angle: number): void;
  /** Something typed into the domain, for Blitz. */
  say(text: string): void;
  /** Put the burst bubble back together. */
  reform(): void;
  onState(listener: (event: StateEvent) => void): void;
  onWatchers(listener: (watchers: Watcher[]) => void): void;
  onMessage(listener: (message: MessageEvent) => void): void;
}

function soloLink(): DomainLink {
  return {
    mode: "solo",
    me: "",
    grab: async () => ({ ok: true }),
    drag: () => undefined,
    release: () => undefined,
    poke: () => undefined,
    say: () => undefined,
    reform: () => undefined,
    onState: () => undefined,
    onWatchers: () => undefined,
    onMessage: () => undefined,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Sends at most every `ms`, always delivering the latest value. */
function throttle(ms: number, send: (x: number, y: number) => void): (x: number, y: number) => void {
  let last = 0;
  let pending: [number, number] | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    if (!pending) return;
    last = performance.now();
    send(...pending);
    pending = undefined;
  };
  return (x, y) => {
    pending = [x, y];
    const wait = ms - (performance.now() - last);
    if (wait <= 0) flush();
    else if (!timer) timer = setTimeout(flush, wait);
  };
}

const quiet = (p: Promise<unknown>) => p.catch(() => undefined);

export async function connect(timeoutMs = 4000): Promise<{ link: DomainLink; joined?: JoinResponse }> {
  let me = "";
  try {
    me = rootClient.users.getCurrentUserId();
  } catch {
    return { link: soloLink() };
  }
  let joined: JoinResponse;
  try {
    joined = await withTimeout(blitzDomainServiceClient.join({}), timeoutMs);
  } catch {
    return { link: soloLink() };
  }

  const svc = blitzDomainServiceClient;
  const link: DomainLink = {
    mode: "live",
    me,
    async grab(x, y) {
      try {
        const res = await withTimeout(svc.grab({ x, y }), timeoutMs);
        return { ok: res.ok, event: res.state ? { state: res.state, cause: "grab", byUserId: "", byNickname: "" } : undefined };
      } catch {
        return { ok: false };
      }
    },
    drag: throttle(1000 / 15, (x, y) => void quiet(svc.drag({ targetX: x, targetY: y }))),
    release: (b) => void quiet(svc.release({ x: b.x, y: b.y, vx: b.vx, vy: b.vy })),
    poke: (angle) => void quiet(svc.poke({ angle })),
    say: (text) => void quiet(svc.say({ text })),
    reform: () => void quiet(svc.reform({})),
    onState: (listener) => void svc.on(BlitzDomainServiceClientEvent.State, listener),
    onWatchers: (listener) => void svc.on(BlitzDomainServiceClientEvent.Watchers, (e) => listener(e.watchers)),
    onMessage: (listener) => void svc.on(BlitzDomainServiceClientEvent.Message, listener),
  };
  return { link, joined };
}
