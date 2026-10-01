// Levels: members earn XP for chatting (once a minute, so spam doesn't pay),
// level up with a little celebration, and unlock roles along the way.

import type { ChannelMessageCreatedEvent, UserGuid } from "@rootsdk/server-app";
import { rootServer } from "@rootsdk/server-app";
import { levelUpLines } from "../content/lines";
import { config } from "../config";
import { read } from "../core/api";
import { Command, UsageError } from "../core/commands";
import { directory } from "../core/directory";
import { serialize } from "../core/lock";
import { errMessage, log } from "../core/log";
import { hasRole, knownPeople, nickname } from "../core/members";
import { addRole, removeRole, send } from "../core/messaging";
import { kv } from "../core/store";
import {
  EMPTY_XP,
  LevelReward,
  XpRecord,
  applyMessage,
  levelFromXp,
  rankEntries,
  rewardsForLevel,
  totalXpForLevel,
} from "../logic/levels";
import { fillTemplate, formatNumber, mentionedUserIds, pick, placeLabel, progressBar, userMention } from "../logic/text";

const RULES = {
  minXp: config.levels.minXp,
  maxXp: config.levels.maxXp,
  cooldownMs: config.levels.cooldownSeconds * 1000,
};

const xpKey = (userId: string) => `xp:${userId}`;

export async function awardXp(evt: ChannelMessageCreatedEvent): Promise<void> {
  if (!config.levels.enabled) return;
  const channelKey = directory.channelKey(evt.channelId);
  if (channelKey && (config.levels.noXpIn as readonly string[]).includes(channelKey)) return;

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
    let text = fillTemplate(pick(levelUpLines), { user: userMention(name, userId), level: String(level) });
    const earned = await syncRewards(userId, level);
    if (earned) text += `\n🏅 New role unlocked: **${directory.roleName(earned.role)}**!`;
    const target = config.levels.announceIn ? directory.channelId(config.levels.announceIn) ?? channelId : channelId;
    await send(target, text);
  } catch (err) {
    log("warn", "level-up announcement failed", { error: errMessage(err) });
  }
}

/** Gives the member the reward roles for their level. Returns a reward they just earned, if any. */
async function syncRewards(userId: string, level: number): Promise<LevelReward | undefined> {
  const rewards = config.levels.rewards as readonly LevelReward[];
  const wanted = rewardsForLevel(level, rewards, config.levels.stackRewards);
  const wantedRoles = new Set(wanted.map((r) => r.role));
  let earned: LevelReward | undefined;

  return serialize(`roles:${userId}`, async () => {
    for (const reward of rewards) {
      const roleId = directory.roleId(reward.role);
      if (!roleId) continue;
      const has = hasRole(userId, roleId);
      if (wantedRoles.has(reward.role) && !has) {
        await addRole(userId, roleId);
        earned = reward;
      } else if (!wantedRoles.has(reward.role) && has) {
        await removeRole(userId, roleId);
      }
    }
    return earned;
  });
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
    summary: "How levels work and which roles you can unlock.",
    level: "everyone",
    category: "Levels",
    async run(ctx) {
      const ladder = config.levels.rewards.map((r) => `• Level ${r.level} → **${directory.roleName(r.role)}** (${formatNumber(totalXpForLevel(r.level))} XP)`);
      await ctx.reply(
        [
          "🌿 **How levels work**",
          `You earn ${config.levels.minXp}-${config.levels.maxXp} XP for chatting, at most once every ${config.levels.cooldownSeconds} seconds, so quality beats spam.`,
          "",
          ...ladder,
        ].join("\n"),
      );
    },
  },
  {
    name: "setxp",
    usage: "@member <xp> | @member level <n>",
    summary: "Set someone's XP, e.g. to carry levels over from Discord.",
    level: "admin",
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
      await syncRewards(target, level);
      await ctx.reply(`✅ **${await nickname(target)}** now has ${formatNumber(xp)} XP (level ${level}).`);
    },
  },
];
