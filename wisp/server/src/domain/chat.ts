// Talking to Wisp in chat. A message that says "wisp", @mentions Wisp or
// replies to one of its messages gets a reaction emoji (and, now and then, a
// little line back), and everyone in the domain sees it arrive and Wisp react.

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
import { MAX_SAY, domain } from "./domain";

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

/** Reacts to a chat message if it's for Wisp. Never throws; never blocks other features. */
export async function hearChat(evt: ChannelMessageCreatedEvent): Promise<void> {
  const settings = config.domain;
  const text = evt.messageContent ?? "";
  if (!settings.listen || text.trim().startsWith(config.prefix)) return;
  if (!addressedToWisp(evt, botUserId())) return;

  const now = Date.now();
  if (now - (lastReaction.get(evt.userId) ?? 0) < REACT_COOLDOWN_MS) return;
  lastReaction.set(evt.userId, now);

  try {
    const reaction = readMessage(text);
    await react(evt.channelId, evt.id, emoji(reaction.emoji.code, reaction.emoji.glyph));

    if (settings.replyInChat && now - (lastReply.get(evt.channelId) ?? 0) > settings.replyCooldownSeconds * 1000) {
      lastReply.set(evt.channelId, now);
      await send(evt.channelId, `${reaction.say} *${reaction.action}*`, evt.id);
    }

    const quiet = settings.quietIn.some((key) => directory.channelId(key) === evt.channelId);
    if (quiet || domain.watchers.size === 0) return;
    domain.hear({
      userId: evt.userId,
      nickname: await nickname(evt.userId),
      text: truncate(defuseMentions(text).replace(/\s+/g, " ").trim(), MAX_SAY),
      channelName: await channelName(evt.channelId),
      reaction,
    });
  } catch (err) {
    log("warn", "couldn't react to a message for Wisp", { error: errMessage(err) });
  }
}
