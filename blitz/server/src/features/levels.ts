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
import { knownPeople, nickname } from "../core/members";
import { send } from "../core/messaging";
import { settings } from "../core/settings";
import { kv } from "../core/store";
import { EMPTY_XP, XpRecord, applyMessage, levelFromXp, rankEntries, totalXpForLevel } from "../logic/levels";
import { fillTemplate, formatNumber, mentionedUserIds, pick, placeLabel, progressBar, userMention } from "../logic/text";

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
    const text = fillTemplate(pick(levelUpLines), { user: userMention(name, userId), level: String(level) });
    await send(settings.channel("levelUps") ?? channelId, text);
  } catch (err) {
    log("warn", "level-up announcement failed", { error: errMessage(err) });
  }
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

export const levelCommands: Command[] = [
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
      await ctx.reply(`✅ **${await nickname(target)}** now has ${formatNumber(xp)} XP (level ${level}).`);
    },
  },
];
