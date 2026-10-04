// A small command framework: features register commands, the router parses
// "!name args", checks who's allowed, runs it and turns failures into a
// friendly reply.

import type { ChannelMessageCreatedEvent } from "@rootsdk/server-app";
import { config } from "../config";
import { parseCommand } from "../logic/parse";
import { describeError, errDetail } from "./api";
import { log } from "./log";
import { AccessLevel, accessLevel, atLeast } from "./members";
import { send, sendEphemeral } from "./messaging";

export type Category = "Community" | "Levels" | "Fun" | "Moderation" | "Staff";

export interface CommandContext {
  evt: ChannelMessageCreatedEvent;
  userId: string;
  /** Where it was used; "" from Blitz's menu (unless it posts in a channel the team picked). */
  channelId: string;
  /** The command message; "" from Blitz's menu. */
  messageId: string;
  args: string[];
  /** Everything after the command name. */
  rest: string;
  level: AccessLevel;
  /** Typed in a channel, or used from Blitz's menu in its domain (where replies go back to the menu). */
  from: "chat" | "menu";
  /** Replies to the command message. */
  reply(text: string): Promise<void>;
  /** A short notice just for them: a message that cleans itself up in chat, a reply in the menu. */
  notice(text: string, ttlMs?: number): Promise<void>;
}

export interface Command {
  name: string;
  aliases?: string[];
  /** Shown in help, after the command name: "<question> | <option> ...". */
  usage?: string;
  summary: string;
  level: AccessLevel;
  category: Category;
  /**
   * How it works from Blitz's menu: "channel" if it posts in a channel (from
   * the menu, the team picks which), "no" if it only makes sense typed in a
   * channel. Left out, it works from the menu as it is.
   */
  menu?: "channel" | "no";
  run(ctx: CommandContext): Promise<void>;
}

/** Throw from a command to reply with a hint instead of an error. */
export class UsageError extends Error {}

const byName = new Map<string, Command>();
const ordered: Command[] = [];
const lastUse = new Map<string, number>();
const COOLDOWN_MS = 1500;

export function register(...commands: Command[]): void {
  for (const cmd of commands) {
    for (const name of [cmd.name, ...(cmd.aliases ?? [])]) {
      if (byName.has(name)) throw new Error(`Command name "${name}" registered twice`);
      byName.set(name, cmd);
    }
    ordered.push(cmd);
  }
}

/** Whether a name (or alias) belongs to one of Blitz's own commands. */
export function isCommandName(name: string): boolean {
  return byName.has(name);
}

/** Runs names that aren't Blitz's own commands (the community's custom commands). True if it handled one. */
type Fallback = (name: string, ctx: Omit<CommandContext, "level">) => Promise<boolean>;
let fallback: Fallback | undefined;

export function setFallback(handler: Fallback): void {
  fallback = handler;
}

/** A command someone used, as the reply footer sees it. */
export interface CommandUse {
  /** The command's own name (or a community command's name). */
  name: string;
  level: AccessLevel;
  userId: string;
  channelId: string;
}

/** A line to add under a command's first reply (the link to Blitz's domain), or nothing. */
type ReplyFooter = (use: CommandUse) => Promise<string | undefined>;
let footer: ReplyFooter | undefined;

export function setReplyFooter(fn: ReplyFooter): void {
  footer = fn;
}

export function allCommands(): readonly Command[] {
  return ordered;
}

export function usageOf(cmd: Command): string {
  return `\`${config.prefix}${cmd.name}${cmd.usage ? " " + cmd.usage : ""}\``;
}

/** Runs the message as a command if it is one. Returns true when it was. */
export async function handleCommand(evt: ChannelMessageCreatedEvent): Promise<boolean> {
  const parsed = parseCommand(evt.messageContent ?? "", config.prefix);
  if (!parsed) return false;
  const cmd = byName.get(parsed.name);
  /** For locks, hints and errors: no footer. */
  const reply = async (text: string) => {
    await send(evt.channelId, text, evt.id);
  };
  /** A command's own replies; the first one gets the footer, if there is one. */
  let footed = false;
  const replyAs = (use: CommandUse) => async (text: string) => {
    if (!footed) {
      footed = true;
      const extra = footer ? await footer(use).catch(() => undefined) : undefined;
      if (extra) text = `${text}\n\n${extra}`;
    }
    await reply(text);
  };
  const notice = async (text: string, ttlMs?: number) => sendEphemeral(evt.channelId, text, ttlMs);
  const base = { evt, userId: evt.userId, channelId: evt.channelId, messageId: evt.id, args: parsed.args, rest: parsed.rest, from: "chat" as const, notice };
  const use = { userId: evt.userId, channelId: evt.channelId };

  if (!cmd) {
    // Maybe one of the community's own commands; otherwise not ours (maybe another bot's), so stay quiet.
    const custom = { ...base, reply: replyAs({ ...use, name: parsed.name, level: "everyone" }) };
    if (!fallback || !(await fallback(parsed.name, custom).catch(() => false))) return false;
    lastUse.set(evt.userId, Date.now());
    return true;
  }

  const now = Date.now();
  if (now - (lastUse.get(evt.userId) ?? 0) < COOLDOWN_MS) return true;
  lastUse.set(evt.userId, now);

  await runChecked(cmd, base, reply, replyAs({ ...use, name: cmd.name, level: cmd.level }));
  return true;
}

