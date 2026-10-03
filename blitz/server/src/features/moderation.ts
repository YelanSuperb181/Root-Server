// Moderation that works the same in any community: warnings, mutes, kicks
// and bans, each kept as a numbered case so the team can look back at a
// member's history. A mute needs no special role: while it lasts, Blitz
// removes the member's messages itself. Staff can only act on people ranked
// below them, so mods can't kick each other or the owner.

import { rootServer, ChannelMessageCreatedEvent, UserGuid } from "@rootsdk/server-app";
import { config } from "../config";
import { read, write } from "../core/api";
import { Command, CommandContext, UsageError } from "../core/commands";
import { cancelJobs, onJob, scheduleOnce } from "../core/jobs";
import { serialize } from "../core/lock";
import { errMessage, log } from "../core/log";
import { accessLevel, communityRoles, isPerson, nickname } from "../core/members";
import { modLog, remove, sendEphemeral } from "../core/messaging";
import { kv } from "../core/store";
import { CaseKind, ModCase, activeWarnings, caseLine, outranks, parseLeadingDuration, parseTarget } from "../logic/moderation";
import { formatDuration } from "../logic/parse";
import { plural, truncate, userMention } from "../logic/text";
import { xpOf } from "./levels";

const caseKey = (id: number) => `case:${id}`;
const userCasesKey = (userId: string) => `cases:${userId}`;
const muteKey = (userId: string) => `mute:${userId}`;
const MUTE_JOB = "unmute";
const MAX_MUTE_MS = 28 * 86_400_000;
const DEFAULT_MUTE_MS = 3_600_000;
const NOTICE_EVERY_MS = 60_000;

interface Mute {
  userId: string;
  until: number;
  caseId: number;
}

const mutes = new Map<string, Mute>();
const lastNotice = new Map<string, number>();

export async function initModeration(): Promise<void> {
  for (const { value } of await kv.entries<Mute>("mute:")) mutes.set(value.userId, value);
  onJob(MUTE_JOB, async (userId) => {
    const mute = mutes.get(userId);
    if (mute && mute.until <= Date.now() + 5000) await endMute(userId, "ended");
  });
}

/** Saves a new case and adds it to the member's history. */
async function addCase(kind: CaseKind, userId: string, modId: string, reason?: string, durationMs?: number): Promise<ModCase> {
  const id = await kv.next("casestate:count");
  const record: ModCase = { id, kind, userId, modId, reason: reason || undefined, at: Date.now(), durationMs };
  await kv.set(caseKey(id), record);
  await kv.update<number[]>(userCasesKey(userId), (ids) => [...ids, id], []);
  return record;
}

export async function casesOf(userId: string): Promise<ModCase[]> {
  const ids = (await kv.get<number[]>(userCasesKey(userId))) ?? [];
  const cases = await Promise.all(ids.map((id) => kv.get<ModCase>(caseKey(id))));
  return cases.filter((c): c is ModCase => c !== undefined);
}

export function mutedUntil(userId: string): number | undefined {
  const mute = mutes.get(userId);
  return mute && mute.until > Date.now() ? mute.until : undefined;
}

async function endMute(userId: string, how: "ended" | "lifted", by?: string): Promise<boolean> {
  return serialize(muteKey(userId), async () => {
    if (!mutes.has(userId)) return false;
    mutes.delete(userId);
    await kv.delete(muteKey(userId));
    await cancelJobs(`mute-${userId}`).catch(() => undefined);
    const who = userMention(await nickname(userId), userId);
    await modLog(how === "ended" ? `🔊 ${who}'s mute ended.` : `🔊 ${who} was unmuted by **${await nickname(by ?? "")}**.`);
    return true;
  });
}

/**
 * Removes messages from muted members. True if the message was held back
 * (the caller should stop there).
 */
export async function holdIfMuted(evt: ChannelMessageCreatedEvent): Promise<boolean> {
  const mute = mutes.get(evt.userId);
  if (!mute) return false;
  if (mute.until <= Date.now()) {
    void endMute(evt.userId, "ended").catch(() => undefined);
    return false;
  }
  if ((await accessLevel(evt.userId)) !== "everyone") return false;
  try {
    await remove(evt.channelId, evt.id);
  } catch (err) {
    log("warn", "couldn't remove a muted member's message", { error: errMessage(err) });
    return false;
  }
  const now = Date.now();
  if (now - (lastNotice.get(evt.userId) ?? 0) > NOTICE_EVERY_MS) {
    lastNotice.set(evt.userId, now);
    sendEphemeral(evt.channelId, `🔇 ${userMention(await nickname(evt.userId), evt.userId)}, you're muted for another ${formatDuration(mute.until - now)}.`);
  }
  return true;
}

