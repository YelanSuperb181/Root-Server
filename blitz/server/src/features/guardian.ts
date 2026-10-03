// Guardian: Blitz's shields. The scam shield removes account-stealing links
// (and mutes the sender for an hour, since their account may be hacked); the
// raid shield notices a flood of joins and holds the newcomers to tighter
// rules; newcomers wait a few minutes before they can post links; and the
// team can lock a channel (or everything) or slow it down. Locks and
// slowmodes are kept by Blitz itself, removing what doesn't fit, so they
// need no extra permissions. Staff are never held back by any of it.

import { rootServer, ChannelMessageCreatedEvent, CommunityEvent, CommunityJoinedEvent, UserGuid } from "@rootsdk/server-app";
import { config } from "../config";
import { read } from "../core/api";
import { Command, CommandContext, UsageError } from "../core/commands";
import { errMessage, log } from "../core/log";
import { accessLevel, nickname } from "../core/members";
import { modLog, notify, remove, send, sendEphemeral } from "../core/messaging";
import { channelLink, settings, staffPing } from "../core/settings";
import { kv } from "../core/store";
import { RaidState, clampHold, onJoin, raidActive, recordJoin, slowmodeWait } from "../logic/guardian";
import { parseLeadingDuration } from "../logic/moderation";
import { formatDuration } from "../logic/parse";
import { checkScam, hasLink } from "../logic/scams";
import { defuseMentions, mentionedChannelIds, mentionedRoleIds, mentionedUserIds, plural, truncate, userMention } from "../logic/text";
import { AUTO, muteMember } from "./moderation";
import { countCatch } from "./pulse";

/** A locked channel ("all": every channel). */
interface Lock {
  channelId: string;
  until?: number;
  reason?: string;
  by: string;
  at: number;
}

interface Slow {
  channelId: string;
  ms: number;
  by: string;
  at: number;
}

/** Something a shield (or auto-mod) caught, for the Guardian view and the activity numbers. */
export interface Catch {
  kind: string;
  userId: string;
  channelId: string;
  at: number;
  detail: string;
}

const RAID_KEY = "guardian:raid";
const LOCKS_KEY = "guardian:locks";
const SLOW_KEY = "guardian:slow";
const CATCHES_KEY = "guardian:catches";
const MAX_CATCHES = 80;
/** Raid joiners are held to newcomer rules this long, whatever the setting. */
const RAID_NEWCOMER_MS = 30 * 60_000;
/** Raid joiners may post this often. */
const RAID_SLOW_MS = 10_000;
const SCAM_MUTE_MS = 3_600_000;
const NOTICE_EVERY_MS = 30_000;

let raid: RaidState = { until: 0, joined: [] };
const joinTimes: number[] = [];
/** When recent joiners joined (from join events; older members are looked up). */
const joinedAt = new Map<string, number>();
const locks = new Map<string, Lock>();
const slows = new Map<string, Slow>();
const lastPost = new Map<string, number>();
const lastNotice = new Map<string, number>();
let catches: Catch[] = [];
let saveCatches: ReturnType<typeof setTimeout> | undefined;

export async function initGuardian(): Promise<void> {
  raid = (await kv.get<RaidState>(RAID_KEY)) ?? raid;
  for (const lock of (await kv.get<Lock[]>(LOCKS_KEY)) ?? []) locks.set(lock.channelId, lock);
  for (const slow of (await kv.get<Slow[]>(SLOW_KEY)) ?? []) slows.set(slow.channelId, slow);
  catches = (await kv.get<Catch[]>(CATCHES_KEY)) ?? [];

  rootServer.community.communities.on(CommunityEvent.CommunityJoined, (evt: CommunityJoinedEvent) => void onJoined(evt.userId));

  // Timed locks open again on their own, with a note in the channel.
  setInterval(() => void expireLocks(), 30_000).unref();
  // Memory stays flat.
  setInterval(() => {
    const cutoff = Date.now() - 2 * 3_600_000;
    for (const [id, at] of joinedAt) if (at < cutoff) joinedAt.delete(id);
    for (const [k, at] of lastPost) if (at < cutoff) lastPost.delete(k);
    for (const [k, at] of lastNotice) if (at < cutoff) lastNotice.delete(k);
  }, 15 * 60_000).unref();
}

