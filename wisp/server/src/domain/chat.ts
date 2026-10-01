// Talking to Wisp in chat. A message that says "wisp", @mentions Wisp or
// replies to one of its messages gets a reaction emoji and an answer, and
// everyone in the domain watches it fly over and Wisp react. With an API key
// Claude reads the message (plus the last few messages in the channel) and
// answers as Wisp; without one, Wisp reads the mood from keywords.

import { rootServer, ChannelGuid, ChannelMessageCreatedEvent } from "@rootsdk/server-app";
import { readMessage } from "@wisp/shared";
import { config } from "../config";
import { read } from "../core/api";
import { directory } from "../core/directory";
import { errMessage, log } from "../core/log";
import { botUserId, nickname } from "../core/members";
import { react, send } from "../core/messaging";
import { addressedToWisp } from "../logic/address";
import { emoji } from "../logic/emoji";
import { defuseMentions, truncate } from "../logic/text";
import { think } from "./brain";
import { MAX_SAY, domain } from "./domain";
import { nameLines, recentTalk, rememberLine, rememberTalk, snapshotLines } from "./memory";

/** One reaction per person this often, so "wisp wisp wisp" isn't a flood. */
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

const inChannels = (keys: readonly string[], channelId: string) => keys.some((key) => directory.channelId(key) === channelId);

/** Text safe to show and to post: no pings, no @everyone. One line unless `keepLines`. */
function plain(text: string, keepLines = false): string {
  const safe = defuseMentions(text).replace(/@(everyone|here)\b/gi, "@\u200b$1");
  return (keepLines ? safe : safe.replace(/\s+/g, " ")).trim();
}

/**
 * Every chat message from a person passes through here: Wisp keeps the last
 * few as context, and answers the ones meant for it. Never throws.
 */
export async function hearChat(evt: ChannelMessageCreatedEvent): Promise<void> {
  const text = evt.messageContent ?? "";
  if (text.trim().startsWith(config.prefix)) return;
  const private_ = inChannels(config.brain.skipIn, evt.channelId);
  // What was said before this message, then this message itself for next time.
  const before = private_ ? [] : snapshotLines(evt.channelId);
  if (!private_) rememberLine(evt.channelId, evt.userId, plain(text));

  if (!config.domain.listen || !addressedToWisp(evt, botUserId())) return;
  const now = Date.now();
  if (now - (lastReaction.get(evt.userId) ?? 0) < REACT_COOLDOWN_MS) return;
  lastReaction.set(evt.userId, now);

  try {
    const name = await nickname(evt.userId);
    const where = await channelName(evt.channelId);
    const said = plain(text);
    const heard = { id: evt.id, userId: evt.userId, nickname: name, text: truncate(said, MAX_SAY), channelName: where };
    const showInDomain = !inChannels(config.domain.quietIn, evt.channelId);
    if (showInDomain) domain.listen(heard);

    const smart = private_
      ? undefined
      : await think({ from: name, text: said, channel: where, chat: await nameLines(before), memory: recentTalk(evt.channelId), ...domain.status() });
    const reaction = smart ?? readMessage(text);
    await react(evt.channelId, evt.id, emoji(reaction.emoji.code, reaction.emoji.glyph));

    const sinceReply = now - (lastReply.get(evt.channelId) ?? 0);
    if (smart) {
      if (smart.reply && sinceReply > config.brain.replyCooldownSeconds * 1000) {
        lastReply.set(evt.channelId, now);
        await send(evt.channelId, plain(smart.reply, true), evt.id);
      }
      rememberTalk(evt.channelId, name, said, smart.reply || smart.say);
    } else if (config.domain.replyInChat && sinceReply > config.domain.replyCooldownSeconds * 1000) {
      lastReply.set(evt.channelId, now);
      await send(evt.channelId, `${reaction.say} *${reaction.action}*`, evt.id);
    }

    if (showInDomain) domain.respond(heard, reaction);
  } catch (err) {
    log("warn", "couldn't answer a message for Wisp", { error: errMessage(err) });
  }
}
