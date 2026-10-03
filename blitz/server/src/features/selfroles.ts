// Roles people can pick for themselves (pronouns, games, regions, ping
// roles…): the community lists them in Blitz's settings, and "!role gamer"
// adds or removes one.

import { config } from "../config";
import { Command, UsageError } from "../core/commands";
import { communityRoles, hasRole } from "../core/members";
import { addRole, removeRole } from "../core/messaging";
import { settings } from "../core/settings";
import { NamedRole, matchRole } from "../logic/moderation";

async function pickable(): Promise<NamedRole[]> {
  const ids = new Set<string>(settings.selfRoles());
  if (ids.size === 0) return [];
  return (await communityRoles()).filter((r) => ids.has(r.id)).map((r) => ({ id: r.id, name: r.name }));
}

const NONE = `This community hasn't picked any roles for people to choose yet (it's in ${config.botName}'s settings).`;

export const selfRoleCommands: Command[] = [
  {
    name: "roles",
    summary: "Roles you can give yourself.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      const roles = await pickable();
      if (roles.length === 0) {
        await ctx.reply(`🎭 ${NONE}`);
        return;
      }
      const lines = roles.map((r) => `${hasRole(ctx.userId, r.id) ? "✅" : "▫️"} ${r.name}`);
      await ctx.reply([`🎭 **Roles you can pick**`, ...lines, "", `_\`${config.prefix}role <name>\` adds one, or takes it off if you have it._`].join("\n"));
    },
  },
  {
    name: "role",
    aliases: ["iam"],
    usage: "<role name>",
    summary: "Give yourself one of the pickable roles, or take it off.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      if (!ctx.rest) throw new UsageError(`Usage: \`${config.prefix}role <name>\`. \`${config.prefix}roles\` lists them.`);
      const roles = await pickable();
      if (roles.length === 0) {
        await ctx.reply(`🎭 ${NONE}`);
        return;
      }
      const found = matchRole(ctx.rest, roles);
      if (!found) throw new UsageError(`That isn't one of the pickable roles. \`${config.prefix}roles\` lists them.`);
      if (Array.isArray(found)) throw new UsageError(`Which one? ${found.map((r) => `**${r.name}**`).join(", ")}`);
      try {
        if (hasRole(ctx.userId, found.id)) {
          await removeRole(ctx.userId, found.id);
          await ctx.reply(`➖ Took off **${found.name}**.`);
        } else {
          await addRole(ctx.userId, found.id);
          await ctx.reply(`➕ You're now **${found.name}**!`);
        }
      } catch {
        await ctx.reply(`⚠️ I couldn't change that role. In **Settings → Roles**, ${config.botName}'s role needs to be above **${found.name}**.`);
      }
    },
  },
];
