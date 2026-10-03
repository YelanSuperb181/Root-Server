// The message log: when someone edits or deletes a message, Blitz notes the
// before and after in the community's message log channel, so the team can
// see what was said even after it's gone. Blitz remembers recent messages
// only in memory (never on disk), for up to two days, and skips private
// channels, its own deletions and other Apps.

import {
  rootServer,
  ChannelMessageCreatedEvent,
  ChannelMessageDeletedEvent,
  ChannelMessageEditedEvent,
  ChannelMessageEvent,
} from "@rootsdk/server-app";
import { errMessage, log } from "../core/log";
import { isPerson, nickname } from "../core/members";
import { messageLink, removedByMe, sendTo } from "../core/messaging";
import { channelLink, settings } from "../core/settings";
import { defuseMentions, quote, truncate, userMention } from "../logic/text";

interface Seen {
  userId: string;
  channelId: string;
  content: string;
  files: number;
  at: number;
}

const seen = new Map<string, Seen>();
const MAX_SEEN = 10_000;
const KEEP_MS = 48 * 3_600_000;

const watched = (channelId: string) => !!settings.channel("messageLog") && !settings.isPrivate(channelId) && !settings.isLog(channelId);

/** Remembers a message, so an edit or deletion can show what it said. */
export function rememberMessage(evt: ChannelMessageCreatedEvent): void {
  if (!watched(evt.channelId)) return;
  seen.set(evt.id, {
    userId: evt.userId,
    channelId: evt.channelId,
    content: truncate(evt.messageContent ?? "", 2000),
    files: evt.messageUris?.length ?? 0,
    at: Date.now(),
  });
  if (seen.size > MAX_SEEN) seen.delete(seen.keys().next().value as string);
}

const excerpt = (text: string) => (text.trim() ? quote(truncate(defuseMentions(text), 900)) : "> _(no text)_");

async function onEdited(evt: ChannelMessageEditedEvent): Promise<void> {
  if (!watched(evt.channelId) || !isPerson(evt.userId)) return;
  const before = seen.get(evt.id);
  const after = evt.messageContent ?? "";
  // Pins and reactions come as edits too: only a real text change counts.
  if (before ? before.content === truncate(after, 2000) : !evt.editedAt || Date.now() - new Date(evt.editedAt).getTime() > 2 * 60_000) return;
  const link = await messageLink(evt.channelId, evt.id);
  const lines = [
    `✏️ ${userMention(await nickname(evt.userId), evt.userId)} edited a message in ${await channelLink(evt.channelId)}${link ? ` · [jump](${link})` : ""}`,
    "**Before:**",
    before ? excerpt(before.content) : "> _(sent before Blitz started watching)_",
    "**After:**",
    excerpt(after),
  ];
  seen.set(evt.id, { userId: evt.userId, channelId: evt.channelId, content: truncate(after, 2000), files: before?.files ?? 0, at: before?.at ?? Date.now() });
  await sendTo("messageLog", lines.join("\n"));
}

async function onDeleted(evt: ChannelMessageDeletedEvent): Promise<void> {
  const before = seen.get(evt.id);
  seen.delete(evt.id);
  // Blitz's own removals (auto-mod, mutes, !clear) are logged where they happen.
  if (!before || removedByMe(evt.id) || !watched(evt.channelId)) return;
  const files = before.files > 0 ? `\n📎 _with ${before.files === 1 ? "an attachment" : `${before.files} attachments`}_` : "";
  await sendTo(
    "messageLog",
    `🗑️ A message from ${userMention(await nickname(before.userId), before.userId)} was deleted in ${await channelLink(evt.channelId)}:\n${excerpt(before.content)}${files}`,
  );
}

export function initMessageLog(): void {
  const messages = rootServer.community.channelMessages;
  messages.on(ChannelMessageEvent.ChannelMessageEdited, (evt: ChannelMessageEditedEvent) =>
    void onEdited(evt).catch((err) => log("warn", "message log (edit) failed", { error: errMessage(err) })),
  );
  messages.on(ChannelMessageEvent.ChannelMessageDeleted, (evt: ChannelMessageDeletedEvent) =>
    void onDeleted(evt).catch((err) => log("warn", "message log (delete) failed", { error: errMessage(err) })),
  );
  setInterval(() => {
    const cutoff = Date.now() - KEEP_MS;
    for (const [id, m] of seen) if (m.at < cutoff) seen.delete(id);
  }, 30 * 60_000).unref();
}
