// Levels: members earn XP for chatting (once a minute, so spam doesn't pay)
// and level up with a little celebration. A community can switch it off in
// Blitz's settings, and pick where level-ups are announced.

import type { ChannelMessageCreatedEvent, UserGuid } from "@rootsdk/server-app";
import { rootServer } from "@rootsdk/server-app";
import { levelUpLines } from "../content/lines";
import { config } from "../config";
import { read } from "../core/api";
import { Command, UsageError } from "../core/commands";
import { errMessage, log } from "../core/log";
import { communityRoles, hasRole, knownPeople, nickname } from "../core/members";
import { addRole, send } from "../core/messaging";
import { matchRole } from "../logic/moderation";
import { levelUpBonus } from "./stardust";
import { settings } from "../core/settings";
import { kv } from "../core/store";
import { EMPTY_XP, XpRecord, applyMessage, levelFromXp, rankEntries, totalXpForLevel } from "../logic/levels";
import { fillTemplate, formatNumber, mentionedRoleIds, mentionedUserIds, pick, placeLabel, progressBar, userMention } from "../logic/text";

const RULES = {
  minXp: config.levels.minXp,
  maxXp: config.levels.maxXp,
  cooldownMs: config.levels.cooldownSeconds * 1000,
};

const xpKey = (userId: string) => `xp:${userId}`;

/** Someone's level and message count, for !userinfo. */
export async function xpOf(userId: string): Promise<{ level: number; xp: number; messages: number }> {
  const record = (await kv.get<XpRecord>(xpKey(userId))) ?? EMPTY_XP;
  return { level: levelFromXp(record.xp).level, xp: record.xp, messages: record.messages };
}

export async function awardXp(evt: ChannelMessageCreatedEvent): Promise<void> {
  if (!settings.on("levels")) return;
  if (settings.isPrivate(evt.channelId) || settings.isLog(evt.channelId)) return;

  let before = 0;
  const after = await kv.update<XpRecord>(
    xpKey(evt.userId),
    (record) => {
      before = record.xp;
      return applyMessage(record, Date.now(), RULES);
    },
    EMPTY_XP,
  );
  const oldLevel = levelFromXp(before).level;
  const newLevel = levelFromXp(after.xp).level;
  if (newLevel > oldLevel) await onLevelUp(evt.userId, evt.channelId, newLevel);
}

async function onLevelUp(userId: string, channelId: string, level: number): Promise<void> {
  try {
    const name = await nickname(userId);
    const earned = await grantRewards(userId, level);
    const bonus = await levelUpBonus(userId, level);
    const extras = [
      ...earned.map((r) => `🎁 Unlocked the **${r}** role!`),
      bonus > 0 ? `✨ +${formatNumber(bonus)} Stardust` : "",
    ].filter(Boolean);
    const text = fillTemplate(pick(levelUpLines), { user: userMention(name, userId), level: String(level) });
    await send(settings.channel("levelUps") ?? channelId, [text, ...extras].join("\n"));
  } catch (err) {
    log("warn", "level-up announcement failed", { error: errMessage(err) });
  }
}

/** How levels work, for the menu. */
export function levelRules(): string {
  return `You earn ${config.levels.minXp}-${config.levels.maxXp} XP for chatting, at most once every ${config.levels.cooldownSeconds} seconds, so quality beats spam. Level 5 takes ${formatNumber(totalXpForLevel(5))} XP, level 10 takes ${formatNumber(totalXpForLevel(10))}.`;
}

/** Someone's level card and the top of the leaderboard (with names), for the menu. */
export async function levelsFor(userId: string, topCount: number): Promise<{
  level: number;
  xp: number;
  into: number;
  needed: number;
  messages: number;
  place: number;
  top: Array<{ userId: string; name: string; level: number; xp: number }>;
}> {
  const record = (await kv.get<XpRecord>(xpKey(userId))) ?? EMPTY_XP;
  const progress = levelFromXp(record.xp);
  const board = await leaderboard();
  const top = board.slice(0, topCount);
  const names = await nicknames(top.map((e) => e.userId));
  return {
    level: progress.level,
    xp: record.xp,
    into: progress.into,
    needed: progress.needed,
    messages: record.messages,
    place: board.findIndex((e) => e.userId === userId) + 1,
    top: top.map((e) => ({ userId: e.userId, name: names.get(e.userId) ?? "someone", level: levelFromXp(e.xp).level, xp: e.xp })),
  };
}

async function leaderboard(): Promise<Array<{ userId: string; xp: number }>> {
  const present = new Set(knownPeople());
  const entries = (await kv.entries<XpRecord>("xp:"))
    .map(({ key, value }) => ({ userId: key.slice(3), xp: value.xp }))
    .filter((e) => present.has(e.userId) && e.xp > 0);
  return rankEntries(entries);
}