/** Notes something a shield caught (kept for the Guardian view). */
export function noteCatch(kind: string, userId: string, channelId: string, detail: string): void {
  countCatch(kind);
  catches = [...catches.slice(-(MAX_CATCHES - 1)), { kind, userId, channelId, at: Date.now(), detail: truncate(detail, 160) }];
  if (!saveCatches) {
    saveCatches = setTimeout(() => {
      saveCatches = undefined;
      kv.set(CATCHES_KEY, catches).catch(() => undefined);
    }, 5000);
  }
}

export function recentCatches(): readonly Catch[] {
  return catches;
}

// ---- Raids --------------------------------------------------------------------------

async function onJoined(userId: string): Promise<void> {
  const now = Date.now();
  joinedAt.set(userId, now);
  if (!settings.on("raidShield")) return;
  const threshold = settings.number("raidJoins", 8, 3, 100);
  const result = onJoin(raid, userId, recordJoin(joinTimes, now), threshold, now);
  const changed = result.state !== raid;
  raid = result.state;
  if (changed) await kv.set(RAID_KEY, raid).catch(() => undefined);
  if (result.started) {
    noteCatch("raid", userId, "", `${joinTimes.length} joins in a minute`);
    const staff = await staffPing();
    await modLog(
      `🚨 **Raid shield up**: ${plural(joinTimes.length, "person", "people")} joined within a minute. For the next 15 minutes, newcomers can't post links or mentions and can only post every ${RAID_SLOW_MS / 1000} seconds. ${staff || "Staff"}, \`${config.prefix}raid off\` ends it early; \`${config.prefix}lockdown all\` locks everything.`,
    );
    await notify([], "🚨 Raid shield up", `${joinTimes.length} people joined within a minute. Newcomers are being held back.`, settings.staffRoles());
  }
}

export function raidStatus(): { active: boolean; until: number; manual: boolean; joined: number; startedAt?: number } {
  const now = Date.now();
  return { active: raidActive(raid, now), until: raid.until, manual: raid.manual === true, joined: raid.joined.length, startedAt: raid.startedAt };
}

/** When someone joined (0 if it's been a long time or can't be told). */
async function joinTime(userId: string): Promise<number> {
  const known = joinedAt.get(userId);
  if (known !== undefined) return known;
  try {
    const member = await read("communityMembers.get", () => rootServer.community.communityMembers.get({ userId: userId as UserGuid }));
    const at = member.joinedAt ? new Date(member.joinedAt).getTime() : 0;
    joinedAt.set(userId, at);
    return at;
  } catch {
    return 0;
  }
}

// ---- Locks and slowmode ----------------------------------------------------------------

function lockOn(channelId: string, now: number): Lock | undefined {
  for (const id of [channelId, "all"]) {
    const lock = locks.get(id);
    if (lock && (!lock.until || lock.until > now)) return lock;
  }
  return undefined;
}

async function saveLocks(): Promise<void> {
  await kv.set(LOCKS_KEY, [...locks.values()]);
}

async function saveSlows(): Promise<void> {
  await kv.set(SLOW_KEY, [...slows.values()]);
}

async function expireLocks(): Promise<void> {
  const now = Date.now();
  let changed = false;
  for (const lock of [...locks.values()]) {
    if (!lock.until || lock.until > now) continue;
    locks.delete(lock.channelId);
    changed = true;
    if (lock.channelId !== "all") await send(lock.channelId, "🔓 This channel is open again.").catch(() => undefined);
    await modLog(`🔓 The lockdown on ${lock.channelId === "all" ? "every channel" : await channelLink(lock.channelId)} ended.`);
  }
  if (changed) await saveLocks().catch(() => undefined);
  if (raid.until && raid.until <= now && raid.joined.length && !raid.manual) {
    raid = { until: 0, joined: [] };
    await kv.set(RAID_KEY, raid).catch(() => undefined);
    await modLog("🛡️ The raid shield is down again.");
  }
}

export function locksAndSlows(): { locks: Lock[]; slows: Slow[] } {
  const now = Date.now();
  return { locks: [...locks.values()].filter((l) => !l.until || l.until > now), slows: [...slows.values()] };
}

// ---- Screening each message --------------------------------------------------------------

