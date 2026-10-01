// Team tools: announcements and events with opt-in pings, posting as the
// bot, and clearing a burst of messages.

import { rootServer, ChannelGuid, MessageDirectionTake, RootGuidUtils } from "@rootsdk/server-bot";
import { config } from "../config";
import { read } from "../core/api";
import { Command, UsageError } from "../core/commands";
import { directory } from "../core/directory";
import { nickname } from "../core/members";
import { remove, send, sendEphemeral } from "../core/messaging";
import { mentionedChannelIds } from "../logic/text";

async function postWithPing(channelKey: string, pingRole: string | null, title: string, body: string, author: string): Promise<boolean> {
  const channelId = directory.channelId(channelKey);
  if (!channelId) return false;
  const ping = pingRole ? `\n\n${directory.rolePing(pingRole)}` : "";
  await send(channelId, `${title}\n\n${body}\n\n_— ${author}_${ping}`);
  return true;
}

export const staffCommands: Command[] = [
  {
    name: "announce",
    usage: "<message>",
    summary: "Post in #announcements and ping everyone who opted in.",
    level: "mod",
    category: "Staff",
    async run(ctx) {
      if (!ctx.rest) throw new UsageError(`Usage: \`${config.prefix}announce We hit 100 members! 🎉\``);
      const ok = await postWithPing(config.announcements.channel, config.announcements.pingRole, "📣 **Announcement**", ctx.rest, await nickname(ctx.userId));
      await ctx.reply(ok ? "✅ Announced!" : "⚠️ The announcements channel doesn't exist yet.");
    },
  },
  {
    name: "event",
    usage: "<details>",
    summary: "Post an event in #events and ping everyone who opted in.",
    level: "mod",
    category: "Staff",
    async run(ctx) {
      if (!ctx.rest) throw new UsageError(`Usage: \`${config.prefix}event Game night Friday 8pm UTC on the Stage 🎮\``);
      const ok = await postWithPing(config.events.channel, config.events.pingRole, "📅 **New event!**", ctx.rest, await nickname(ctx.userId));
      await ctx.reply(ok ? "✅ Event posted!" : "⚠️ The events channel doesn't exist yet.");
    },
  },
  {
    name: "say",
    usage: "[#channel] <message>",
    summary: "Post a message as Sprout.",
    level: "mod",
    category: "Staff",
    async run(ctx) {
      const target = mentionedChannelIds(ctx.rest)[0];
      const text = ctx.rest.replace(/^\s*\[#[^\]]*\]\(root:\/\/channel\/[^)\s]+\)\s*/, "").trim();
      if (!text) throw new UsageError(`Usage: \`${config.prefix}say #general Hello everyone!\``);
      await send(target ?? ctx.channelId, text);
      if (!target) await remove(ctx.channelId, ctx.messageId).catch(() => undefined);
    },
  },
  {
    name: "clear",
    aliases: ["purge"],
    usage: "<1-50>",
    summary: "Delete the last messages in this channel.",
    level: "mod",
    category: "Staff",
    async run(ctx) {
      const count = Number(ctx.args[0]);
      if (!Number.isInteger(count) || count < 1 || count > 50) throw new UsageError(`Usage: \`${config.prefix}clear 10\` (1-50 messages).`);
      const page = await read("channelMessages.list", () =>
        rootServer.community.channelMessages.list({
          channelId: ctx.channelId as ChannelGuid,
          messageDirectionTake: MessageDirectionTake.Older,
          dateAt: new Date(),
          limit: count + 1,
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
