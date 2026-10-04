// The menu's state, shared by both ways of showing it (the panel beside the
// bubble, and the dream pages Blitz summons out in open space): what the
// server says the menu holds, and Blitz's reply to the last thing picked.

import type { Outfit } from "@blitz/shared";
import type { MenuApi, MenuOverview, RunResponse } from "./api";

export interface Reply {
  text: string;
  ok: boolean;
  at: number;
  /** The command it answers ("daily", "buy"…). */
  command: string;
}

/** What the domain does when something's picked in the menu: Blitz reacts to the reply. */
export type ReplyListener = (reply: Reply) => void;

/** Data older than this is fetched again when a section opens. */
const STALE_MS = 20_000;

export class Menu {
  data: MenuOverview | undefined;
  error: string | undefined;
  /** What went wrong, in a few words ("took too long", or the server's error), for the small print. */
  errorDetail: string | undefined;
  /** When the next automatic try is (0: none planned). */
  retryAt = 0;
  loading = false;
  reply: Reply | undefined;
  onReply: ReplyListener | undefined;
  /** A look being tried on in the shop (cosmetic ids): Blitz in the domain wears it until it's put back. */
  tryOn: Outfit | undefined;
  private loadedAt = 0;
  private listeners = new Set<() => void>();
  private pending: Promise<void> | undefined;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(readonly api: MenuApi) {}

  get team(): boolean {
    return this.data?.access === "mod" || this.data?.access === "admin";
  }

  /** Calls `listener` whenever the menu changes; returns how to stop. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  /** Fetches the menu (again). */
  load(): Promise<void> {
    this.pending ??= (async () => {
      this.loading = true;
      this.changed();
      try {
        this.data = await this.api.overview();
        this.error = undefined;
        this.errorDetail = undefined;
        this.loadedAt = Date.now();
        this.failures = 0;
        this.retryAt = 0;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
      } catch (err) {
        // Keep showing what we had; try again on our own, waiting longer each time (3s, 6s, 12s… up to 30s).
        this.failures++;
        this.error = this.data ? "Lost touch with Blitz's server for a moment." : "Blitz's server isn't answering yet.";
        const why = err instanceof Error ? err.message : String(err);
        this.errorDetail = /timed out/i.test(why) ? "It took too long to answer." : why ? `It said: ${why.slice(0, 120)}` : undefined;
        const wait = Math.min(30_000, 3000 * 2 ** (this.failures - 1));
        this.retryAt = Date.now() + wait;
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => {
          this.retryTimer = undefined;
          if (this.listeners.size > 0) void this.load();
        }, wait);
      } finally {
        this.loading = false;
        this.pending = undefined;
        this.changed();
      }
    })();
    return this.pending;
  }

  /** Fetches the menu if it's been a while. */
  freshen(): void {
    if (!this.loading && Date.now() - this.loadedAt > STALE_MS) void this.load();
  }

  /**
   * Runs one of Blitz's commands from the menu, shows Blitz's reply, and
   * refreshes what the menu shows. `ok` in what comes back says whether it
   * worked (a reply that's a hint or a refusal means it didn't).
   */
  async run(command: string, args = "", channelId = ""): Promise<RunResponse> {
    let res: RunResponse;
    try {
      res = await this.api.run(command, args, channelId);
    } catch {
      res = { ok: false, replies: ["⚠️ I couldn't reach my server. Try again in a moment."] };
    }
    const text = res.replies.join("\n\n").trim();
    // A hint, a warning or a refusal means it didn't work ("🔒 Locked #general" is a lockdown that did).
    const ok = res.ok && !/^(💡|⚠️|🤷|🔒(?! Locked))/u.test(text);
    if (text) {
      this.reply = { text, ok, at: Date.now(), command };
      this.onReply?.(this.reply);
    }
    await this.load();
    return { ...res, ok };
  }

  /** Tries a look on (or, with undefined, puts Blitz's own outfit back). */
  setTryOn(outfit: Outfit | undefined): void {
    this.tryOn = outfit;
    this.changed();
  }

  /** A section was opened (undefined: none, the menu closed): leaving the shop puts the tried-on look back. */
  opened(sectionId: string | undefined): void {
    if (sectionId !== "stardust" && this.tryOn) this.setTryOn(undefined);
  }

  /** Clears Blitz's last reply. */
  dismissReply(): void {
    this.reply = undefined;
    this.changed();
  }
}
