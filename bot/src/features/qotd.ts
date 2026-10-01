// Question of the Day: one conversation starter every day, from the built-in
// pool or the team's own queue.

import { questions } from "../content/questions";
import { config } from "../config";
import { Command, UsageError } from "../core/commands";
import { directory } from "../core/directory";
import { send } from "../core/messaging";
import { kv } from "../core/store";
import { utcDateKey } from "../logic/dates";
import { quote, truncate } from "../logic/text";

const QUEUE = "qotd:queue";

/** Posts today's question. Skips if one already went out today, unless forced. */
export async function postQuestion(force: boolean): Promise<boolean> {
  if (!config.questionOfTheDay.enabled && !force) return false;
  const today = utcDateKey(Date.now());
  if (!force && (await kv.get<string>("qotd:last")) === today) return false;
  const channelId = config.questionOfTheDay.channel ? directory.channelId(config.questionOfTheDay.channel) : undefined;
  if (!channelId) return false;

  const queue = (await kv.get<string[]>(QUEUE)) ?? [];
  let question: string;
  if (queue.length > 0) {
    question = queue.shift()!;
    await kv.set(QUEUE, queue);
  } else {
    const index = await kv.update<number>("qotd:index", (n) => n + 1, -1);
    question = questions[index % questions.length];
  }
  const number = await kv.next("qotd:number");
  const ping = config.questionOfTheDay.pingRole ? `\n${directory.rolePing(config.questionOfTheDay.pingRole)}` : "";

  await send(channelId, `🌞 **Question of the Day #${number}**\n\n${quote(question)}\n\nAnswer below and see what everyone else says! 💬${ping}`);
  await kv.set("qotd:last", today);
  return true;
}

export const qotdCommands: Command[] = [
  {
    name: "qotd",
    usage: "[now | add <question> | queue]",
    summary: "The Question of the Day. The team can post one now or queue their own.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      const sub = (ctx.args[0] ?? "").toLowerCase();
      const staff = ctx.level !== "everyone";
      if (sub === "" || !staff) {
        const where = config.questionOfTheDay.channel ? directory.channelMention(config.questionOfTheDay.channel) : "its channel";
        await ctx.reply(`🌞 A new question lands in ${where} every day at ${String(config.daily.hourUtc).padStart(2, "0")}:00 UTC.`);
        return;
      }
      if (sub === "now") {
        const posted = await postQuestion(true);
        await ctx.reply(posted ? "✅ Posted a question." : "⚠️ The question channel doesn't exist yet. Run `!setup` first.");
      } else if (sub === "add") {
        const question = ctx.rest.replace(/^add\s*/i, "").trim();
        if (question.length < 5) throw new UsageError(`Usage: \`${config.prefix}qotd add What's your favorite snack?\``);
        const queue = await kv.update<string[]>(QUEUE, (q) => [...q, truncate(question, 500)], []);
        await ctx.reply(`✅ Queued! It's #${queue.length} in line and goes out before the built-in questions.`);
      } else if (sub === "queue") {
        const queue = (await kv.get<string[]>(QUEUE)) ?? [];
        await ctx.reply(
          queue.length === 0
            ? "📭 The queue is empty, so the built-in questions are up next."
            : ["📬 **Queued questions**", ...queue.slice(0, 15).map((q, i) => `${i + 1}. ${q}`)].join("\n"),
        );
      } else {
        throw new UsageError(`Try \`${config.prefix}qotd now\`, \`${config.prefix}qotd add <question>\` or \`${config.prefix}qotd queue\`.`);
      }
    },
  },
];
