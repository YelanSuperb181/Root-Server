// Team tools: announcements and events with opt-in pings, posting as the
// bot, and clearing a burst of messages.

import { rootServer, ChannelGuid, MessageDirectionTake, RootGuidUtils } from "@rootsdk/server-app";
import { config } from "../config";
import { read } from "../core/api";
import { Command, UsageError } from "../core/commands";
import { nickname } from "../core/members";
import { remove, send, sendEphemeral } from "../core/messaging";
import { mentionedChannelIds } from "../logic/text";

/** How many messages to ask Root for at once (other Apps use 50 too). */
const PAGE = 50;

/** A leading channel mention ("#news Big news") and the text after it. */
function channelAndText(rest: string): { channelId?: string; text: string } {
  return {
    channelId: mentionedChannelIds(rest)[0],
    text: rest.replace(/^\s*\[#[^\]]*\]\(root:\/\/channel\/[^)\s]+\)\s*/, "").trim(),
  };
}

export const staffCommands: Command[] = [
  {
    name: "announce",
    usage: "[#channel] <message>",
    summary: "Post an announcement here or in another channel.",
    level: "mod",
    category: "Staff",
    menu: "channel",
    async run(ctx) {
      const { channelId, text } = channelAndText(ctx.rest);
      if (!text) throw new UsageError(`Usage: \`${config.prefix}announce #news We hit 100 members! 🎉\``);
      await send(channelId ?? ctx.channelId, `📣 **Announcement**\n\n${text}\n\n_— ${await nickname(ctx.userId)}_`);
      if (channelId || ctx.from === "menu") await ctx.reply("✅ Announced!");
    },
  },
  {
    name: "event",
    usage: "[#channel] <details>",
    summary: "Post an event here or in another channel.",
    level: "mod",
    category: "Staff",
    menu: "channel",
    async run(ctx) {
      const { channelId, text } = channelAndText(ctx.rest);
      if (!text) throw new UsageError(`Usage: \`${config.prefix}event #events Game night Friday 8pm UTC 🎮\``);
      await send(channelId ?? ctx.channelId, `📅 **New event!**\n\n${text}\n\n_— ${await nickname(ctx.userId)}_`);
      if (channelId || ctx.from === "menu") await ctx.reply("✅ Event posted!");
    },
  },
  {
    name: "say",
    usage: "[#channel] <message>",
    summary: `Post a message as ${config.botName}.`,
    level: "mod",
    category: "Staff",
    menu: "channel",
    async run(ctx) {
      const target = mentionedChannelIds(ctx.rest)[0];
      const text = ctx.rest.replace(/^\s*\[#[^\]]*\]\(root:\/\/channel\/[^)\s]+\)\s*/, "").trim();
      if (!text) throw new UsageError(`Usage: \`${config.prefix}say #general Hello everyone!\``);
      await send(target ?? ctx.channelId, text);
      if (!target && ctx.from === "chat") await remove(ctx.channelId, ctx.messageId).catch(() => undefined);
      if (ctx.from === "menu") await ctx.reply("✅ Posted!");
    },
  },
  {
    name: "clear",
    aliases: ["purge"],
    usage: "<1-49>",
    summary: "Delete the last messages in this channel.",
    level: "mod",
    category: "Staff",
    menu: "no",
    async run(ctx) {
      const count = Number(ctx.args[0]);
      if (!Number.isInteger(count) || count < 1 || count > 49) throw new UsageError(`Usage: \`${config.prefix}clear 10\` (1-49 messages).`);
      const page = await read("channelMessages.list", () =>
        rootServer.community.channelMessages.list({
          channelId: ctx.channelId as ChannelGuid,
          messageDirectionTake: MessageDirectionTake.Older,
          dateAt: new Date(),
          // Always a full page: Root rejects very small ones.
          limit: PAGE,
        }),
      );
      // Newest first (message IDs carry their creation time): the command, then `count` more.
      const targets = page.messages
        .filter((m) => !m.deletedAt)
        .sort((a, b) => RootGuidUtils.toMilliseconds(b.id) - RootGuidUtils.toMilliseconds(a.id))
        .slice(0, count + 1);
      let removed = 0;
      for (const m of targets) {
        try {
          await remove(ctx.channelId, m.id);
          if (m.id !== ctx.messageId) removed++;
        } catch {
          // Already gone, or a system message; skip it.
        }
      }
      sendEphemeral(ctx.channelId, `🧹 Cleared ${removed} message(s).`, 5000);
    },
  },
];
