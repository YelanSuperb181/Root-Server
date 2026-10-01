// `!wisp`: summons Wisp. Root Apps can't pop a window open on anyone's
// screen, so summoning posts a link into the domain (and makes Wisp light up
// for everyone already inside).

import { config } from "../config";
import { Command } from "../core/commands";
import { nickname } from "../core/members";
import { channelMention, plural } from "../logic/text";
import { domain } from "./domain";

export const domainCommands: Command[] = [
  {
    name: "wisp",
    aliases: ["summon", "domain"],
    summary: `Summon ${config.botName}: posts a link into its domain.`,
    level: "everyone",
    category: "Community",
    async run(ctx) {
      if (!domain.channelId) {
        await ctx.reply(`🌫️ ${config.botName}'s domain isn't set up in this community yet.`);
        return;
      }
      const name = await nickname(ctx.userId);
      domain.summon(ctx.userId, name);
      const inside = domain.watchers.size;
      const crowd = inside > 0 ? ` ${plural(inside, "person is", "people are")} already inside.` : "";
      await ctx.reply(
        `✨ **${config.botName} has been summoned** by ${name}. Step into ${channelMention(domain.channelName, domain.channelId)} to play.${crowd}`,
      );
    },
  },
];