async function hold(evt: ChannelMessageCreatedEvent, notice: string | undefined, kind: string, detail: string): Promise<boolean> {
  try {
    await remove(evt.channelId, evt.id);
  } catch (err) {
    log("warn", `guardian couldn't remove a message (${kind})`, { error: errMessage(err) });
    return false;
  }
  noteCatch(kind, evt.userId, evt.channelId, detail);
  const key = `${evt.userId}:${kind}`;
  const now = Date.now();
  if (notice && now - (lastNotice.get(key) ?? 0) > NOTICE_EVERY_MS) {
    lastNotice.set(key, now);
    sendEphemeral(evt.channelId, notice);
  }
  return true;
}

/** Returns true if the message was held back (the caller stops there). */
export async function screenGuardian(evt: ChannelMessageCreatedEvent): Promise<boolean> {
  if (settings.isLog(evt.channelId)) return false;
  const text = evt.messageContent ?? "";
  const extra = (evt.messageUris ?? []).map((u) => u.uri);
  const level = await accessLevel(evt.userId);
  const staff = level !== "everyone";
  const now = Date.now();

  // The scam shield looks at everyone's links: a hacked mod account posts scams too.
  if (settings.on("scamShield")) {
    const scam = checkScam(text, extra);
    if (scam && (scam.confidence === "high" || !staff)) {
      const name = await nickname(evt.userId);
      const who = userMention(name, evt.userId);
      if (await hold(evt, `🛡️ ${who}, ${config.botName} removed a link: ${scam.reason}.`, "scam", scam.signal)) {
        const where = await channelLink(evt.channelId);
        await modLog(`🎣 **Scam shield** removed a link from **${name}** in ${where} (${scam.signal}): "${truncate(defuseMentions(text).replace(/\s+/g, " "), 160)}"`);
        if (scam.confidence === "high" && !staff) {
          await muteMember(evt.userId, SCAM_MUTE_MS, AUTO, `posted a scam link (${scam.host}); their account may be hacked`).catch((err) =>
            log("warn", "couldn't mute after a scam link", { error: errMessage(err) }),
          );
          await notify([evt.userId], "🎣 A scam link was removed", "If you didn't send it, your account may be hacked: change your password and log out of other devices.");
        }
        return true;
      }
    }
  }
  if (staff) return false;

  // Locked channels: only the team talks.
  const lock = lockOn(evt.channelId, now);
  if (lock) {
    const left = lock.until ? ` for another ${formatDuration(lock.until - now)}` : "";
    return hold(evt, `🔒 ${userMention(await nickname(evt.userId), evt.userId)}, this channel is locked${left}${lock.reason ? `: ${truncate(lock.reason, 120)}` : ""}.`, "lockdown", "posted in a locked channel");
  }

  // Raid joiners and newcomers.
  const raidOn = raidActive(raid, now);
  const raider = raidOn && raid.joined.includes(evt.userId);
  const link = hasLink(text, extra);
  if (raider) {
    const mentions = mentionedUserIds(text).length + mentionedRoleIds(text).length;
    if (link || mentions > 0) return hold(evt, `🛡️ The raid shield is up: newcomers can't post links or mentions for a little while.`, "raid", link ? "link during a raid" : "mention during a raid");
    const wait = slowmodeWait(lastPost.get(`raid:${evt.userId}`), RAID_SLOW_MS, now);
    if (wait > 0) return hold(evt, undefined, "raid", "too fast during a raid");
    lastPost.set(`raid:${evt.userId}`, now);
  }
  const newcomerMs = settings.number("newcomerMinutes", 10, 0, 1440) * 60_000;
  if (link && (newcomerMs > 0 || raider)) {
    const joined = await joinTime(evt.userId);
    const waitFor = Math.max(newcomerMs, raider ? RAID_NEWCOMER_MS : 0);
    if (joined > 0 && now - joined < waitFor) {
      return hold(
        evt,
        `👋 ${userMention(await nickname(evt.userId), evt.userId)}, welcome! New members can post links after ${formatDuration(waitFor - (now - joined))}. (It keeps spam bots out.)`,
        "newcomer",
        "link from a brand-new member",
      );
    }
  }

  // Slowmode.
  const slow = slows.get(evt.channelId);
  if (slow) {
    const key = `${evt.channelId}:${evt.userId}`;
    const wait = slowmodeWait(lastPost.get(key), slow.ms, now);
    if (wait > 0) return hold(evt, `🐢 Slowmode is on here: you can post again in ${formatDuration(wait)}.`, "slowmode", "posted too fast in slowmode");
    lastPost.set(key, now);
  }
  return false;
}

