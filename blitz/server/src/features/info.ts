// !help, !ping and !server.

import { rootServer } from "@rootsdk/server-app";
import { config } from "../config";
import { read } from "../core/api";
import { Category, Command, allCommands, usageOf } from "../core/commands";
import { listChannels } from "../core/community";
import { atLeast, communityRoles, knownPeople } from "../core/members";
import { ChannelSetting, channelLink, settings } from "../core/settings";
import { parseWordList } from "../logic/moderation";
import { plural } from "../logic/text";
import { customCommands } from "./custom";

const CATEGORY_ORDER: Category[] = ["Community", "Levels", "Fun", "Moderation", "Staff"];
const CATEGORY_ICON: Record<Category, string> = {
  Community: "💬",
  Levels: "🌿",
  Fun: "🎲",
  Moderation: "🔨",
  Staff: "🛡️",
};

const CHANNELS: Array<[ChannelSetting, string]> = [
  ["welcome", "Welcomes"],
  ["levelUps", "Level-ups"],
  ["quotes", "Quote wall"],
  ["birthdays", "Birthdays"],
  ["suggestions", "Suggestions"],
  ["log", "Staff log"],
  ["messageLog", "Message log"],
];

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
      const lines = [`✨ **${config.botName} commands**`];
      for (const category of CATEGORY_ORDER) {
        const inCategory = commands.filter((c) => c.category === category);
        if (inCategory.length === 0) continue;
        lines.push("", `${CATEGORY_ICON[category]} **${category}**`);
        for (const cmd of inCategory) lines.push(`${usageOf(cmd)} · ${cmd.summary}`);
      }
      const customs = customCommands();
      if (customs.length > 0) {
        lines.push("", `📌 **This community's commands**`, customs.map((c) => `\`${config.prefix}${c.name}\``).join(" · "));
      }
      lines.push("", `_\`${config.prefix}help <command>\` for details._`);
      await ctx.reply(lines.join("\n"));
    },
  },
  {
    name: "ping",
    summary: `Check that ${config.botName} is awake.`,
    level: "everyone",
    category: "Fun",
    async run(ctx) {
      await ctx.reply("🏓 Pong! ✨");
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
      const channels = await listChannels().catch(() => []);
      const roles = await communityRoles().catch(() => []);
      const lines = [`✨ **${community.name}**`];
      if (community.description) lines.push(`_${community.description}_`);
      lines.push(
        "",
        `👥 ${plural(knownPeople().length, "member")} · 💬 ${plural(channels.length, "channel")} · 🎭 ${plural(roles.length, "role")}`,
      );
      await ctx.reply(lines.join("\n"));
    },
  },
  {
    name: "settings",
    summary: `What ${config.botName} is set up to do here.`,
    level: "mod",
    category: "Staff",
    async run(ctx) {
      const lines = [`🛠️ **${config.botName}'s settings here**`, ""];
      for (const [key, label] of CHANNELS) {
        const id = settings.channel(key);
        lines.push(`${label}: ${id ? await channelLink(id) : key === "levelUps" ? "where they happen" : "off"}`);
      }
      const named = async (id: string | undefined) => (id ? (await communityRoles()).find((r) => r.id === id)?.name : undefined);
      lines.push(
        `Role for new members: ${(await named(settings.role("joinRole"))) ?? "none"}`,
        `Birthday role: ${(await named(settings.role("birthdayRole"))) ?? "none"}`,
        `Roles people can pick: ${(await Promise.all(settings.selfRoles().map(named))).filter(Boolean).join(", ") || "none"}`,
        `Welcome message: ${settings.text("welcomeMessage") ? "your own" : "Blitz's"}`,
        `Levels: ${settings.on("levels") ? "on" : "off"} · Quote wall needs ${settings.number("quoteThreshold", 2, 1, 20)} 🗣️`,
        `Auto-mod: ${settings.on("automod") ? "on" : "off"} · Blocked words: ${parseWordList(settings.text("blockedWords")).length} · Invite links: ${settings.ticked("blockInvites") ? "blocked" : "allowed"}`,
        "",
        "_Change these in Blitz's App settings in Root._",
      );
      await ctx.reply(lines.join("\n"));
    },
  },
];
