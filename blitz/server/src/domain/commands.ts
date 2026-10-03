// `!blitz`: a link into Blitz's domain, where everyone gets their own Blitz
// to play with. Root Apps can't pop a window open on anyone's screen, so a
// link is the way in. Other commands add the same link under their reply,
// unless the community turns it off in Blitz's settings.

import { config } from "../config";
import { Command, CommandUse } from "../core/commands";
import { settings } from "../core/settings";
import { channelMention } from "../logic/text";
import { domain } from "./domain";

/** Commands that never get the link: summoning already is one, and the rest are private. */
const QUIET = new Set(["blitz", "report", "warnings", "reminders", "forget"]);

/** The line under a command's reply: a link into Blitz's domain. Only for everyone's commands, never in private channels or the staff logs. */
export async function domainFooter(use: CommandUse): Promise<string | undefined> {
  if (!settings.on("domainLinks") || !domain.channelId) return undefined;
  if (use.level !== "everyone" || QUIET.has(use.name)) return undefined;
  if (use.channelId === domain.channelId || settings.isPrivate(use.channelId) || settings.isLog(use.channelId)) return undefined;
  return `🔮 ${channelMention(domain.channelName, domain.channelId)}`;
}

export const domainCommands: Command[] = [
  {
    name: "blitz",
    aliases: ["summon", "domain"],
    summary: `A link into ${config.botName}'s domain, where you get your own ${config.botName} to play with.`,
    level: "everyone",
    category: "Community",
    async run(ctx) {
      if (!domain.channelId) {
        await ctx.reply(`🌫️ ${config.botName}'s domain isn't set up in this community yet.`);
        return;
      }
      await ctx.reply(`✨ Come play! Step into ${channelMention(domain.channelName, domain.channelId)}: there's a ${config.botName} in there just for you.`);
    },
  },
];
