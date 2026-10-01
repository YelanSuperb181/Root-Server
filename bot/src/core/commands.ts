// A small command framework: features register commands, the router parses
// "!name args", checks who's allowed, runs it and turns failures into a
// friendly reply.

import type { ChannelMessageCreatedEvent } from "@rootsdk/server-bot";
import { config } from "../config";
import { parseCommand } from "../logic/parse";
import { describeError } from "./api";
import { errMessage, log } from "./log";
import { AccessLevel, accessLevel, atLeast } from "./members";
import { send } from "./messaging";

export type Category = "Community" | "Levels" | "Fun" | "Staff" | "Setup";

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
  if (!cmd) return false; // Not ours (maybe another bot's); stay quiet.

  const now = Date.now();
  if (now - (lastUse.get(evt.userId) ?? 0) < COOLDOWN_MS) return true;
  lastUse.set(evt.userId, now);

  const reply = async (text: string) => {
    await send(evt.channelId, text, evt.id);
  };

  try {
    const level = await accessLevel(evt.userId);
    if (!atLeast(level, cmd.level)) {
      await reply(`🔒 \`${config.prefix}${cmd.name}\` is for ${cmd.level === "admin" ? "admins" : "the team"} only.`);
      return true;
    }
    await cmd.run({
      evt,
      userId: evt.userId,
      channelId: evt.channelId,
      messageId: evt.id,
      args: parsed.args,
      rest: parsed.rest,
      level,
      reply,
    });
  } catch (err) {
    if (err instanceof UsageError) {
      await reply(`💡 ${err.message}`).catch(() => undefined);
    } else {
      log("error", `command ${cmd.name} failed`, { error: errMessage(err) });
      await reply(`⚠️ ${describeError(err)}`).catch(() => undefined);
    }
  }
  return true;
}
