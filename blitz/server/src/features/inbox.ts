// The inbox: private conversations between a member and the team, kept by
// Blitz. Members open one from Blitz's menu or with !ticket (a question),
// !report (a problem, about someone) or !appeal (a case they think was
// wrong). The team answers from the menu or with !reply, and closes it with
// a note; an appeal is accepted (the case is taken back) or turned down.
// Both sides get a notification when the other writes, and the staff log
// keeps a transcript once it's closed. Nothing is posted in public channels.

import { config } from "../config";
import { Command, CommandContext, UsageError } from "../core/commands";
import { serialize } from "../core/lock";
import { errMessage, log } from "../core/log";
import { nickname } from "../core/members";
import { modLog, notify, remove } from "../core/messaging";
import { settings, staffPing } from "../core/settings";
import { kv } from "../core/store";
import { CASE_LABEL } from "../logic/moderation";
import { formatDuration } from "../logic/parse";
import { defuseMentions, plural, quote, truncate, userMention } from "../logic/text";
import { actorName, getCase, takeBack } from "./moderation";

export type TicketKind = "question" | "report" | "appeal";

export interface TicketMessage {
  from: "member" | "team" | "blitz";
  userId: string;
  text: string;
  at: number;
}

export interface Ticket {
  id: number;
  userId: string;
  kind: TicketKind;
  subject: string;
  caseId?: number;
  aboutUserId?: string;
  status: "open" | "closed";
  claimedBy?: string;
  messages: TicketMessage[];
  createdAt: number;
  updatedAt: number;
  closedBy?: string;
  /** How it ended: "accepted" / "turned down" for appeals, or the team's note. */
  resolution?: string;
  /** What Blitz's brain made of a report, for the team. */
  triage?: { summary: string; severity: "low" | "medium" | "high"; suggestion: string };
  /** Who hasn't seen the latest message yet. */
  unread?: "member" | "team";
}

const ticketKey = (id: number) => `ticket:${id}`;
const userKey = (userId: string) => `tickets:user:${userId}`;
const OPEN_KEY = "tickets:open";
const MAX_OPEN_PER_MEMBER = 3;
const MAX_TEXT = 1800;
const MEMBER_COOLDOWN_MS = 30_000;
const lastOpened = new Map<string, number>();

export const KIND_LABEL: Record<TicketKind, string> = { question: "💬 Question", report: "🚩 Report", appeal: "⚖️ Appeal" };

export async function getTicket(id: number): Promise<Ticket | undefined> {
  return kv.get<Ticket>(ticketKey(id));
}

async function save(t: Ticket): Promise<void> {
  await kv.set(ticketKey(t.id), t);
  await kv.update<number[]>(OPEN_KEY, (ids) => (t.status === "open" ? (ids.includes(t.id) ? ids : [...ids, t.id]) : ids.filter((i) => i !== t.id)), []);
}

export async function openTickets(): Promise<Ticket[]> {
  const ids = (await kv.get<number[]>(OPEN_KEY)) ?? [];
  const all = await Promise.all(ids.map(getTicket));
  return all.filter((t): t is Ticket => t !== undefined && t.status === "open").sort((a, b) => b.updatedAt - a.updatedAt);
}

/** A member's own conversations, newest first. */
export async function ticketsOf(userId: string, limit = 10): Promise<Ticket[]> {
  const ids = ((await kv.get<number[]>(userKey(userId))) ?? []).slice(-limit).reverse();
  const all = await Promise.all(ids.map(getTicket));
  return all.filter((t): t is Ticket => t !== undefined);
}

/** Recently closed ones too, for the team's view. */
export async function recentTickets(limit: number): Promise<Ticket[]> {
  const count = (await kv.get<number>("ticketstate:count")) ?? 0;
  const ids = Array.from({ length: Math.min(limit, count) }, (_, i) => count - i);
  const all = await Promise.all(ids.map(getTicket));
  return all.filter((t): t is Ticket => t !== undefined);
}

const clean = (text: string) => truncate(defuseMentions(text).trim(), MAX_TEXT);

