// Blitz's brain answering questions (with an API key, and only when the
// community ticks "Let Blitz's brain help moderate"):
//  - !tldr: catches anyone up on a channel: what's being talked about, what
//    was decided, what's still open.
//  - Ask Blitz (!ask, or from the team's menu): the team asks in plain words
//    ("who's been warned most this month?", "how's the community doing?",
//    "what happened in #general this morning?") and Claude answers by
//    looking things up with read-only tools over Blitz's records. It can't
//    change anything.
// Private channels are never read.

import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { config } from "../config";
import { Command, UsageError } from "../core/commands";
import { allMembers, communityName, textChannels } from "../core/community";
import { errMessage, log } from "../core/log";
import { accessLevel, knownPeople, nickname } from "../core/members";
import { channelLink, settings } from "../core/settings";
import { CASE_LABEL } from "../logic/moderation";
import { summarize } from "../logic/pulse";
import { plural, rankByName, truncate } from "../logic/text";
import { locksAndSlows, raidStatus, recentCatches } from "../features/guardian";
import { openTickets, KIND_LABEL } from "../features/inbox";
import { levelsFor, xpOf } from "../features/levels";
import { actorName, casesOf, ladderText, mutedUntil, recentCases } from "../features/moderation";
import { pulseDays } from "../features/pulse";
import { claudeFor, textOf } from "./brain";
import { brainModeration, recentMessages, transcriptOf } from "./sentinel";

const TLDR_COOLDOWN_MS = 3 * 60_000;
const lastTldr = new Map<string, number>();

function needsBrain(): void {
  if (!brainModeration()) throw new UsageError(`This needs ${config.botName}'s brain: an admin can tick "Let Blitz's brain help moderate" in its settings (with an Anthropic API key).`);
}

/** A catch-up on a channel's latest messages. */
export async function catchUp(channelId: string, count: number): Promise<string> {
  needsBrain();
  if (settings.isPrivate(channelId) || settings.isLog(channelId)) throw new UsageError(`${config.botName} doesn't read this channel (it's private).`);
  const lines = await recentMessages(channelId, count);
  if (lines.length < 5) return "🌙 It's been quiet here: nothing much to catch up on.";
  const claude = claudeFor("a catch-up");
  if (!claude) throw new UsageError(`${config.botName}'s brain is busy (or has no key). Try again in a bit.`);
  const response = await claude.messages.create({
    model: config.brain.model,
    max_tokens: 3000,
    output_config: { effort: "low" },
    system:
      "You catch members of an online community up on a chat channel. Write a short, friendly summary in Markdown: up to 5 bullets of what's being talked about (with who, by name), then decisions or plans if any, then open questions if any. No preamble. Don't quote anything hurtful; don't invent anything the messages don't say.",
    messages: [{ role: "user", content: `The last ${lines.length} messages, oldest first:\n${transcriptOf(lines)}` }],
  });
  return textOf(response) ?? "🤔 I couldn't make sense of that one. Try again in a bit.";
}

// ---- Ask Blitz: read-only tools over Blitz's records ----

