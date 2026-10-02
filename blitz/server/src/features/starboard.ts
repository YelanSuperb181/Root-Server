// The quote wall: when a message collects enough 🗣️ reactions from people
// other than its author, it's saved to the community's quote wall channel
// (picked in Blitz's settings) with a live count. `!quote` pulls a random
// saved one back up.

import { config } from "../config";
import { Command } from "../core/commands";
import { serialize } from "../core/lock";
import { errMessage, log } from "../core/log";
import { isPerson, nickname } from "../core/members";
import { edit, getMessage, messageLink, send } from "../core/messaging";
import { channelLink, settings } from "../core/settings";
import { kv } from "../core/store";
import { Emoji, isEmoji } from "../logic/emoji";
import { defuseMentions, pick, plural, quote, truncate } from "../logic/text";

interface StarEntry {
  boardMessageId: string;
  /** Where it was posted (the quote wall can move). */
  boardChannelId?: string;
  /** Everything below the count line, so updates only change the count. */
  body: string;
}

export interface StarReaction {
  channelId: string;
  messageId: string;
  shortcode: string;
}

const EMOJI: Emoji = config.starboard.emoji;

/** The board emoji, with a little extra flair as the count climbs. */
function countGlyph(count: number): string {
  if (count >= 10) return `${EMOJI.glyph}🔥`;
  if (count >= 5) return `${EMOJI.glyph}✨`;
  return EMOJI.glyph;
}

async function header(count: number, channelId: string): Promise<string> {
  return `${countGlyph(count)} **${count}** · ${await channelLink(channelId)}`;
}

const threshold = () => settings.number("quoteThreshold", 2, 1, 20);

export async function onStarReaction(evt: StarReaction): Promise<void> {
  if (!isEmoji(evt.shortcode, EMOJI)) return;
  const boardId = settings.channel("quotes");
  if (!boardId || evt.channelId === boardId) return;
  if (settings.isPrivate(evt.channelId) || settings.isLog(evt.channelId)) return;

  await serialize(`star:${evt.messageId}`, async () => {
    try {
      const msg = await getMessage(evt.channelId, evt.messageId);
      if (!msg || !isPerson(msg.userId)) return;
      const stars = new Set(
        msg.reactions.filter((r) => isEmoji(r.shortcode, EMOJI) && r.userId !== msg.userId && isPerson(r.userId)).map((r) => r.userId),
      ).size;

      const saved = await kv.get<StarEntry>(`star:${msg.id}`);
      if (saved) {
        await edit(saved.boardChannelId ?? boardId, saved.boardMessageId, `${await header(stars, evt.channelId)}\n${saved.body}`);
        return;
      }
      if (stars < threshold()) return;

      const author = await nickname(msg.userId);
      const link = await messageLink(evt.channelId, msg.id);
      const parts: string[] = [];
      const text = defuseMentions(msg.messageContent ?? "").trim();
      if (text) parts.push(quote(truncate(text, 1500)));
      const files = msg.messageUris.length;
      if (files > 0) parts.push(`📎 _${files === 1 ? "with an attachment" : `with ${files} attachments`}_`);
      parts.push(`— **${author}**${link ? ` · [Jump to message](${link})` : ""}`);
      const body = parts.join("\n");

      const posted = await send(boardId, `${await header(stars, evt.channelId)}\n${body}`);
      await kv.set<StarEntry>(`star:${msg.id}`, { boardMessageId: posted.id, boardChannelId: boardId, body });
    } catch (err) {
      log("warn", "starboard update failed", { error: errMessage(err) });
    }
  });
}

export const starboardCommands: Command[] = [
  {
    name: "quote",
    summary: "A random message from the quote wall.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      const saved = await kv.entries<StarEntry>("star:");
      if (saved.length === 0) {
        const board = settings.channel("quotes");
        await ctx.reply(
          board
            ? `${EMOJI.glyph} Nothing on the quote wall yet. React ${EMOJI.glyph} on something someone says; at ${plural(threshold(), "reaction")} it's saved in ${await channelLink(board)}.`
            : `${EMOJI.glyph} This community hasn't picked a quote wall channel yet (it's in Blitz's settings).`,
        );
        return;
      }
      await ctx.reply(`${EMOJI.glyph} **From the archives**\n${pick(saved).value.body}`);
    },
  },
];
