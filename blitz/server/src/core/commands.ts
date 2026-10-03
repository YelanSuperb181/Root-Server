// A small command framework: features register commands, the router parses
// "!name args", checks who's allowed, runs it and turns failures into a
// friendly reply.

import type { ChannelMessageCreatedEvent } from "@rootsdk/server-app";
import { config } from "../config";
import { parseCommand } from "../logic/parse";
import { describeError, errDetail } from "./api";
import { log } from "./log";
import { AccessLevel, accessLevel, atLeast } from "./members";
import { send } from "./messaging";

export type Category = "Community" | "Levels" | "Fun" | "Moderation" | "Staff";

export interface CommandContext {
  evt: ChannelMessageCreatedEvent;
  userId: string;
  channelId: string;
  messageId: string;
  args: string[];
  /** Everything after the command name. */
  rest: string;
  level: AccessLevel;
  /** Replies to the command message. */
  reply(text: string): Promise<void>;
}

export interface Command {
  name: string;
  aliases?: string[];
  /** Shown in help, after the command name: "<question> | <option> ...". */
  usage?: string;
  summary: string;
  level: AccessLevel;
  category: Category;
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
  const base = { evt, userId: evt.userId, channelId: evt.channelId, messageId: evt.id, args: parsed.args, rest: parsed.rest };
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

  try {
    const level = await accessLevel(evt.userId);
    if (!atLeast(level, cmd.level)) {
      await reply(`🔒 \`${config.prefix}${cmd.name}\` is for ${cmd.level === "admin" ? "admins" : "the team"} only.`);
      return true;
    }
    await cmd.run({ ...base, level, reply: replyAs({ ...use, name: cmd.name, level: cmd.level }) });
  } catch (err) {
    if (err instanceof UsageError) {
      await reply(`💡 ${err.message}`).catch(() => undefined);
    } else {
      log("error", `command ${cmd.name} failed`, { error: errDetail(err) });
      await reply(`⚠️ ${describeError(err)}`).catch(() => undefined);
    }
  }
  return true;
}