const askTools = () => [
  betaTool({
    name: "community_snapshot",
    description: "The community right now: name, members, this week's activity and health, open inbox conversations, shields (raid, locks, slowmode), what the shields caught today, and the warning ladder.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      const s = summarize(await pulseDays(14));
      const open = await openTickets();
      const now = Date.now();
      const day = recentCatches().filter((c) => now - c.at < 86_400_000);
      const kinds: Record<string, number> = {};
      for (const c of day) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
      const { locks, slows } = locksAndSlows();
      return JSON.stringify({
        name: await communityName(),
        members: knownPeople().length,
        week: s.week,
        changeVsLastWeek: s.change,
        health: s.health,
        openConversations: open.map((t) => ({ id: t.id, kind: t.kind, subject: t.subject, waitingOnTeam: t.unread === "team" })),
        raid: raidStatus(),
        locks: await Promise.all(locks.map(async (l) => ({ channel: l.channelId === "all" ? "everything" : await channelLink(l.channelId), until: l.until ? new Date(l.until).toISOString() : "until unlocked" }))),
        slowmodes: await Promise.all(slows.map(async (x) => ({ channel: await channelLink(x.channelId), seconds: x.ms / 1000 }))),
        caughtToday: kinds,
        warningLadder: ladderText(),
      });
    },
  }),
  betaTool({
    name: "find_members",
    description: "Find members by (part of) their name. Returns user IDs to use with member_record.",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false },
    run: async ({ name }) => JSON.stringify(rankByName(name, await allMembers(), 8)),
  }),
  betaTool({
    name: "member_record",
    description: "One member's standing: level, messages, whether they're muted, and their moderation history (warnings, mutes, kicks, bans, notes; taken-back ones marked).",
    inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"], additionalProperties: false },
    run: async ({ user_id }) => {
      const xp = await xpOf(user_id);
      const cases = await casesOf(user_id);
      return JSON.stringify({
        name: await nickname(user_id),
        level: xp.level,
        messages: xp.messages,
        team: (await accessLevel(user_id)) !== "everyone",
        mutedUntil: mutedUntil(user_id) ? new Date(mutedUntil(user_id)!).toISOString() : null,
        cases: await Promise.all(
          cases.slice(-30).map(async (c) => ({ id: c.id, kind: CASE_LABEL[c.kind], reason: c.reason ?? "", by: await actorName(c.modId), when: new Date(c.at).toISOString(), takenBack: c.revoked === true })),
        ),
      });
    },
  }),
  betaTool({
    name: "recent_cases",
    description: "The community's latest moderation cases, newest first, optionally only one kind.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 100 }, kind: { type: "string", enum: ["warn", "mute", "unmute", "kick", "ban", "unban", "note"] } },
      additionalProperties: false,
    },
    run: async ({ limit, kind }) => {
      const cases = (await recentCases(Math.min(200, (limit ?? 30) * (kind ? 4 : 1)))).filter((c) => !kind || c.kind === kind).slice(0, limit ?? 30);
      return JSON.stringify(
        await Promise.all(cases.map(async (c) => ({ id: c.id, kind: c.kind, member: await nickname(c.userId), memberId: c.userId, reason: c.reason ?? "", by: await actorName(c.modId), when: new Date(c.at).toISOString(), takenBack: c.revoked === true }))),
      );
    },
  }),
  betaTool({
    name: "activity",
    description: "Day-by-day activity for the last N days (messages, active people, joins, leaves, team actions, shield catches), the busiest channels and hours (UTC), and a 0-100 health score.",
    inputSchema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 60 } }, additionalProperties: false },
    run: async ({ days }) => {
      const s = summarize(await pulseDays(days ?? 14));
      const names = new Map((await textChannels().catch(() => [])).map((c) => [c.id, c.name]));
      return JSON.stringify({ ...s, topChannels: s.topChannels.map((c) => ({ channel: names.get(c.channelId) ?? "a channel", messages: c.messages })) });
    },
  }),
  betaTool({
    name: "read_channel",
    description: "The latest messages in a channel, by channel name (private and log channels can't be read).",
    inputSchema: { type: "object", properties: { channel: { type: "string" }, count: { type: "integer", minimum: 5, maximum: 80 } }, required: ["channel"], additionalProperties: false },
    run: async ({ channel, count }) => {
      const list = await textChannels();
      const match = rankByName(channel.replace(/^#/, ""), list.map((c) => ({ userId: c.id, name: c.name })), 1)[0];
      if (!match) return `No channel called "${channel}". Channels: ${list.map((c) => c.name).join(", ")}`;
      if (settings.isPrivate(match.userId) || settings.isLog(match.userId)) return "That channel is private; Blitz doesn't read it.";
      const lines = await recentMessages(match.userId, count ?? 40);
      return lines.length ? `#${match.name}, oldest first:\n${transcriptOf(lines)}` : `#${match.name} has no recent messages.`;
    },
  }),
  betaTool({
    name: "leaderboard",
    description: "The top members by level and XP.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => JSON.stringify((await levelsFor("", 10))?.top ?? []),
  }),
  betaTool({
    name: "inbox",
    description: "Open inbox conversations between members and the team (questions, reports, appeals), with the latest messages.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () =>
      JSON.stringify(
        await Promise.all(
          (await openTickets()).slice(0, 15).map(async (t) => ({
            id: t.id,
            kind: KIND_LABEL[t.kind],
            from: await nickname(t.userId),
            subject: t.subject,
            claimedBy: t.claimedBy ? await nickname(t.claimedBy) : null,
            waitingOnTeam: t.unread === "team",
            triage: t.triage ?? null,
            latest: t.messages.slice(-3).map((m) => `${m.from}: ${truncate(m.text, 200)}`),
          })),
        ),
      ),
  }),
];

const ASK_SYSTEM = (name: string) =>
  `You are ${config.botName}, the community assistant of "${name}", answering a question from someone on its moderation team. Use the tools to look things up; never guess numbers or history. Answer in friendly, compact Markdown (a few lines or bullets; names in bold). If the tools can't answer it, say so. You can't take actions: suggest commands the team could use instead (they start with ${config.prefix}, like ${config.prefix}warn, ${config.prefix}mute, ${config.prefix}lockdown). Times in the data are UTC.`;

/** Ask Blitz: answers a team member's question with read-only tools. */
export async function askBlitz(question: string): Promise<string> {
  needsBrain();
  const claude = claudeFor("Ask Blitz");
  if (!claude) throw new UsageError(`${config.botName}'s brain is busy (or has no key). Try again in a bit.`);
  const q = truncate(question.trim(), 1200);
  if (q.length < 3) throw new UsageError("Ask something, like “how's the community doing this week?”");
  try {
    const final = await claude.beta.messages.toolRunner({
      model: config.brain.model,
      max_tokens: 6000,
      max_iterations: 6,
      output_config: { effort: "medium" },
      system: ASK_SYSTEM(await communityName()),
      tools: askTools(),
      messages: [{ role: "user", content: q }],
    });
    return textOf(final) ?? "🤔 I couldn't work that one out. Try asking another way?";
  } catch (err) {
    log("warn", "Ask Blitz failed", { error: errMessage(err) });
    throw new UsageError(`⚠️ ${config.botName}'s brain couldn't answer just now. Try again in a moment.`);
  }
}

export const oracleCommands: Command[] = [
  {
    name: "tldr",
    aliases: ["catchup", "summary"],
    usage: "[how many messages, 20-100]",
    summary: `${config.botName} sums up what you missed in this channel.`,
    level: "everyone",
    category: "Community",
    menu: "no",
    async run(ctx) {
      const count = Math.min(100, Math.max(20, Number(ctx.args[0]) || 60));
      const now = Date.now();
      if (now - (lastTldr.get(ctx.channelId) ?? 0) < TLDR_COOLDOWN_MS) {
        await ctx.notice("🕐 I just caught this channel up. Scroll up a little!");
        return;
      }
      lastTldr.set(ctx.channelId, now);
      const summary = await catchUp(ctx.channelId, count);
      await ctx.reply(`📜 **Catching up** on the last ${plural(count, "message")}:\n${summary}`);
    },
  },
  {
    name: "ask",
    aliases: ["oracle"],
    usage: "<question>",
    summary: `Ask ${config.botName} about the community: activity, members' histories, the inbox, what happened in a channel.`,
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      await ctx.reply(`🔮 ${await askBlitz(ctx.rest)}`);
    },
  },
];
