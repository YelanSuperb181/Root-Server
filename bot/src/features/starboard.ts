// The Hall of Fame: when a message collects enough ⭐ from other members it's
// reposted to #hall-of-fame, and the count there stays live.

import { config } from "../config";
import { directory } from "../core/directory";
import { serialize } from "../core/lock";
import { errMessage, log } from "../core/log";
import { isPerson, nickname } from "../core/members";
import { edit, getMessage, messageLink, send } from "../core/messaging";
import { kv } from "../core/store";
import { E, isEmoji } from "../logic/emoji";
import { defuseMentions, quote, truncate } from "../logic/text";

interface StarEntry {
  boardMessageId: string;
  /** Everything below the count line, so updates only change the count. */
  body: string;
}

export interface StarReaction {
  channelId: string;
  messageId: string;
  shortcode: string;
}

function starGlyph(count: number): string {
  if (count >= 20) return "✨";
  if (count >= 10) return "💫";
  if (count >= 5) return "🌟";
  return "⭐";
}

function header(count: number, channelId: string): string {
  const key = directory.channelKey(channelId);
  const where = key ? directory.channelMention(key) : "a channel";
  return `${starGlyph(count)} **${count}** · ${where}`;
}

export async function onStarReaction(evt: StarReaction): Promise<void> {
  if (!config.starboard.enabled || !isEmoji(evt.shortcode, E.star)) return;
  const boardId = directory.channelId(config.starboard.channel);
  const channelKey = directory.channelKey(evt.channelId);
  if (!boardId || evt.channelId === boardId) return;
  if (channelKey && (config.starboard.ignore as readonly string[]).includes(channelKey)) return;

  await serialize(`star:${evt.messageId}`, async () => {
    try {
      const msg = await getMessage(evt.channelId, evt.messageId);
      if (!msg || !isPerson(msg.userId)) return;
      const stars = new Set(
        msg.reactions.filter((r) => isEmoji(r.shortcode, E.star) && r.userId !== msg.userId && isPerson(r.userId)).map((r) => r.userId),
      ).size;

      const saved = await kv.get<StarEntry>(`star:${msg.id}`);
      if (saved) {
        await edit(boardId, saved.boardMessageId, `${header(stars, evt.channelId)}\n${saved.body}`);
        return;
      }
      if (stars < config.starboard.threshold) return;

      const author = await nickname(msg.userId);
      const link = await messageLink(evt.channelId, msg.id);
      const parts: string[] = [];
      const text = defuseMentions(msg.messageContent ?? "").trim();
      if (text) parts.push(quote(truncate(text, 1500)));
      const files = msg.messageUris.length;
      if (files > 0) parts.push(`📎 _${files === 1 ? "with an attachment" : `with ${files} attachments`}_`);
      parts.push(`— **${author}**${link ? ` · [Jump to message](${link})` : ""}`);
      const body = parts.join("\n");

      const posted = await send(boardId, `${header(stars, evt.channelId)}\n${body}`);
      await kv.set<StarEntry>(`star:${msg.id}`, { boardMessageId: posted.id, body });
    } catch (err) {
      log("warn", "starboard update failed", { error: errMessage(err) });
    }
  });
}