// ---- Commands -----------------------------------------------------------------------------

/** The channel a command is about: one it mentions, "all", or the one it was typed in. */
function channelTarget(ctx: CommandContext, allowAll: boolean): { channelId: string; rest: string } {
  const mentioned = mentionedChannelIds(ctx.rest)[0];
  if (mentioned) return { channelId: mentioned, rest: ctx.rest.replace(/\[#[^\]]*\]\(root:\/\/channel\/[^)\s]+\)/, "").trim() };
  if (allowAll && /^(all|everything|everywhere|server|community)\b/i.test(ctx.rest)) return { channelId: "all", rest: ctx.rest.replace(/^\S+\s*/, "") };
  if (ctx.channelId) return { channelId: ctx.channelId, rest: ctx.rest };
  throw new UsageError(`Say which channel, like \`${config.prefix}${allowAll ? "lockdown #general 30m" : "slowmode #general 30s"}\`${allowAll ? ", or `all`" : ""}.`);
}

const where = async (channelId: string) => (channelId === "all" ? "every channel" : channelLink(channelId));

export const guardianCommands: Command[] = [
  {
    name: "lockdown",
    aliases: ["lock"],
    usage: "[#channel | all] [30m] [reason]",
    summary: "Lock a channel (or every channel) so only the team can talk, for a while or until you unlock it.",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const target = channelTarget(ctx, true);
      const timed = parseLeadingDuration(target.rest);
      const ms = clampHold(timed?.ms);
      const reason = (timed ? timed.rest : target.rest) || undefined;
      const now = Date.now();
      const lock: Lock = { channelId: target.channelId, until: ms ? now + ms : undefined, reason, by: ctx.userId, at: now };
      locks.set(target.channelId, lock);
      await saveLocks();
      const length = ms ? ` for ${formatDuration(ms)}` : "";
      if (target.channelId !== "all") {
        await send(target.channelId, `🔒 **This channel is locked**${length}${reason ? `: ${truncate(reason, 200)}` : ""}. Only the team can post until it opens again.`).catch(() => undefined);
      }
      noteCatch("lockdown", ctx.userId, target.channelId === "all" ? "" : target.channelId, `locked${length}`);
      await ctx.reply(`🔒 Locked ${await where(target.channelId)}${length}. \`${config.prefix}unlock\` opens it again.`);
      await modLog(`🔒 **${await nickname(ctx.userId)}** locked ${await where(target.channelId)}${length}${reason ? `: ${truncate(reason, 200)}` : ""}`);
    },
  },
  {
    name: "unlock",
    usage: "[#channel | all]",
    summary: "Open a locked channel again (`all` opens everything).",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const target = channelTarget(ctx, true);
      const ids = target.channelId === "all" ? [...locks.keys()] : [target.channelId];
      const opened = ids.filter((id) => locks.delete(id));
      if (opened.length === 0) {
        await ctx.reply(`${await where(target.channelId)} isn't locked.`);
        return;
      }
      await saveLocks();
      for (const id of opened) if (id !== "all") await send(id, "🔓 This channel is open again.").catch(() => undefined);
      await ctx.reply(`🔓 Opened ${target.channelId === "all" ? plural(opened.length, "lock") : await where(target.channelId)}.`);
      await modLog(`🔓 **${await nickname(ctx.userId)}** opened ${target.channelId === "all" ? "every locked channel" : await where(target.channelId)}.`);
    },
  },
  {
    name: "slowmode",
    aliases: ["slow"],
    usage: "[#channel] <30s | 5m | off>",
    summary: "Make people wait between messages in a channel (the team isn't held back).",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const target = channelTarget(ctx, false);
      if (/^(off|stop|none|0)\b/i.test(target.rest)) {
        if (!slows.delete(target.channelId)) {
          await ctx.reply(`Slowmode isn't on in ${await where(target.channelId)}.`);
          return;
        }
        await saveSlows();
        await send(target.channelId, "🐇 Slowmode is off.").catch(() => undefined);
        await ctx.reply(`🐇 Slowmode is off in ${await where(target.channelId)}.`);
        return;
      }
      const timed = parseLeadingDuration(target.rest);
      if (!timed || timed.ms < 2000 || timed.ms > 6 * 3_600_000) throw new UsageError(`Give a wait between 2 seconds and 6 hours, like \`${config.prefix}slowmode 30s\`, or \`off\`.`);
      slows.set(target.channelId, { channelId: target.channelId, ms: timed.ms, by: ctx.userId, at: Date.now() });
      await saveSlows();
      await send(target.channelId, `🐢 Slowmode is on: one message every ${formatDuration(timed.ms)}.`).catch(() => undefined);
      await ctx.reply(`🐢 Slowmode in ${await where(target.channelId)}: one message every ${formatDuration(timed.ms)}.`);
      await modLog(`🐢 **${await nickname(ctx.userId)}** turned on slowmode in ${await where(target.channelId)} (${formatDuration(timed.ms)}).`);
    },
  },
  {
    name: "raid",
    usage: "[on | off]",
    summary: "The raid shield: see if it's up, raise it yourself, or end it.",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const arg = ctx.args[0]?.toLowerCase();
      const now = Date.now();
      if (arg === "on") {
        raid = { ...raid, manual: true, until: Math.max(raid.until, now + 15 * 60_000), startedAt: raidActive(raid, now) ? raid.startedAt : now };
        await kv.set(RAID_KEY, raid);
        noteCatch("raid", ctx.userId, "", "raised by hand");
        await ctx.reply(`🚨 Raid shield up. Anyone who joins now can't post links or mentions, and posts slowly. \`${config.prefix}raid off\` ends it.`);
        await modLog(`🚨 **${await nickname(ctx.userId)}** raised the raid shield.`);
        return;
      }
      if (arg === "off") {
        const was = raidActive(raid, now);
        raid = { until: 0, joined: [] };
        await kv.set(RAID_KEY, raid);
        await ctx.reply(was ? "🛡️ Raid shield down." : "The raid shield wasn't up.");
        if (was) await modLog(`🛡️ **${await nickname(ctx.userId)}** ended the raid shield.`);
        return;
      }
      const status = raidStatus();
      await ctx.reply(
        status.active
          ? `🚨 The raid shield is up${status.manual ? " (raised by hand)" : ` for another ${formatDuration(status.until - now)}`}, holding back ${plural(status.joined, "newcomer")}.`
          : `🛡️ All calm: the raid shield is ${settings.on("raidShield") ? `watching (it rises when ${settings.number("raidJoins", 8, 3, 100)} people join within a minute)` : "turned off in Blitz's settings"}.`,
      );
    },
  },
  {
    name: "guardian",
    aliases: ["shield", "shields"],
    summary: `What ${config.botName}'s shields are doing: scams, raids, newcomers, locks and slowmodes.`,
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const now = Date.now();
      const { locks: l, slows: s } = locksAndSlows();
      const day = catches.filter((c) => now - c.at < 86_400_000);
      const count = (kind: string) => day.filter((c) => c.kind === kind).length;
      const lines = [
        "🛡️ **Guardian**",
        `🎣 Scam shield: ${settings.on("scamShield") ? "on" : "off"} · ${plural(count("scam"), "scam link")} stopped today`,
        `🚨 Raid shield: ${settings.on("raidShield") ? (raidStatus().active ? "**UP**" : "watching") : "off"}`,
        `👋 Newcomer links: ${settings.number("newcomerMinutes", 10, 0, 1440) ? `after ${settings.number("newcomerMinutes", 10, 0, 1440)} minutes` : "allowed right away"} · ${count("newcomer")} held today`,
        `🔒 Locked: ${l.length ? (await Promise.all(l.map((x) => where(x.channelId)))).join(", ") : "nothing"}`,
        `🐢 Slowmode: ${s.length ? (await Promise.all(s.map(async (x) => `${await where(x.channelId)} (${formatDuration(x.ms)})`))).join(", ") : "nowhere"}`,
        `🧹 Auto-mod removed ${plural(day.filter((c) => !["scam", "newcomer", "raid", "lockdown", "slowmode"].includes(c.kind)).length, "message")} today`,
      ];
      await ctx.reply(lines.join("\n"));
    },
  },
];
