// Talking to Blitz in chat. A message that says "blitz", @mentions Blitz or
// replies to one of its messages gets a reaction emoji and an answer. With an API key
// Claude reads the message (plus the last few messages in the channel) and
// answers as Blitz; without one (or when Claude can't), Blitz's wits answer
// from what it knows about the community (see wits.ts).

import { rootServer, ChannelGuid, ChannelMessageCreatedEvent } from "@rootsdk/server-app";
import { config } from "../config";
import { read } from "../core/api";
import { settings } from "../core/settings";
import { errMessage, log } from "../core/log";
import { botUserId, nickname } from "../core/members";
import { react, send } from "../core/messaging";
import { addressedToBlitz } from "../logic/address";
import { emoji } from "../logic/emoji";
import { defuseMentions, defusePings } from "../logic/text";
import { think } from "./brain";
import { nameLines, recentTalk, rememberLine, rememberTalk, snapshotLines } from "./memory";
import { witsAnswer } from "./wits";

/** One reaction per person this often, so "blitz blitz blitz" isn't a flood. */
const REACT_COOLDOWN_MS = 3000;

const lastReaction = new Map<string, number>();
const lastReply = new Map<string, number>();
const channelNames = new Map<string, string>();

async function channelName(channelId: string): Promise<string> {
  const known = channelNames.get(channelId);
  if (known) return known;
  try {
    const channel = await read("channels.get", () => rootServer.community.channels.get({ id: channelId as ChannelGuid }));
    channelNames.set(channelId, channel.name);
    return channel.name;
  } catch {
    return "";
  }
}

/** Text safe to show and to post: no pings, no @everyone. One line unless `keepLines`. */
function plain(text: string, keepLines = false): string {
  const safe = defuseMentions(text).replace(/@(everyone|here)\b/gi, "@\u200b$1");
  return (keepLines ? safe : safe.replace(/\s+/g, " ")).trim();
}

/**
 * Every chat message from a person passes through here: Blitz keeps the last
 * few as context, and answers the ones meant for it. Never throws.
 */
export async function hearChat(evt: ChannelMessageCreatedEvent): Promise<void> {
  const text = evt.messageContent ?? "";
  if (text.trim().startsWith(config.prefix)) return;
  // Private channels (picked in Blitz's settings) are never sent to Claude.
  const private_ = settings.isPrivate(evt.channelId);
  // What was said before this message, then this message itself for next time.
  const before = private_ ? [] : snapshotLines(evt.channelId);
  if (!private_) rememberLine(evt.channelId, evt.userId, plain(text));

  if (!config.domain.listen || !addressedToBlitz(evt, botUserId())) return;
  const now = Date.now();
  if (now - (lastReaction.get(evt.userId) ?? 0) < REACT_COOLDOWN_MS) return;
  lastReaction.set(evt.userId, now);

  try {
    const name = await nickname(evt.userId);
    const where = await channelName(evt.channelId);
    const said = plain(text);
    const smart = private_ ? undefined : await think({ from: name, text: said, channel: where, chat: await nameLines(before), memory: recentTalk(evt.channelId) });
    // No brain (or it couldn't answer): Blitz's wits. They stay in Root, so private channels get them too.
    const witty = smart ? undefined : await witsAnswer(evt.userId, text, "chat", evt);
    const reaction = smart ?? witty!;
    await react(evt.channelId, evt.id, emoji(reaction.emoji.code, reaction.emoji.glyph));

    const sinceReply = now - (lastReply.get(evt.channelId) ?? 0);
    if (smart) {
      if (smart.reply && sinceReply > config.brain.replyCooldownSeconds * 1000) {
        lastReply.set(evt.channelId, now);
        await send(evt.channelId, plain(smart.reply, true), evt.id);
      }
      rememberTalk(evt.channelId, name, said, smart.reply || smart.say);
    } else if (witty) {
      // A real answer goes out promptly; chatter ("hii! *hops*") at most now and then, so a busy channel isn't flooded.
      const wait = witty.answer ? config.brain.replyCooldownSeconds : config.domain.replyInChat ? config.domain.replyCooldownSeconds : Infinity;
      if (witty.reply && sinceReply > wait * 1000) {
        lastReply.set(evt.channelId, now);
        await send(evt.channelId, defusePings(witty.reply).trim(), evt.id);
      }
    }

  } catch (err) {
    log("warn", "couldn't answer a message for Blitz", { error: errMessage(err) });
  }
}
