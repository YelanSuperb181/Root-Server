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
import { modLog, notify, remove, sendEphemeral } from "../core/messaging";
import { communityName } from "../core/community";
import { settings } from "../core/settings";
import { kv } from "../core/store";
import { Ladder, describeLadder, ladderStep } from "../logic/guardian";
import { CaseKind, ModCase, activeWarnings, caseLine, outranks, parseLeadingDuration, parseTarget } from "../logic/moderation";
import { formatDuration } from "../logic/parse";
import { plural, truncate, userMention } from "../logic/text";
import { xpOf } from "./levels";
import { countMod } from "./pulse";

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
  countMod(kind);
  return record;
}

/** Who did it: a staff member's name, or Blitz itself for automatic actions (the warning ladder, cool-offs, the scam shield). */
export const AUTO = "auto";
export async function actorName(modId: string): Promise<string> {
  return modId === AUTO ? `${config.botName} (automatic)` : nickname(modId);
}

export async function getCase(id: number): Promise<ModCase | undefined> {
  return kv.get<ModCase>(caseKey(id));
}

/** The most recent cases across the community, newest first (for the Guardian and Pulse views). */
export async function recentCases(limit: number): Promise<ModCase[]> {
  const count = (await kv.get<number>("casestate:count")) ?? 0;
  const ids = Array.from({ length: Math.min(limit, count) }, (_, i) => count - i);
  const cases = await Promise.all(ids.map((id) => kv.get<ModCase>(caseKey(id))));
  return cases.filter((c): c is ModCase => c !== undefined);
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
    await modLog(how === "ended" ? `🔊 ${who}'s mute ended.` : `🔊 ${who} was unmuted by **${await actorName(by ?? "")}**.`);
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

const who = async (userId: string) => userMention(await nickname(userId), userId);
const because = (reason?: string) => (reason ? `: ${truncate(reason, 300)}` : "");

// ---- The actions themselves, shared by commands, the menu, the warning ladder, auto-mod and the scam shield ----

/** The community's warning ladder, from Blitz's settings (mute after 3 standing warnings unless they say otherwise). */
export function ladder(): Ladder {
  return {
    muteAt: settings.number("muteAfter", 3, 0, 50),
    kickAt: settings.number("kickAfter", 0, 0, 50),
    banAt: settings.number("banAfter", 0, 0, 50),
  };
}

export function ladderText(): string {
  return describeLadder(ladder());
}

/** Tells the member what happened and why (unless the community turned that off). Best effort. */
async function tellMember(userId: string, title: string, body: string): Promise<void> {
  if (!settings.on("notifyMembers")) return;
  await notify([userId], title, body);
}

const appealHint = () => (settings.on("inbox") ? " You can appeal from Blitz's menu." : "");

export interface ActionResult {
  case: ModCase;
  /** Lines describing what followed automatically (the warning ladder). */
  followUps: string[];
}

/** Warns someone, tells them, and climbs the warning ladder if they've reached a step. */
export async function warnMember(userId: string, modId: string, reason: string | undefined): Promise<ActionResult & { count: number }> {
  const c = await addCase("warn", userId, modId, reason);
  const count = activeWarnings(await casesOf(userId));
  const place = await communityName();
  await tellMember(userId, `⚠️ A warning in ${place}`, `${reason ? truncate(reason, 90) : "From the team."} (warning ${count})${appealHint()}`);
  await modLog(`⚠️ **${await actorName(modId)}** warned ${await who(userId)}${because(reason)} _(warning ${count}, case #${c.id})_`);
  const followUps: string[] = [];
  const step = ladderStep(count, ladder());
  const why = `automatic: ${plural(count, "standing warning")}`;
  try {
    if (step?.action === "mute") {
      await muteMember(userId, step.ms, AUTO, why);
      followUps.push(`🔇 That's ${count} warnings, so ${config.botName} muted them for ${formatDuration(step.ms)}.`);
    } else if (step?.action === "kick") {
      await kickMember(userId, AUTO, why);
      followUps.push(`👢 That's ${count} warnings, so ${config.botName} kicked them.`);
    } else if (step?.action === "ban") {
      await banMember(userId, AUTO, why);
      followUps.push(`🔨 That's ${count} warnings, so ${config.botName} banned them.`);
    }
  } catch (err) {
    log("warn", "the warning ladder couldn't act", { error: errMessage(err) });
    followUps.push(`⚠️ They've reached the ${step?.action} step of the warning ladder, but ${config.botName} couldn't do it (check its role and permissions).`);
  }
  return { case: c, count, followUps };
}

/** Mutes someone: while it lasts, Blitz removes what they post. */
export async function muteMember(userId: string, ms: number, modId: string, reason: string | undefined): Promise<ModCase> {
  const c = await addCase("mute", userId, modId, reason, ms);
  const mute: Mute = { userId, until: Date.now() + ms, caseId: c.id };
  await serialize(muteKey(userId), async () => {
    mutes.set(userId, mute);
    await kv.set(muteKey(userId), mute);
    await cancelJobs(`mute-${userId}`).catch(() => undefined);
    await scheduleOnce(MUTE_JOB, `mute-${userId}`, new Date(mute.until));
  });
  await tellMember(userId, `🔇 Muted in ${await communityName()}`, `For ${formatDuration(ms)}${reason ? `: ${truncate(reason, 80)}` : "."}${appealHint()}`);
  await modLog(`🔇 **${await actorName(modId)}** muted ${await who(userId)} for ${formatDuration(ms)}${because(reason)} _(case #${c.id})_`);
  return c;
}

export async function unmuteMember(userId: string, modId: string): Promise<boolean> {
  if (!(await endMute(userId, "lifted", modId))) return false;
  await addCase("unmute", userId, modId);
  await tellMember(userId, `🔊 Unmuted in ${await communityName()}`, "You can talk again.");
  return true;
}

export async function kickMember(userId: string, modId: string, reason: string | undefined): Promise<ModCase> {
  const name = await nickname(userId);
  // Told first: once they're out, a notification may not reach them.
  await tellMember(userId, `👢 Removed from ${await communityName()}`, `${reason ? truncate(reason, 100) : "By the team."} You can rejoin.`);
  await write("communityMemberBans.kick", () => rootServer.community.communityMemberBans.kick({ userId: userId as UserGuid }));
  const c = await addCase("kick", userId, modId, reason);
  await modLog(`👢 **${await actorName(modId)}** kicked **${name}** (${userMention(name, userId)})${because(reason)} _(case #${c.id})_`);
  return c;
}

export async function banMember(userId: string, modId: string, reason: string | undefined, ms?: number): Promise<ModCase> {
  const name = await nickname(userId);
  const length = ms ? ` for ${formatDuration(ms)}` : "";
  await tellMember(userId, `🔨 Banned from ${await communityName()}`, `${ms ? `For ${formatDuration(ms)}. ` : ""}${reason ? truncate(reason, 100) : ""}`);
  await write("communityMemberBans.create", () =>
    rootServer.community.communityMemberBans.create({
      userId: userId as UserGuid,
      reason: reason ? truncate(reason, 200) : undefined,
      expiresAt: ms ? new Date(Date.now() + ms) : undefined,
    }),
  );
  const c = await addCase("ban", userId, modId, reason, ms);
  await modLog(`🔨 **${await actorName(modId)}** banned **${name}** (${userMention(name, userId)})${length}${because(reason)} _(case #${c.id})_`);
  return c;
}

/**
 * Takes a case back (an accepted appeal, or a mod changing their mind): a
 * warning is struck from the record, a mute ends, a ban is lifted. Returns
 * what happened, or undefined if there was nothing to take back.
 */
export async function takeBack(caseId: number, modId: string, why?: string): Promise<string | undefined> {
  const c = await kv.get<ModCase>(caseKey(caseId));
  if (!c || c.revoked) return undefined;
  if (c.kind === "warn" || c.kind === "note") {
    await kv.set(caseKey(caseId), { ...c, revoked: true });
    await modLog(`↩️ **${await actorName(modId)}** took back ${c.kind === "warn" ? "warning" : "note"} #${caseId} for ${await who(c.userId)}${because(why)}`);
    return c.kind === "warn" ? "The warning is off your record." : "The note was removed.";
  }
  if (c.kind === "mute") {
    await kv.set(caseKey(caseId), { ...c, revoked: true });
    const ended = mutes.get(c.userId)?.caseId === caseId ? await unmuteMember(c.userId, modId) : false;
    await modLog(`↩️ **${await actorName(modId)}** took back mute #${caseId} for ${await who(c.userId)}${because(why)}`);
    return ended ? "Your mute is lifted." : "The mute is struck from your record.";
  }
  if (c.kind === "ban") {
    await kv.set(caseKey(caseId), { ...c, revoked: true });
    await write("communityMemberBans.delete", () => rootServer.community.communityMemberBans.delete({ userId: c.userId as UserGuid })).catch(() => undefined);
    await addCase("unban", c.userId, modId, why);
    await modLog(`🕊️ **${await actorName(modId)}** took back ban #${caseId} for ${await who(c.userId)}${because(why)}`);
    return "The ban is lifted.";
  }
  if (c.kind === "kick") {
    await kv.set(caseKey(caseId), { ...c, revoked: true });
    return "The kick is struck from your record.";
  }
  return undefined;
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
      const { case: c, count, followUps } = await warnMember(userId, ctx.userId, rest);
      await ctx.reply([`⚠️ ${await who(userId)} has been warned${because(rest)} _(warning ${count}, case #${c.id})_`, ...followUps].join("\n"));
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
      const lines = await Promise.all(warnings.slice(-10).map(async (c) => caseLine(c, await actorName(c.modId), now)));
      await ctx.reply([`⚠️ **${name}** · ${plural(warnings.length, "warning")}`, ...lines].join("\n"));
    },
  },
  {
    name: "unwarn",
    aliases: ["takeback", "revoke"],
    usage: "<case number> [why]",
    summary: "Take back a case: a warning comes off their record, a mute ends, a ban is lifted.",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const id = Number(ctx.args[0]?.replace(/^#/, ""));
      if (!Number.isInteger(id)) throw new UsageError(`Usage: \`${config.prefix}unwarn 12\` (the case number is in \`${config.prefix}history @someone\`).`);
      const c = await kv.get<ModCase>(caseKey(id));
      if (!c) throw new UsageError(`There's no case #${id}.`);
      if (c.revoked) {
        await ctx.reply(`Case #${id} was already taken back.`);
        return;
      }
      const why = ctx.args.slice(1).join(" ") || undefined;
      const done = await takeBack(id, ctx.userId, why);
      if (!done) throw new UsageError(`Case #${id} (${c.kind}) can't be taken back.`);
      await ctx.reply(`↩️ Took back case #${id} for ${await who(c.userId)}.`);
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
      if (ctx.from === "chat") await remove(ctx.channelId, ctx.messageId).catch(() => undefined);
      await ctx.notice(`📝 Noted (case #${c.id}).`, 5000);
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
      const lines = await Promise.all(cases.slice(-15).map(async (c) => caseLine(c, await actorName(c.modId), now)));
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
      const c = await muteMember(userId, ms, ctx.userId, reason);
      await ctx.reply(`🔇 ${await who(userId)} is muted for ${formatDuration(ms)}${because(reason)} _(case #${c.id})_`);
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
      if (!(await unmuteMember(userId, ctx.userId))) {
        await ctx.reply(`${await who(userId)} isn't muted.`);
        return;
      }
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
      const c = await kickMember(userId, ctx.userId, rest);
      await ctx.reply(`👢 **${name}** was kicked${because(rest)} _(case #${c.id})_`);
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
      const c = await banMember(userId, ctx.userId, reason, timed?.ms);
      const length = timed ? ` for ${formatDuration(timed.ms)}` : "";
      await ctx.reply(`🔨 **${name}** was banned${length}${because(reason)} _(case #${c.id})_`);
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