/** Checks who's asking, runs the command, and turns failures into a friendly reply (`plain`, for locks, hints and errors). True if it ran without failing. */
async function runChecked(cmd: Command, base: Omit<CommandContext, "level" | "reply">, plain: (text: string) => Promise<void>, reply: (text: string) => Promise<void>): Promise<boolean> {
  try {
    const level = await accessLevel(base.userId);
    if (!atLeast(level, cmd.level)) {
      await plain(`🔒 \`${config.prefix}${cmd.name}\` is for ${cmd.level === "admin" ? "admins" : "the team"} only.`);
      return false;
    }
    await cmd.run({ ...base, level, reply });
    return true;
  } catch (err) {
    if (err instanceof UsageError) {
      await plain(`💡 ${err.message}`).catch(() => undefined);
    } else {
      log("error", `command ${cmd.name} failed`, { error: errDetail(err) });
      await plain(`⚠️ ${describeError(err)}`).catch(() => undefined);
    }
    return false;
  }
}

/**
 * Runs one of Blitz's commands as if `evt`'s author had typed it in that
 * channel, for when someone asks Blitz in their own words ("remind me in 2h
 * to stretch"): the same permission checks, but the replies come back for
 * Blitz to post as its answer.
 */
export async function runAsTyped(evt: ChannelMessageCreatedEvent, name: string, rest: string): Promise<{ ok: boolean; replies: string[] }> {
  const replies: string[] = [];
  const reply = async (text: string) => {
    replies.push(text);
  };
  const parsed = parseCommand(`${config.prefix}${name} ${rest}`, config.prefix);
  const cmd = parsed ? byName.get(parsed.name) : undefined;
  if (!parsed || !cmd) return { ok: false, replies };
  const base = { evt, userId: evt.userId, channelId: evt.channelId, messageId: evt.id, args: parsed.args, rest: parsed.rest, from: "chat" as const, notice: reply };
  const ok = await runChecked(cmd, base, reply, reply);
  return { ok, replies };
}

/** Menu uses per person: at most MENU_BURST in MENU_WINDOW_MS (buttons are quicker to press than commands are to type). */
const menuUses = new Map<string, number[]>();
const MENU_BURST = 8;
const MENU_WINDOW_MS = 10_000;

/**
 * Runs one of Blitz's commands (or the community's own) from Blitz's menu,
 * as `userId` typing \`!name rest\`: the same permission checks as in chat,
 * but the replies come back for the menu to show instead of being posted.
 * `channelId` is where commands that post in a channel post; only the team
 * may pick one, and it must be a text channel (`isTextChannel` checks).
 */
export async function runFromMenu(
  userId: string,
  name: string,
  rest: string,
  channelId: string,
  isTextChannel: (id: string) => Promise<boolean>,
): Promise<{ ok: boolean; replies: string[] }> {
  const replies: string[] = [];
  const reply = async (text: string) => {
    replies.push(text);
  };
  const now = Date.now();
  const recent = (menuUses.get(userId) ?? []).filter((at) => now - at < MENU_WINDOW_MS);
  if (recent.length >= MENU_BURST) return { ok: false, replies: ["✋ One moment! That's a lot at once; try again in a few seconds."] };
  recent.push(now);
  menuUses.set(userId, recent);

  const parsed = parseCommand(`${config.prefix}${name} ${rest}`, config.prefix);
  if (!parsed) return { ok: false, replies: [`🤷 I don't know that one.`] };
  const cmd = byName.get(parsed.name);
  // Commands read only what a message gives them; from the menu there's no message, so this stands in for one.
  const evt = { id: "", channelId: "", userId, messageContent: `${config.prefix}${parsed.name} ${parsed.rest}`.trim(), parentMessages: [] } as unknown as ChannelMessageCreatedEvent;
  const base = { evt, userId, channelId: "", messageId: "", args: parsed.args, rest: parsed.rest, from: "menu" as const, notice: reply };

  if (!cmd) {
    const ran = fallback ? await fallback(parsed.name, { ...base, reply }).catch(() => false) : false;
    return ran ? { ok: true, replies } : { ok: false, replies: [`🤷 I don't know \`${config.prefix}${parsed.name}\`.`] };
  }
  if (cmd.menu === "no") return { ok: false, replies: [`💬 \`${config.prefix}${cmd.name}\` works in a channel: type it there.`] };
  if (cmd.menu === "channel") {
    if (!atLeast(await accessLevel(userId), "mod")) {
      return { ok: false, replies: [`💬 From the menu, posting in a channel is for the team. Type \`${config.prefix}${cmd.name}\` in the channel instead.`] };
    }
    if (!channelId || !(await isTextChannel(channelId))) return { ok: false, replies: ["📍 Pick a channel for it first."] };
    base.channelId = channelId;
    base.evt = { ...evt, channelId } as unknown as ChannelMessageCreatedEvent;
  }
  const ok = await runChecked(cmd, base, reply, reply);
  return { ok, replies };
}
