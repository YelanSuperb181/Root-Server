// Posting, editing, reacting, role changes and notifications, all through
// the rate-limited API wrapper.

import {
  rootServer,
  ChannelGuid,
  ChannelMessage,
  CommunityRoleGuid,
  MessageGuid,
  UserGuid,
} from "@rootsdk/server-app";
import type { Emoji } from "../logic/emoji";
import { shortcode } from "../logic/emoji";
import { MAX_MESSAGE, MAX_NOTIFY_BODY, MAX_NOTIFY_TITLE, truncate } from "../logic/text";
import { read, write } from "./api";
import { errMessage, log } from "./log";
import { learnSelf, noteRoleChange } from "./members";
import { ChannelSetting, settings } from "./settings";

export async function send(channelId: string, content: string, replyTo?: string): Promise<ChannelMessage> {
  const msg = await write("channelMessages.create", () =>
    rootServer.community.channelMessages.create({
      channelId: channelId as ChannelGuid,
      content: truncate(content, MAX_MESSAGE),
      parentMessageIds: replyTo ? [replyTo as MessageGuid] : undefined,
    }),
  );
  await learnSelf(msg.userId);
  return msg;
}

/** Posts to the channel the community picked for `which`; quietly does nothing if none is picked. */
export async function sendTo(which: ChannelSetting, content: string): Promise<ChannelMessage | undefined> {
  const id = settings.channel(which);
  if (!id) return undefined;
  try {
    return await send(id, content);
  } catch (err) {
    log("warn", `couldn't post in the ${which} channel`, { error: errMessage(err) });
    return undefined;
  }
}

export async function edit(channelId: string, messageId: string, content: string): Promise<void> {
  await write("channelMessages.edit", () =>
    rootServer.community.channelMessages.edit({
      channelId: channelId as ChannelGuid,
      id: messageId as MessageGuid,
      content: truncate(content, MAX_MESSAGE),
    }),
  );
}

export async function getMessage(channelId: string, messageId: string): Promise<ChannelMessage | undefined> {
  try {
    const msg = await read("channelMessages.get", () =>
      rootServer.community.channelMessages.get({ channelId: channelId as ChannelGuid, id: messageId as MessageGuid }),
    );
    return msg.deletedAt ? undefined : msg;
  } catch {
    return undefined;
  }
}

export async function remove(channelId: string, messageId: string): Promise<void> {
  await write("channelMessages.delete", () =>
    rootServer.community.channelMessages.delete({ channelId: channelId as ChannelGuid, id: messageId as MessageGuid }),
  );
}

/** Adds the bot's reaction so members can click it. False if it failed. */
export async function react(channelId: string, messageId: string, e: Emoji): Promise<boolean> {
  try {
    await write("channelMessages.reactionCreate", () =>
      rootServer.community.channelMessages.reactionCreate({
        channelId: channelId as ChannelGuid,
        messageId: messageId as MessageGuid,
        shortcode: shortcode(e),
      }),
    );
    return true;
  } catch (err) {
    log("warn", "couldn't add reaction", { emoji: e.code, error: errMessage(err) });
    return false;
  }
}

export async function pin(channelId: string, messageId: string): Promise<void> {
  try {
    await write("channelMessages.pinCreate", () =>
      rootServer.community.channelMessages.pinCreate({ channelId: channelId as ChannelGuid, messageId: messageId as MessageGuid }),
    );
  } catch (err) {
    log("warn", "couldn't pin message", { error: errMessage(err) });
  }
}

/** A short notice that cleans itself up after a few seconds. */
export function sendEphemeral(channelId: string, content: string, ttlMs = 10_000): void {
  send(channelId, content)
    .then((msg) => {
      setTimeout(() => remove(channelId, msg.id).catch(() => undefined), ttlMs);
    })
    .catch((err) => log("warn", "ephemeral notice failed", { error: errMessage(err) }));
}

export async function addRole(userId: string, roleId: string): Promise<void> {
  await write("communityMemberRoles.add", () =>
    rootServer.community.communityMemberRoles.add({ communityRoleId: roleId as CommunityRoleGuid, userIds: [userId as UserGuid] }),
  );
  noteRoleChange(userId, roleId, true);
}

export async function removeRole(userId: string, roleId: string): Promise<void> {
  await write("communityMemberRoles.remove", () =>
    rootServer.community.communityMemberRoles.remove({ communityRoleId: roleId as CommunityRoleGuid, userIds: [userId as UserGuid] }),
  );
  noteRoleChange(userId, roleId, false);
}

/**
 * Push notification. Best effort: a failure is logged, never thrown, and the
 * text is cut to Root's limits. Shows on lock screens, so keep it gentle.
 */
export async function notify(userIds: string[], title: string, description: string): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await write("notifications.send", () =>
      rootServer.community.notifications.send({
        title: truncate(title, MAX_NOTIFY_TITLE),
        description: truncate(description, MAX_NOTIFY_BODY),
        userIds: userIds as UserGuid[],
      }),
    );
  } catch (err) {
    log("warn", "notification failed", { error: errMessage(err) });
  }
}

/** A line in the staff log, if the community picked one. */
export async function modLog(content: string): Promise<void> {
  await sendTo("log", content);
}

/** Link to a message, for "jump to" buttons. Undefined if Root won't make one. */
export async function messageLink(channelId: string, messageId: string): Promise<string | undefined> {
  try {
    const res = await read("communityLinks.communityMessageCreate", () =>
      rootServer.community.communityLinks.communityMessageCreate({
        channelId: channelId as ChannelGuid,
        messageId: messageId as MessageGuid,
      }),
    );
    return res.url || undefined;
  } catch {
    return undefined;
  }
}
