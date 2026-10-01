// Reaction polls with optional timers. When a timed poll closes, the message
// turns into a results card and Blitz announces the winner.

import { config } from "../config";
import { Command, UsageError } from "../core/commands";
import { cancelJobs, onJob, scheduleOnce } from "../core/jobs";
import { serialize } from "../core/lock";
import { errMessage, log } from "../core/log";
import { isPerson, nickname } from "../core/members";
import { edit, getMessage, react, send } from "../core/messaging";
import { kv } from "../core/store";
import { parsePoll } from "../logic/parse";
import { PollRecord, pollEmojis, renderPoll, resultLine, tally } from "../logic/polls";
import { userMention } from "../logic/text";

const JOB_TAG = "poll-close";
const pollKey = (id: number) => `poll:${id}`;
const jobResource = (id: number) => `poll-${id}`;

export function initPolls(): void {
  onJob(JOB_TAG, async (resourceId) => {
    const id = Number(resourceId.replace(/^poll-/, ""));
    if (Number.isInteger(id)) await closePoll(id);
  });
}

async function authorMention(poll: PollRecord): Promise<string> {
  return userMention(await nickname(poll.authorId), poll.authorId);
}

export async function closePoll(id: number): Promise<"closed" | "already" | "missing"> {
  return serialize(pollKey(id), async () => {
    const poll = await kv.get<PollRecord>(pollKey(id));
    if (!poll) return "missing";
    if (poll.closed) return "already";

    const msg = await getMessage(poll.channelId, poll.messageId);
    poll.closed = true;
    await kv.set(pollKey(id), poll);
    await cancelJobs(jobResource(id)).catch(() => undefined);
    if (!msg) return "closed"; // The poll message was deleted; nothing to show.

    const counts = tally(msg.reactions, pollEmojis(poll.options), (userId) => !isPerson(userId));
    try {
      await edit(poll.channelId, poll.messageId, renderPoll(poll, await authorMention(poll), Date.now(), counts));
      await send(poll.channelId, resultLine(poll, counts), poll.messageId);
    } catch (err) {
      log("warn", "couldn't publish poll results", { error: errMessage(err) });
    }
    return "closed";
  });
}

export const pollCommands: Command[] = [
  {
    name: "poll",
    usage: "[1h] Question? | Option | Option …",
    summary: "Start a reaction poll. Leave out the options for yes/no; add a time like 30m or 2d to auto-close.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      const input = parsePoll(ctx.rest);
      if (typeof input === "string") throw new UsageError(input);

      const id = await kv.next("pollstate:count");
      const now = Date.now();
      const draft: PollRecord = {
        id,
        channelId: ctx.channelId,
        messageId: "",
        authorId: ctx.userId,
        question: input.question,
        options: input.options,
        createdAt: now,
        closesAt: input.durationMs !== undefined ? now + input.durationMs : undefined,
        closed: false,
      };
      const msg = await send(ctx.channelId, renderPoll(draft, userMention(await nickname(ctx.userId), ctx.userId), now));
      const poll = { ...draft, messageId: msg.id };
      await kv.set(pollKey(id), poll);
      for (const e of pollEmojis(poll.options)) await react(ctx.channelId, msg.id, e);
      if (poll.closesAt !== undefined) await scheduleOnce(JOB_TAG, jobResource(id), new Date(poll.closesAt));
    },
  },
  {
    name: "endpoll",
    usage: "<poll number>",
    summary: "Close a poll now and show the results (its author or the team).",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      const id = Number(ctx.args[0]?.replace(/^#/, ""));
      if (!Number.isInteger(id)) throw new UsageError(`Usage: \`${config.prefix}endpoll 3\` (the number is in the poll's title).`);
      const poll = await kv.get<PollRecord>(pollKey(id));
      if (!poll) throw new UsageError(`There's no poll #${id}.`);
      if (poll.authorId !== ctx.userId && ctx.level === "everyone") {
        await ctx.reply("🔒 Only the poll's author or the team can close it.");
        return;
      }
      const result = await closePoll(id);
      if (result === "already") await ctx.reply(`Poll #${id} is already closed.`);
    },
  },
];