async function nicknames(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (userIds.length === 0) return names;
  try {
    const members = await read("communityMembers.list", () => rootServer.community.communityMembers.list({ userIds: userIds as UserGuid[] }));
    for (const m of members) names.set(m.userId, m.nickname);
  } catch (err) {
    log("warn", "couldn't load nicknames", { error: errMessage(err) });
  }
  return names;
}

// ---- Reward roles: reach a level, get a role (free, unlike some apps) ----

export interface LevelReward {
  level: number;
  roleId: string;
}

const REWARDS_KEY = "levelrewards:list";

export async function levelRewards(): Promise<LevelReward[]> {
  return ((await kv.get<LevelReward[]>(REWARDS_KEY)) ?? []).sort((a, b) => a.level - b.level);
}

/** Gives every reward role up to `level` that they don't have yet; returns the names of the new ones. */
async function grantRewards(userId: string, level: number): Promise<string[]> {
  const due = (await levelRewards()).filter((r) => r.level <= level && !hasRole(userId, r.roleId));
  if (due.length === 0) return [];
  const roles = await communityRoles().catch(() => []);
  const given: string[] = [];
  for (const r of due) {
    try {
      await addRole(userId, r.roleId);
      given.push(roles.find((x) => x.id === r.roleId)?.name ?? "reward");
    } catch (err) {
      log("warn", "couldn't give a level reward role (is Blitz's role above it?)", { error: errMessage(err) });
    }
  }
  return given;
}

/** Turns "@Regular" or "Regular" into a role, or explains what went wrong. */
async function roleFrom(text: string): Promise<{ id: string; name: string }> {
  const roles = (await communityRoles()).map((r) => ({ id: r.id as string, name: r.name }));
  const mentioned = mentionedRoleIds(text)[0];
  if (mentioned) {
    const r = roles.find((x) => x.id === mentioned);
    if (r) return r;
  }
  const match = matchRole(text.replace(/\[@([^\]]*)\]\([^)]*\)/g, "$1"), roles);
  if (!match) throw new UsageError(`I couldn't find a role called "${text.trim()}".`);
  if (Array.isArray(match)) throw new UsageError(`That could be ${match.slice(0, 5).map((r) => `**${r.name}**`).join(", ")}. Which one?`);
  return match;
}

