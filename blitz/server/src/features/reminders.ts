// Reminders: "!remind 2h take the pizza out" and Blitz pings you back in the
// same channel (plus a notification) when it's time. They're saved, so a
// restart doesn't lose them.

import { config } from "../config";
import { Command, UsageError } from "../core/commands";
import { cancelJobs, onJob, scheduleOnce } from "../core/jobs";
import { serialize } from "../core/lock";
import { errMessage, log } from "../core/log";
import { nickname } from "../core/members";
import { notify, send } from "../core/messaging";
import { kv } from "../core/store";
import { parseLeadingDuration } from "../logic/moderation";
import { formatDuration } from "../logic/parse";
import { truncate, userMention } from "../logic/text";

interface Reminder {
  id: number;
  userId: string;
  channelId: string;
  messageId: string;
  text: string;
  at: number;
}

const JOB_TAG = "reminder";
const key = (id: number) => `reminder:${id}`;
const resource = (id: number) => `reminder-${id}`;
const MAX_MS = 365 * 86_400_000;
const MAX_PER_PERSON = 25;

export function initReminders(): void {
  onJob(JOB_TAG, async (resourceId) => {
    const id = Number(resourceId.replace(/^reminder-/, ""));
    if (Number.isInteger(id)) await deliver(id);
  });
}

async function deliver(id: number): Promise<void> {
  await serialize(key(id), async () => {
    const r = await kv.get<Reminder>(key(id));
    if (!r) return; // Already delivered or cancelled.
    await kv.delete(key(id));
    const late = Date.now() - r.at > 5 * 60_000 ? " _(a little late, sorry!)_" : "";
    const text = `⏰ ${userMention(await nickname(r.userId), r.userId)}, you asked me to remind you: ${r.text}${late}`;
    try {
      await send(r.channelId, text, r.messageId).catch(() => send(r.channelId, text));
    } catch (err) {
      log("warn", "couldn't deliver a reminder", { error: errMessage(err) });
    }
    await notify([r.userId], "⏰ Reminder", r.text);
  });
}

async function mine(userId: string): Promise<Reminder[]> {
  return (await kv.entries<Reminder>("reminder:"))
    .map((e) => e.value)
    .filter((r) => r.userId === userId)
    .sort((a, b) => a.at - b.at);
}

export const reminderCommands: Command[] = [
  {
    name: "remind",
    aliases: ["remindme", "reminder"],
    usage: "<when> <what>",
    summary: "A reminder, like `2h stretch`, `in 30 minutes check the oven` or `1d12h renew the server`.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      const timed = parseLeadingDuration(ctx.rest);
      if (!timed) throw new UsageError(`Usage: \`${config.prefix}remind 2h take a break\` (m, h, d or w; or "in 30 minutes").`);
      if (timed.ms < 60_000 || timed.ms > MAX_MS) throw new UsageError("Reminders can be from 1 minute to a year away.");
      if ((await mine(ctx.userId)).length >= MAX_PER_PERSON) throw new UsageError(`You have ${MAX_PER_PERSON} reminders already. \`${config.prefix}reminders\` lists them.`);
      const id = await kv.next("reminderstate:count");
      const reminder: Reminder = {
        id,
        userId: ctx.userId,
        channelId: ctx.channelId,
        messageId: ctx.messageId,
        text: truncate(timed.rest || "this! (you didn't say what)", 500),
        at: Date.now() + timed.ms,
      };
      await kv.set(key(id), reminder);
      await scheduleOnce(JOB_TAG, resource(id), new Date(reminder.at));
      await ctx.reply(`⏰ Got it! I'll remind you in ${formatDuration(timed.ms)}. _(reminder ${id})_`);
    },
  },
  {
    name: "reminders",
    summary: "Your upcoming reminders.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      const list = await mine(ctx.userId);
      if (list.length === 0) {
        await ctx.reply(`No reminders. Set one with \`${config.prefix}remind 1h stretch\`.`);
        return;
      }
      const now = Date.now();
      const lines = list.map((r) => `**${r.id}** · in ${formatDuration(r.at - now)} · ${truncate(r.text, 80)}`);
      await ctx.reply([`⏰ **Your reminders**`, ...lines, "", `_\`${config.prefix}forget <number>\` cancels one._`].join("\n"));
    },
  },
  {
    name: "forget",
    aliases: ["unremind"],
    usage: "<reminder number>",
    summary: "Cancel one of your reminders.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      const id = Number(ctx.args[0]?.replace(/^#/, ""));
      if (!Number.isInteger(id)) throw new UsageError(`Usage: \`${config.prefix}forget 3\` (\`${config.prefix}reminders\` shows the numbers).`);
      const r = await kv.get<Reminder>(key(id));
      if (!r || r.userId !== ctx.userId) throw new UsageError(`You don't have a reminder ${id}.`);
      await kv.delete(key(id));
      await cancelJobs(resource(id)).catch(() => undefined);
      await ctx.reply(`🗑️ Forgot reminder ${id}.`);
    },
  },
];
