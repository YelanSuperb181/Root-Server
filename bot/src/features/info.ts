// !help, !ping and !server.

import { rootServer } from "@rootsdk/server-bot";
import { blueprint } from "../blueprint/layout";
import { config } from "../config";
import { read } from "../core/api";
import { Category, Command, allCommands, usageOf } from "../core/commands";
import { directory } from "../core/directory";
import { atLeast, knownPeople } from "../core/members";
import { formatNumber } from "../logic/text";

const CATEGORY_ORDER: Category[] = ["Community", "Levels", "Fun", "Staff", "Setup"];
const CATEGORY_ICON: Record<Category, string> = {
  Community: "💬",
  Levels: "🌿",
  Fun: "🎲",
  Staff: "🛡️",
  Setup: "🛠️",
};

export const infoCommands: Command[] = [
  {
    name: "help",
    aliases: ["commands"],
    usage: "[command]",
    summary: "This list, or details about one command.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      const commands = allCommands().filter((c) => atLeast(ctx.level, c.level));
      const asked = ctx.args[0]?.toLowerCase().replace(config.prefix, "");
      if (asked) {
        const cmd = allCommands().find((c) => c.name === asked || c.aliases?.includes(asked));
        if (!cmd) {
          await ctx.reply(`🤷 I don't know \`${config.prefix}${asked}\`. Try \`${config.prefix}help\`.`);
          return;
        }
        const aka = cmd.aliases?.length ? `\nAlso: ${cmd.aliases.map((a) => `\`${config.prefix}${a}\``).join(", ")}` : "";
        await ctx.reply(`${usageOf(cmd)}\n${cmd.summary}${aka}`);
        return;
      }
      const lines = [`🌱 **${config.botName} commands**`];
      for (const category of CATEGORY_ORDER) {
        const inCategory = commands.filter((c) => c.category === category);
        if (inCategory.length === 0) continue;
        lines.push("", `${CATEGORY_ICON[category]} **${category}**`);
        for (const cmd of inCategory) lines.push(`${usageOf(cmd)} · ${cmd.summary}`);
      }
      lines.push("", `_\`${config.prefix}help <command>\` for details._`);
      await ctx.reply(lines.join("\n"));
    },
  },
  {
    name: "ping",
    summary: "Check that Sprout is awake.",
    level: "everyone",
    category: "Fun",
    async run(ctx) {
      await ctx.reply("🏓 Pong! 🌱");
    },
  },
  {
    name: "server",
    aliases: ["about", "community"],
    summary: "A quick look at the community.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      const community = await read("communities.get", () => rootServer.community.communities.get());
      const channels = blueprint.groups.flatMap((g) => g.channels).filter((c) => directory.channelId(c.key)).length;
      const lines = [`🌱 **${community.name}**`];
      if (community.description) lines.push(`_${community.description}_`);
      lines.push(
        "",
        `👥 ${formatNumber(knownPeople().length)} members · 💬 ${channels} channels · 🎭 ${blueprint.roles.length} roles`,
        `Start here: ${directory.channelMention("welcome")} · Pick roles: ${directory.channelMention("roles")}`,
      );
      await ctx.reply(lines.join("\n"));
    },
  },
];