export const levelCommands: Command[] = [
  {
    name: "levelroles",
    aliases: ["rewards"],
    summary: "The roles you unlock by levelling up.",
    level: "everyone",
    category: "Levels",
    async run(ctx) {
      const list = await levelRewards();
      if (list.length === 0) {
        await ctx.reply(`🎁 No level rewards yet.${ctx.level !== "everyone" ? ` Add one: \`${config.prefix}levelrole 10 @Regular\`` : ""}`);
        return;
      }
      const roles = await communityRoles().catch(() => []);
      await ctx.reply(["🎁 **Level rewards**", ...list.map((r) => `Level **${r.level}** → ${roles.find((x) => x.id === r.roleId)?.name ?? "a role that's gone"}`)].join("\n"));
    },
  },
  {
    name: "levelrole",
    aliases: ["addreward"],
    usage: "<level> @role | remove <level>",
    summary: "Give a role to everyone who reaches a level (members already past it get it on their next level-up, or right away with `sync`).",
    level: "mod",
    category: "Levels",
    async run(ctx) {
      if (/^(remove|delete|off)$/i.test(ctx.args[0] ?? "")) {
        const level = Number(ctx.args[1]);
        const list = await levelRewards();
        if (!list.some((r) => r.level === level)) throw new UsageError(`There's no reward at level ${ctx.args[1] ?? "?"}.`);
        await kv.set(REWARDS_KEY, list.filter((r) => r.level !== level));
        await ctx.reply(`🗑️ Removed the level ${level} reward. (Anyone who has the role keeps it.)`);
        return;
      }
      if (/^sync$/i.test(ctx.args[0] ?? "")) {
        const list = await levelRewards();
        if (list.length === 0) throw new UsageError("There are no level rewards to hand out yet.");
        let given = 0;
        for (const { key, value } of await kv.entries<XpRecord>("xp:")) {
          const userId = key.slice(3);
          if (!knownPeople().includes(userId)) continue;
          given += (await grantRewards(userId, levelFromXp(value.xp).level)).length;
        }
        await ctx.reply(`🎁 Handed out ${given} reward role${given === 1 ? "" : "s"} to members who'd already earned them.`);
        return;
      }
      const level = Number(ctx.args[0]);
      if (!Number.isInteger(level) || level < 1 || level > 500) throw new UsageError(`Usage: \`${config.prefix}levelrole 10 @Regular\`, \`${config.prefix}levelrole remove 10\` or \`${config.prefix}levelrole sync\`.`);
      const role = await roleFrom(ctx.args.slice(1).join(" "));
      const list = (await levelRewards()).filter((r) => r.level !== level);
      await kv.set(REWARDS_KEY, [...list, { level, roleId: role.id }]);
      await ctx.reply(`🎁 Reaching level **${level}** now unlocks **${role.name}**. (\`${config.prefix}levelrole sync\` gives it to everyone already past it.)`);
    },
  },
  {
    name: "rank",
    aliases: ["level", "xp"],
    usage: "[@member]",
    summary: "Your level, XP and leaderboard spot (or someone else's).",
    level: "everyone",
    category: "Levels",
    async run(ctx) {
      const target = mentionedUserIds(ctx.rest)[0] ?? ctx.userId;
      const record = (await kv.get<XpRecord>(xpKey(target))) ?? EMPTY_XP;
      const progress = levelFromXp(record.xp);
      const board = await leaderboard();
      const place = board.findIndex((e) => e.userId === target) + 1;
      const name = await nickname(target);
      await ctx.reply(
        [
          `🌿 **${name}** · Level ${progress.level}`,
          `${progressBar(progress.fraction)} ${formatNumber(progress.into)}/${formatNumber(progress.needed)} XP to level ${progress.level + 1}`,
          `${formatNumber(record.xp)} XP total · ${formatNumber(record.messages)} messages${place > 0 ? ` · #${place} on the leaderboard` : ""}`,
        ].join("\n"),
      );
    },
  },
  {
    name: "top",
    aliases: ["leaderboard", "lb"],
    summary: "The 10 most active members.",
    level: "everyone",
    category: "Levels",
    async run(ctx) {
      const board = await leaderboard();
      if (board.length === 0) {
        await ctx.reply("🏆 Nobody's on the leaderboard yet. Start chatting!");
        return;
      }
      const top = board.slice(0, 10);
      const names = await nicknames(top.map((e) => e.userId));
      const lines = ["🏆 **Leaderboard**", ""];
      top.forEach((e, i) => {
        lines.push(`${placeLabel(i + 1)} **${names.get(e.userId) ?? "someone"}** · Level ${levelFromXp(e.xp).level} · ${formatNumber(e.xp)} XP`);
      });
      const mine = board.findIndex((e) => e.userId === ctx.userId);
      if (mine >= 10) lines.push("", `You're **#${mine + 1}** with ${formatNumber(board[mine].xp)} XP. Keep it up!`);
      await ctx.reply(lines.join("\n"));
    },
  },
  {
    name: "levels",
    summary: "How levels work.",
    level: "everyone",
    category: "Levels",
    async run(ctx) {
      if (!settings.on("levels")) {
        await ctx.reply("🌿 Levels are switched off in this community.");
        return;
      }
      await ctx.reply(
        [
          "🌿 **How levels work**",
          `You earn ${config.levels.minXp}-${config.levels.maxXp} XP for chatting, at most once every ${config.levels.cooldownSeconds} seconds, so quality beats spam.`,
          `Level 5 takes ${formatNumber(totalXpForLevel(5))} XP, level 10 takes ${formatNumber(totalXpForLevel(10))}.`,
        ].join("\n"),
      );
    },
  },
  {
    name: "setxp",
    usage: "@member <xp> | @member level <n>",
    summary: "Set someone's XP, e.g. to carry levels over from another app.",
    level: "mod",
    category: "Staff",
    async run(ctx) {
      const target = mentionedUserIds(ctx.rest)[0];
      const words = ctx.rest.replace(/\[@[^\]]*\]\([^)]*\)/g, "").trim().split(/\s+/);
      const levelMode = words[0]?.toLowerCase() === "level";
      const amount = Number(levelMode ? words[1] : words[0]);
      if (!target || !Number.isInteger(amount) || amount < 0 || (levelMode && amount > 500)) {
        throw new UsageError(`Usage: \`${config.prefix}setxp @member 1500\` or \`${config.prefix}setxp @member level 12\``);
      }
      const xp = levelMode ? totalXpForLevel(amount) : amount;
      await kv.update<XpRecord>(xpKey(target), (r) => ({ ...r, xp }), EMPTY_XP);
      const level = levelFromXp(xp).level;
      const earned = await grantRewards(target, level);
      await ctx.reply(`✅ **${await nickname(target)}** now has ${formatNumber(xp)} XP (level ${level}).${earned.length ? ` 🎁 ${earned.join(", ")}` : ""}`);
    },
  },
];
