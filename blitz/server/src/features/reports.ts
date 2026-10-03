// Reports: anyone can quietly flag a problem to the team with "!report"
// (or by replying to the message with it). Blitz removes the report from the
// chat, posts it in the staff log and pings the staff roles.

import { config } from "../config";
import { Command, UsageError } from "../core/commands";
import { nickname } from "../core/members";
import { messageLink, modLog, notify, remove } from "../core/messaging";
import { channelLink, settings, staffPing } from "../core/settings";
import { parseTarget } from "../logic/moderation";
import { defuseMentions, quote, truncate, userMention } from "../logic/text";
import { reportAsTicket } from "./inbox";
import { triageReport } from "../domain/sentinel";

const lastReport = new Map<string, number>();
const COOLDOWN_MS = 2 * 60_000;

export const reportCommands: Command[] = [
  {
    name: "report",
    usage: "[@member] <what happened>",
    summary: "Quietly tell the team about a problem. Reply to a message with it to include that message.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      const parent = ctx.evt.parentMessages?.[0];
      const named = parseTarget(ctx.rest);
      const what = (named ? named.rest : ctx.rest).trim();
      if (!what && !parent) throw new UsageError(`Usage: \`${config.prefix}report @someone keeps sending scam links\`, or reply to the message with \`${config.prefix}report\`.`);

      // Take the report out of the chat first, so it stays between them and the team.
      if (ctx.from === "chat") await remove(ctx.channelId, ctx.messageId).catch(() => undefined);
      const me = userMention(await nickname(ctx.userId), ctx.userId);

      const now = Date.now();
      if (now - (lastReport.get(ctx.userId) ?? 0) < COOLDOWN_MS) {
        await ctx.notice(`🕐 ${me}, the team already has your last report. Give them a couple of minutes.`);
        return;
      }
      if (!settings.channel("log") && !settings.on("inbox")) {
        await ctx.notice(`${me}, this community hasn't set up a staff log for ${config.botName} yet, so please message someone on the team directly.`, 15_000);
        return;
      }
      lastReport.set(ctx.userId, now);

      const aboutId = named?.userId ?? parent?.userId;
      const where = ctx.from === "menu" ? `${config.botName}'s menu` : await channelLink(ctx.channelId);
      const parentText = parent ? truncate(defuseMentions(parent.messageContent ?? "").replace(/\s+/g, " "), 300) : "";
      // Filed in the inbox too, so the team can ask for more and tell them how it went.
      const ticket = await reportAsTicket(ctx.userId, [what || "(no details)", parentText ? `Reported message: "${parentText}"` : ""].filter(Boolean).join("\n"), aboutId);
      if (ticket) void triageReport(ticket.id, ctx.channelId, parent?.id).catch(() => undefined);
      const lines = [`🚩 **Report${ticket ? ` #${ticket.id}` : ""}** from ${me} in ${where}`];
      if (aboutId) lines.push(`About: ${userMention(await nickname(aboutId), aboutId)}`);
      if (what) lines.push(quote(truncate(defuseMentions(what), 1000)));
      if (parent) {
        const link = await messageLink(ctx.channelId, parent.id);
        const excerpt = truncate(defuseMentions(parent.messageContent ?? "").replace(/\s+/g, " "), 300);
        lines.push(`Reported message${link ? ` ([jump](${link}))` : ""}: ${excerpt ? `"${excerpt}"` : "_(no text)_"}`);
      }
      const ping = await staffPing();
      if (ticket) lines.push(`Answer the reporter from the Inbox in ${config.botName}'s menu, or \`${config.prefix}reply ${ticket.id} …\`.`);
      if (ping) lines.push(ping);
      await modLog(lines.join("\n"));
      await notify([], "🚩 New report", `${await nickname(ctx.userId)} reported a problem. It's in the staff log.`, settings.staffRoles());
      await ctx.notice(`🚩 Thanks ${me}, the team has been told.${ticket ? ` If they need more, they'll write to you in the Inbox in ${config.botName}'s menu (#${ticket.id}).` : ""}`, 12_000);
    },
  },
];
