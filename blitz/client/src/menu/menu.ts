// The menu's state, shared by both ways of showing it (the panel beside the
// bubble, and the dream pages Blitz summons out in open space): what the
// server says the menu holds, and Blitz's reply to the last thing picked.

import type { MenuApi, MenuOverview, RunResponse } from "./api";

export interface Reply {
  text: string;
  ok: boolean;
  at: number;
}

/** What the domain does when something's picked in the menu: Blitz reacts to the reply. */
export type ReplyListener = (reply: Reply) => void;

/** Data older than this is fetched again when a section opens. */
const STALE_MS = 20_000;

export class Menu {
  data: MenuOverview | undefined;
  error: string | undefined;
  loading = false;
  reply: Reply | undefined;
  onReply: ReplyListener | undefined;
  private loadedAt = 0;
  private listeners = new Set<() => void>();
  private pending: Promise<void> | undefined;

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
        this.loadedAt = Date.now();
      } catch {
        this.error = "Blitz's server isn't answering right now.";
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

  /** Runs one of Blitz's commands from the menu, shows Blitz's reply, and refreshes what the menu shows. */
  async run(command: string, args = "", channelId = ""): Promise<RunResponse> {
    let res: RunResponse;
    try {
      res = await this.api.run(command, args, channelId);
    } catch {
      res = { ok: false, replies: ["⚠️ I couldn't reach my server. Try again in a moment."] };
    }
    const text = res.replies.join("\n\n").trim();
    if (text) {
      this.reply = { text, ok: res.ok && !/^(💡|⚠️|🔒|🤷)/u.test(text), at: Date.now() };
      this.onReply?.(this.reply);
    }
    await this.load();
    return res;
  }

  /** Clears Blitz's last reply. */
  dismissReply(): void {
    this.reply = undefined;
    this.changed();
  }
}