/** Opens a conversation (checks limits first). Throws UsageError with a friendly reason when it can't. */
export async function openTicket(
  userId: string,
  kind: TicketKind,
  text: string,
  extra: { caseId?: number; aboutUserId?: string; subject?: string; quiet?: boolean } = {},
): Promise<Ticket> {
  if (!settings.on("inbox")) throw new UsageError(`This community has turned off ${config.botName}'s inbox. Message someone on the team directly.`);
  const body = clean(text);
  if (body.length < 3) throw new UsageError("Write a little about what's up, so the team knows how to help.");
  const now = Date.now();
  if (now - (lastOpened.get(userId) ?? 0) < MEMBER_COOLDOWN_MS) throw new UsageError("🕐 You just sent one. Give it a moment, or add to it from the Inbox in Blitz's menu.");
  const mine = (await ticketsOf(userId, 20)).filter((t) => t.status === "open");
  if (mine.length >= MAX_OPEN_PER_MEMBER) throw new UsageError(`You have ${mine.length} conversations open with the team already. Add to one of those in the Inbox.`);
  if (extra.caseId !== undefined && mine.some((t) => t.caseId === extra.caseId)) throw new UsageError(`You've already appealed case #${extra.caseId}; the team will get back to you.`);

  return serialize("tickets:new", async () => {
    const id = await kv.next("ticketstate:count");
    const t: Ticket = {
      id,
      userId,
      kind,
      subject: truncate(extra.subject ?? body.split("\n")[0], 90),
      caseId: extra.caseId,
      aboutUserId: extra.aboutUserId,
      status: "open",
      messages: [{ from: "member", userId, text: body, at: now }],
      createdAt: now,
      updatedAt: now,
      unread: "team",
    };
    await save(t);
    await kv.update<number[]>(userKey(userId), (ids) => [...ids.slice(-49), id], []);
    lastOpened.set(userId, now);
    // A report posts its own, fuller note in the staff log.
    if (extra.quiet) return t;
    const name = await nickname(userId);
    const about = t.aboutUserId ? ` about ${userMention(await nickname(t.aboutUserId), t.aboutUserId)}` : "";
    const ping = await staffPing();
    await modLog(
      [`📬 **${KIND_LABEL[kind]} #${id}** from ${userMention(name, userId)}${about}${t.caseId ? ` (case #${t.caseId})` : ""}`, quote(truncate(body, 600)), `Answer from the Inbox in ${config.botName}'s menu, or \`${config.prefix}reply ${id} …\`. ${ping}`].join("\n"),
    );
    await notify([], `📬 ${KIND_LABEL[kind].slice(2)} from ${name}`, truncate(body, 120), settings.staffRoles());
    return t;
  });
}

/** Adds a message from the member or the team; reopens a closed conversation if the member writes again. */
export async function addMessage(id: number, userId: string, from: "member" | "team", text: string): Promise<Ticket> {
  const body = clean(text);
  if (body.length < 1) throw new UsageError("Write something first.");
  return serialize(`ticket:${id}`, async () => {
    const t = await getTicket(id);
    if (!t) throw new UsageError(`There's no conversation #${id}.`);
    if (from === "member" && t.userId !== userId) throw new UsageError(`Conversation #${id} isn't yours.`);
    if (t.status === "closed") {
      if (from === "team") throw new UsageError(`#${id} is closed.`);
      if (Date.now() - t.updatedAt > 7 * 86_400_000) throw new UsageError(`#${id} was closed a while ago; start a new one.`);
      t.status = "open";
      t.closedBy = undefined;
      t.resolution = undefined;
    }
    t.messages = [...t.messages.slice(-99), { from, userId, text: body, at: Date.now() }];
    t.updatedAt = Date.now();
    t.unread = from === "member" ? "team" : "member";
    if (from === "team" && !t.claimedBy) t.claimedBy = userId;
    await save(t);
    if (from === "team") {
      await notify([t.userId], `💬 The team replied (#${id})`, truncate(body, 120));
    } else {
      const name = await nickname(userId);
      if (t.claimedBy) await notify([t.claimedBy], `💬 ${name} wrote back (#${id})`, truncate(body, 120));
      else await notify([], `💬 ${name} wrote back (#${id})`, truncate(body, 120), settings.staffRoles());
    }
    return t;
  });
}

/** Marks a conversation as read by one side (from the menu). */
export async function markRead(id: number, side: "member" | "team"): Promise<void> {
  await serialize(`ticket:${id}`, async () => {
    const t = await getTicket(id);
    if (t && t.unread === side) {
      t.unread = undefined;
      await kv.set(ticketKey(id), t);
    }
  });
}

export async function claimTicket(id: number, staffId: string): Promise<Ticket> {
  return serialize(`ticket:${id}`, async () => {
    const t = await getTicket(id);
    if (!t) throw new UsageError(`There's no conversation #${id}.`);
    t.claimedBy = staffId;
    await save(t);
    return t;
  });
}

function transcript(t: Ticket, names: Map<string, string>): string {
  return t.messages
    .slice(-12)
    .map((m) => `> **${m.from === "team" ? `${names.get(m.userId) ?? "team"} (team)` : m.from === "blitz" ? config.botName : names.get(m.userId) ?? "member"}:** ${truncate(m.text.replace(/\s+/g, " "), 300)}`)
    .join("\n");
}

/** Closes a conversation with a note; for an appeal, `decision` accepts (takes the case back) or turns it down. */
export async function closeTicket(id: number, staffId: string, note: string | undefined, decision?: "accept" | "reject"): Promise<{ ticket: Ticket; outcome?: string }> {
  return serialize(`ticket:${id}`, async () => {
    const t = await getTicket(id);
    if (!t) throw new UsageError(`There's no conversation #${id}.`);
    if (t.status === "closed") throw new UsageError(`#${id} is already closed.`);
    if (decision && t.kind !== "appeal") throw new UsageError(`#${id} isn't an appeal.`);
    let outcome: string | undefined;
    if (decision === "accept" && t.caseId !== undefined) {
      outcome = (await takeBack(t.caseId, staffId, `appeal #${id} accepted${note ? `: ${note}` : ""}`)) ?? "The case was already taken back.";
    }
    const resolution = decision === "accept" ? "accepted" : decision === "reject" ? "turned down" : note ? truncate(note, 200) : "closed";
    const closing = decision
      ? `${decision === "accept" ? "✅ Your appeal was accepted." : "❌ Your appeal was turned down."}${outcome ? ` ${outcome}` : ""}${note ? ` ${note}` : ""}`
      : `📪 The team closed this${note ? `: ${note}` : "."}`;
    t.messages = [...t.messages.slice(-99), { from: "team", userId: staffId, text: closing, at: Date.now() }];
    t.status = "closed";
    t.closedBy = staffId;
    t.resolution = resolution;
    t.updatedAt = Date.now();
    t.unread = "member";
    await save(t);
    await notify([t.userId], decision ? `⚖️ Your appeal: ${resolution}` : `📪 Conversation #${id} closed`, truncate(closing, 140));
    const names = new Map<string, string>();
    for (const uid of new Set(t.messages.map((m) => m.userId))) names.set(uid, await nickname(uid));
    await modLog(`📪 **${KIND_LABEL[t.kind]} #${id}** with **${names.get(t.userId) ?? "a member"}** closed by **${await actorName(staffId)}** (${resolution})\n${transcript(t, names)}`);
    return { ticket: t, outcome };
  });
}

/** One line per conversation, for chat. */
async function line(t: Ticket, now: number): Promise<string> {
  const claimed = t.claimedBy ? ` · ${await nickname(t.claimedBy)}` : "";
  const waiting = t.unread === "team" ? " · 🔵 waiting" : "";
  return `**#${t.id}** ${KIND_LABEL[t.kind]} · ${await nickname(t.userId)} · ${formatDuration(now - t.updatedAt).split(" ")[0]} ago${claimed}${waiting}: ${truncate(t.subject, 70)}`;
}

function ticketId(ctx: CommandContext, example: string): number {
  const id = Number(ctx.args[0]?.replace(/^#/, ""));
  if (!Number.isInteger(id) || id < 1) throw new UsageError(`Usage: \`${config.prefix}${example}\` (the number is in \`${config.prefix}inbox\`).`);
  return id;
}

/** In chat, members' messages to the team are taken out of the channel right away. */
async function keepPrivate(ctx: CommandContext): Promise<void> {
  if (ctx.from === "chat" && ctx.messageId) await remove(ctx.channelId, ctx.messageId).catch((err) => log("warn", "couldn't tidy a private message", { error: errMessage(err) }));
}

export const inboxCommands: Command[] = [
  {
    name: "ticket",
    aliases: ["contact", "modmail", "askteam"],
    usage: "<what's up>",
    summary: "Talk privately with the team. Your message leaves the chat at once; replies come to the Inbox in Blitz's menu.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      await keepPrivate(ctx);
      const t = await openTicket(ctx.userId, "question", ctx.rest);
      await ctx.notice(`📬 Sent privately to the team as #${t.id}. You'll get a notification when they answer (it's in the Inbox in ${config.botName}'s menu).`, 12_000);
    },
  },
  {
    name: "appeal",
    usage: "<case number> <why it should be taken back>",
    summary: "Ask the team to look again at a warning, mute or kick on your record.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      await keepPrivate(ctx);
      const id = Number(ctx.args[0]?.replace(/^#/, ""));
      if (!Number.isInteger(id)) throw new UsageError(`Usage: \`${config.prefix}appeal 12 I was quoting the rules, not breaking them\`. Your case numbers are in \`${config.prefix}warnings\`.`);
      const c = await getCase(id);
      if (!c || c.userId !== ctx.userId) throw new UsageError(`Case #${id} isn't one of yours.`);
      if (c.revoked) throw new UsageError(`Case #${id} was already taken back.`);
      if (!["warn", "mute", "kick", "ban"].includes(c.kind)) throw new UsageError(`Case #${id} isn't something to appeal.`);
      const why = ctx.args.slice(1).join(" ");
      if (why.length < 10) throw new UsageError("Say a little about why it should be taken back; it helps the team decide.");
      const t = await openTicket(ctx.userId, "appeal", why, { caseId: id, subject: `${CASE_LABEL[c.kind]} #${id}${c.reason ? `: ${truncate(c.reason, 60)}` : ""}` });
      await ctx.notice(`⚖️ Appeal sent as #${t.id}. The team will look at it and you'll get a notification with their answer.`, 12_000);
    },
  },
  {
    name: "inbox",
    aliases: ["tickets"],
    usage: "[number]",
    summary: "Open conversations with members (or one of them, in full).",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const now = Date.now();
      if (ctx.args[0]) {
        const t = await getTicket(ticketId(ctx, "inbox 12"));
        if (!t) throw new UsageError("There's no conversation with that number.");
        const names = new Map<string, string>();
        for (const uid of new Set(t.messages.map((m) => m.userId))) names.set(uid, await nickname(uid));
        const head = `${KIND_LABEL[t.kind]} **#${t.id}** · ${names.get(t.userId)} · ${t.status}${t.resolution ? ` (${t.resolution})` : ""}${t.caseId ? ` · case #${t.caseId}` : ""}`;
        const triage = t.triage ? `\n🧠 _${t.triage.severity} · ${t.triage.summary} · suggests: ${t.triage.suggestion}_` : "";
        await ctx.reply(`${head}${triage}\n${transcript(t, names)}`);
        await markRead(t.id, "team");
        return;
      }
      const open = await openTickets();
      if (open.length === 0) {
        await ctx.reply("📭 The inbox is empty. All caught up!");
        return;
      }
      const lines = await Promise.all(open.slice(0, 15).map((t) => line(t, now)));
      await ctx.reply([`📬 **${plural(open.length, "open conversation")}**`, ...lines, `\`${config.prefix}inbox 12\` reads one · \`${config.prefix}reply 12 …\` answers`].join("\n"));
    },
  },
  {
    name: "reply",
    aliases: ["answer"],
    usage: "<number> <message>",
    summary: "Answer a member's conversation; they get a notification.",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const id = ticketId(ctx, "reply 12 Thanks, we're looking into it!");
      const text = ctx.args.slice(1).join(" ");
      const t = await addMessage(id, ctx.userId, "team", text);
      await ctx.reply(`💬 Sent to **${await nickname(t.userId)}** (#${id}).`);
    },
  },
  {
    name: "close",
    usage: "<number> [note]",
    summary: "Close a conversation, with a note for the member.",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const id = ticketId(ctx, "close 12 Sorted, thanks for telling us!");
      const { ticket } = await closeTicket(id, ctx.userId, ctx.args.slice(1).join(" ") || undefined);
      await ctx.reply(`📪 Closed #${id} with **${await nickname(ticket.userId)}**.`);
    },
  },
  {
    name: "accept",
    usage: "<appeal number> [note]",
    summary: "Accept an appeal: the case is taken back and the member is told.",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const id = ticketId(ctx, "accept 12 Fair enough, sorry about that");
      const { ticket, outcome } = await closeTicket(id, ctx.userId, ctx.args.slice(1).join(" ") || undefined, "accept");
      await ctx.reply(`✅ Accepted appeal #${id} from **${await nickname(ticket.userId)}**. ${outcome ?? ""}`);
    },
  },
  {
    name: "reject",
    usage: "<appeal number> [note]",
    summary: "Turn down an appeal; the member is told, with your note.",
    level: "mod",
    category: "Moderation",
    async run(ctx) {
      const id = ticketId(ctx, "reject 12 The warning stands, but thanks for explaining");
      const { ticket } = await closeTicket(id, ctx.userId, ctx.args.slice(1).join(" ") || undefined, "reject");
      await ctx.reply(`❌ Turned down appeal #${id} from **${await nickname(ticket.userId)}**.`);
    },
  },
];

/** A report also becomes a conversation, so the team can ask the reporter more and tell them how it went. */
export async function reportAsTicket(userId: string, text: string, aboutUserId: string | undefined): Promise<Ticket | undefined> {
  if (!settings.on("inbox")) return undefined;
  try {
    return await openTicket(userId, "report", text, { aboutUserId, quiet: true });
  } catch (err) {
    if (!(err instanceof UsageError)) log("warn", "couldn't file a report in the inbox", { error: errMessage(err) });
    return undefined;
  }
}