/** Who the command is about: an @mention or user ID first, or the author of the message it replies to. */
function targetOf(ctx: CommandContext, example: string): { userId: string; rest: string } {
  const named = parseTarget(ctx.rest);
  if (named) return named;
  const parent = ctx.evt.parentMessages?.[0]?.userId;
  if (parent) return { userId: parent, rest: ctx.rest };
  throw new UsageError(`Mention who it's for, or reply to their message. Like \`${config.prefix}${example}\``);
}

/** Checks the staff member may act on the target; replies and returns false if not. */
async function mayActOn(ctx: CommandContext, userId: string): Promise<boolean> {
  if (userId === ctx.userId) {
    await ctx.reply("🙃 You can't do that to yourself.");
    return false;
  }
  if (!isPerson(userId)) {
    await ctx.reply("🤖 That's an App or bot, not a person.");
    return false;
  }
  if (!outranks(ctx.level, await accessLevel(userId))) {
    await ctx.reply("🔒 They're on the team too, at your level or above. Ask an admin or the owner.");
    return false;
  }
  return true;
}

const who = async (userId: string) => userMention(await nickname(userId), userId);
const because = (reason?: string) => (reason ? `: ${truncate(reason, 300)}` : "");

export const moderationCommands: Command[] = [
  {
    name: "warn",
    usage: "@member <reason>",
    summary: "Give someone a warning; it's kept in their history.",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const { userId, rest } = targetOf(ctx, "warn @someone please keep it friendly");
      if (!(await mayActOn(ctx, userId))) return;
      const c = await addCase("warn", userId, ctx.userId, rest);
      const count = activeWarnings(await casesOf(userId));
      await ctx.reply(`⚠️ ${await who(userId)} has been warned${because(rest)} _(warning ${count}, case #${c.id})_`);
      await modLog(`⚠️ **${await nickname(ctx.userId)}** warned ${await who(userId)}${because(rest)} _(warning ${count}, case #${c.id})_`);
    },
  },
  {
    name: "warnings",
    usage: "[@member]",
    summary: "Your warnings (staff can check anyone's).",
    level: "everyone",
    category: "Moderation",
    async run(ctx) {
      const target = parseTarget(ctx.rest)?.userId ?? ctx.userId;
      if (target !== ctx.userId && ctx.level === "everyone") {
        await ctx.reply("🔒 You can only see your own warnings.");
        return;
      }
      const warnings = (await casesOf(target)).filter((c) => c.kind === "warn" && !c.revoked);
      const name = await nickname(target);
      if (warnings.length === 0) {
        await ctx.reply(`✨ ${target === ctx.userId ? "You have" : `**${name}** has`} no warnings.`);
        return;
      }
      const now = Date.now();
      const lines = await Promise.all(warnings.slice(-10).map(async (c) => caseLine(c, await nickname(c.modId), now)));
      await ctx.reply([`⚠️ **${name}** · ${plural(warnings.length, "warning")}`, ...lines].join("\n"));
    },
  },
  {
    name: "unwarn",
    usage: "<case number>",
    summary: "Take back a warning.",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const id = Number(ctx.args[0]?.replace(/^#/, ""));
      if (!Number.isInteger(id)) throw new UsageError(`Usage: \`${config.prefix}unwarn 12\` (the case number is in \`${config.prefix}warnings @someone\`).`);
      const c = await kv.get<ModCase>(caseKey(id));
      if (!c || c.kind !== "warn") throw new UsageError(`Case #${id} isn't a warning.`);
      if (c.revoked) {
        await ctx.reply(`Case #${id} was already taken back.`);
        return;
      }
      await kv.set(caseKey(id), { ...c, revoked: true });
      await ctx.reply(`↩️ Took back warning #${id} for ${await who(c.userId)}.`);
      await modLog(`↩️ **${await nickname(ctx.userId)}** took back warning #${id} for ${await who(c.userId)}.`);
    },
  },
  {
    name: "note",
    usage: "@member <note>",
    summary: "Add a private staff note to someone's history.",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const { userId, rest } = targetOf(ctx, "note @someone was rude in voice, keep an eye out");
      if (!rest) throw new UsageError(`Add the note, like \`${config.prefix}note @someone keeps arguing in #general\`.`);
      const c = await addCase("note", userId, ctx.userId, rest);
      await remove(ctx.channelId, ctx.messageId).catch(() => undefined);
      sendEphemeral(ctx.channelId, `📝 Noted (case #${c.id}).`, 5000);
      await modLog(`📝 **${await nickname(ctx.userId)}** added a note about ${await who(userId)}${because(rest)} _(case #${c.id})_`);
    },
  },
  {
    name: "history",
    aliases: ["cases", "modlog"],
    usage: "@member",
    summary: "Someone's full moderation history: warnings, mutes, kicks, bans and notes.",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const { userId } = targetOf(ctx, "history @someone");
      const cases = await casesOf(userId);
      const name = await nickname(userId);
      if (cases.length === 0) {
        await ctx.reply(`✨ **${name}** has a clean history.`);
        return;
      }
      const now = Date.now();
      const lines = await Promise.all(cases.slice(-15).map(async (c) => caseLine(c, await nickname(c.modId), now)));
      const older = cases.length > 15 ? `\n_…and ${cases.length - 15} older._` : "";
      await ctx.reply([`📋 **${name}** · ${plural(cases.length, "case")}`, ...lines].join("\n") + older);
    },
  },
  {
    name: "mute",
    aliases: ["timeout"],
    usage: "@member [1h] [reason]",
    summary: `Hide someone's messages for a while (1 hour unless you say; up to 28 days). ${config.botName} removes what they post.`,
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const { userId, rest } = targetOf(ctx, "mute @someone 30m cool off");
      if (!(await mayActOn(ctx, userId))) return;
      const timed = parseLeadingDuration(rest);
      const ms = timed?.ms ?? DEFAULT_MUTE_MS;
      if (ms < 60_000 || ms > MAX_MUTE_MS) throw new UsageError("A mute lasts between 1 minute and 28 days.");
      const reason = timed ? timed.rest : rest;
      const c = await addCase("mute", userId, ctx.userId, reason, ms);
      const mute: Mute = { userId, until: Date.now() + ms, caseId: c.id };
      await serialize(muteKey(userId), async () => {
        mutes.set(userId, mute);
        await kv.set(muteKey(userId), mute);
        await cancelJobs(`mute-${userId}`).catch(() => undefined);
        await scheduleOnce(MUTE_JOB, `mute-${userId}`, new Date(mute.until));
      });
      await ctx.reply(`🔇 ${await who(userId)} is muted for ${formatDuration(ms)}${because(reason)} _(case #${c.id})_`);
      await modLog(`🔇 **${await nickname(ctx.userId)}** muted ${await who(userId)} for ${formatDuration(ms)}${because(reason)} _(case #${c.id})_`);
    },
  },
  {
    name: "unmute",
    usage: "@member",
    summary: "End someone's mute early.",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const { userId } = targetOf(ctx, "unmute @someone");
      if (!(await endMute(userId, "lifted", ctx.userId))) {
        await ctx.reply(`${await who(userId)} isn't muted.`);
        return;
      }
      await addCase("unmute", userId, ctx.userId);
      await ctx.reply(`🔊 ${await who(userId)} can talk again.`);
    },
  },
  {
    name: "kick",
    usage: "@member [reason]",
    summary: "Remove someone from the community (they can rejoin).",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const { userId, rest } = targetOf(ctx, "kick @someone spamming");
      if (!(await mayActOn(ctx, userId))) return;
      const name = await nickname(userId);
      await write("communityMemberBans.kick", () => rootServer.community.communityMemberBans.kick({ userId: userId as UserGuid }));
      const c = await addCase("kick", userId, ctx.userId, rest);
      await ctx.reply(`👢 **${name}** was kicked${because(rest)} _(case #${c.id})_`);
      await modLog(`👢 **${await nickname(ctx.userId)}** kicked **${name}** (${userMention(name, userId)})${because(rest)} _(case #${c.id})_`);
    },
  },
  {
    name: "ban",
    usage: "@member [7d] [reason]",
    summary: "Ban someone, for good or for a while (like 7d).",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const { userId, rest } = targetOf(ctx, "ban @someone 7d scam links");
      if (!(await mayActOn(ctx, userId))) return;
      const timed = parseLeadingDuration(rest);
      const reason = timed ? timed.rest : rest;
      const name = await nickname(userId);
      await write("communityMemberBans.create", () =>
        rootServer.community.communityMemberBans.create({
          userId: userId as UserGuid,
          reason: reason ? truncate(reason, 200) : undefined,
          expiresAt: timed ? new Date(Date.now() + timed.ms) : undefined,
        }),
      );
      const c = await addCase("ban", userId, ctx.userId, reason, timed?.ms);
      const length = timed ? ` for ${formatDuration(timed.ms)}` : "";
      await ctx.reply(`🔨 **${name}** was banned${length}${because(reason)} _(case #${c.id})_`);
      await modLog(`🔨 **${await nickname(ctx.userId)}** banned **${name}** (${userMention(name, userId)})${length}${because(reason)} _(case #${c.id})_`);
    },
  },
  {
    name: "unban",
    usage: "<@member or user ID>",
    summary: `Lift a ban. \`${config.prefix}bans\` lists them with their IDs.`,
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const target = parseTarget(ctx.rest);
      if (!target) throw new UsageError(`Usage: \`${config.prefix}unban <user ID>\`. \`${config.prefix}bans\` shows the IDs.`);
      await write("communityMemberBans.delete", () => rootServer.community.communityMemberBans.delete({ userId: target.userId as UserGuid }));
      await addCase("unban", target.userId, ctx.userId, target.rest);
      await ctx.reply(`🕊️ Lifted the ban on ${await who(target.userId)}.`);
      await modLog(`🕊️ **${await nickname(ctx.userId)}** lifted the ban on ${await who(target.userId)}${because(target.rest)}`);
    },
  },
  {
    name: "bans",
    summary: "Who's banned, and why.",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const bans = await read("communityMemberBans.list", () => rootServer.community.communityMemberBans.list());
      if (bans.length === 0) {
        await ctx.reply("✨ Nobody is banned.");
        return;
      }
      const lines = await Promise.all(
        bans.slice(0, 25).map(async (b) => {
          const until = b.expiresAt ? ` · until ${new Date(b.expiresAt).toUTCString().slice(5, 22)} UTC` : "";
          return `• **${await nickname(b.userId)}** \`${b.userId}\`${until}${b.reason ? ` · ${truncate(b.reason, 120)}` : ""}`;
        }),
      );
      const more = bans.length > 25 ? `\n_…and ${bans.length - 25} more._` : "";
      await ctx.reply([`🔨 **${plural(bans.length, "ban")}**`, ...lines].join("\n") + more);
    },
  },
  {
    name: "userinfo",
    aliases: ["whois", "user"],
    usage: "[@member]",
    summary: "Who someone is here: roles, when they joined, level, warnings and whether they're muted.",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const userId = parseTarget(ctx.rest)?.userId ?? ctx.evt.parentMessages?.[0]?.userId ?? ctx.userId;
      const member = await read("communityMembers.get", () => rootServer.community.communityMembers.get({ userId: userId as UserGuid }));
      const roles = await communityRoles().catch(() => []);
      const roleNames = member.communityRoleIds.map((id) => roles.find((r) => r.id === id)?.name).filter((n): n is string => !!n);
      const joined = member.joinedAt ?? member.subscribedAt;
      const cases = await casesOf(userId);
      const muted = mutedUntil(userId);
      const xp = await xpOf(userId);
      const lines = [
        `👤 **${member.nickname || "someone"}** ${userMention(member.nickname || "member", userId)}`,
        `🆔 \`${userId}\``,
        joined ? `📅 Joined ${new Date(joined).toUTCString().slice(5, 16)}` : undefined,
        `🎭 ${roleNames.length > 0 ? roleNames.join(", ") : "No roles"}`,
        `🌿 Level ${xp.level} · ${plural(xp.messages, "message")}`,
        `📋 ${plural(activeWarnings(cases), "warning")} · ${plural(cases.length, "case")} in total`,
        muted ? `🔇 Muted for another ${formatDuration(muted - Date.now())}` : undefined,
      ].filter(Boolean);
      await ctx.reply(lines.join("\n"));
    },
  },
];
