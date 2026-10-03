// `!blitz`: summons Blitz. Root Apps can't pop a window open on anyone's
// screen, so summoning posts a link into the domain (and makes Blitz light up
// for everyone already inside). Other commands do a lighter version of the
// same: a link to the domain under their reply, and a spin from Blitz,
// unless the community turns it off in Blitz's settings.

import { config } from "../config";
import { Command, CommandUse } from "../core/commands";
import { nickname } from "../core/members";
import { settings } from "../core/settings";
import { channelMention, plural } from "../logic/text";
import { domain } from "./domain";

/** Commands that never bring up the domain: summoning already does, and the rest are private. */
const QUIET = new Set(["blitz", "report", "warnings", "reminders", "forget"]);
/** Blitz spins for a command at most this often, so a busy chat doesn't keep it spinning. */
const SPIN_EVERY_MS = 15_000;
let lastSpin = 0;

/**
 * The line under a command's reply: a link into Blitz's domain. Blitz also
 * pops up in the domain for everyone inside. Only for everyone's commands,
 * and never in private channels or the staff logs.
 */
export async function domainFooter(use: CommandUse): Promise<string | undefined> {
  if (!settings.on("domainLinks") || !domain.channelId) return undefined;
  if (use.level !== "everyone" || QUIET.has(use.name)) return undefined;
  if (use.channelId === domain.channelId || settings.isPrivate(use.channelId) || settings.isLog(use.channelId)) return undefined;
  const now = Date.now();
  if (now - lastSpin >= SPIN_EVERY_MS) {
    lastSpin = now;
    domain.summon(use.userId, await nickname(use.userId));
  }
  return `🔮 ${channelMention(domain.channelName, domain.channelId)}`;
}

export const domainCommands: Command[] = [
  {
    name: "blitz",
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
