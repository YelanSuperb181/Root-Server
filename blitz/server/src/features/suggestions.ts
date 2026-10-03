// Suggestions: "!suggest a movie night channel" posts the idea in the
// community's suggestions channel with 👍/👎 for votes, and the team answers
// with !approve or !deny, which updates the card and lets its author know.

import { config } from "../config";
import { Command, UsageError } from "../core/commands";
import { serialize } from "../core/lock";
import { nickname } from "../core/members";
import { edit, getMessage, react, send } from "../core/messaging";
import { channelLink, settings } from "../core/settings";
import { kv } from "../core/store";
import { E, isEmoji } from "../logic/emoji";
import { defuseMentions, quote, truncate, userMention } from "../logic/text";

type Status = "open" | "approved" | "denied";

interface Suggestion {
  id: number;
  userId: string;
  text: string;
  channelId: string;
  messageId: string;
  status: Status;
  note?: string;
  by?: string;
}

const key = (id: number) => `suggestion:${id}`;
const STATUS_LINE: Record<Status, string> = {
  open: "🗳️ Vote with 👍 or 👎",
  approved: "✅ **Approved**",
  denied: "❌ **Not this time**",
};

async function render(s: Suggestion): Promise<string> {
  const lines = [`💡 **Suggestion #${s.id}** from ${userMention(await nickname(s.userId), s.userId)}`, quote(s.text), ""];
  let status = STATUS_LINE[s.status];
  if (s.by) status += ` by **${await nickname(s.by)}**`;
  if (s.note) status += `: ${s.note}`;
  lines.push(status);
  return lines.join("\n");
}

async function decide(id: number, status: Status, by: string, note: string): Promise<Suggestion> {
  return serialize(key(id), async () => {
    const s = await kv.get<Suggestion>(key(id));
    if (!s) throw new UsageError(`There's no suggestion #${id}.`);
    const updated: Suggestion = { ...s, status, by, note: note ? truncate(note, 500) : undefined };
    await kv.set(key(id), updated);
    const msg = await getMessage(s.channelId, s.messageId);
    if (msg) {
      const tally = (e: typeof E.thumbsUp) => msg.reactions.filter((r) => isEmoji(r.shortcode, e) && r.userId !== msg.userId).length;
      const votes = `\n_Final votes: 👍 ${tally(E.thumbsUp)} · 👎 ${tally(E.thumbsDown)}_`;
      await edit(s.channelId, s.messageId, (await render(updated)) + votes);
    }
    const verdict = status === "approved" ? "✅ was approved" : "❌ wasn't picked this time";
    await send(s.channelId, `${userMention(await nickname(s.userId), s.userId)}, your suggestion #${id} ${verdict}${updated.note ? `: ${updated.note}` : "."}`, msg ? s.messageId : undefined);
    return updated;
  });
}

function decision(status: Status): Command {
  const name = status === "approved" ? "approve" : "deny";
  return {
    name,
    usage: "<number> [note]",
    summary: status === "approved" ? "Approve a suggestion, with an optional note." : "Turn down a suggestion, with an optional note.",
    level: "mod",
    category: "Staff",
    async run(ctx) {
      const id = Number(ctx.args[0]?.replace(/^#/, ""));
      if (!Number.isInteger(id)) throw new UsageError(`Usage: \`${config.prefix}${name} 4 great idea, doing it this weekend\`.`);
      const note = ctx.rest.slice(ctx.args[0].length).trim();
      const s = await decide(id, status, ctx.userId, note);
      if (s.channelId !== ctx.channelId) await ctx.reply(`Done: suggestion #${id} is ${status === "approved" ? "approved ✅" : "turned down ❌"}.`);
    },
  };
}

export const suggestionCommands: Command[] = [
  {
    name: "suggest",
    aliases: ["idea"],
    usage: "<your idea>",
    summary: "Suggest something for the community; everyone can vote on it.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      const channelId = settings.channel("suggestions");
      if (!channelId) {
        await ctx.reply(`💡 This community hasn't picked a suggestions channel yet (it's in ${config.botName}'s settings).`);
        return;
      }
      const text = truncate(defuseMentions(ctx.rest), 1500);
      if (text.length < 3) throw new UsageError(`Usage: \`${config.prefix}suggest a weekly movie night\`.`);
      const id = await kv.next("suggestionstate:count");
      const draft: Suggestion = { id, userId: ctx.userId, text, channelId, messageId: "", status: "open" };
      const msg = await send(channelId, await render(draft));
      await kv.set(key(id), { ...draft, messageId: msg.id });
      await react(channelId, msg.id, E.thumbsUp);
      await react(channelId, msg.id, E.thumbsDown);
      if (channelId !== ctx.channelId) await ctx.reply(`💡 Thanks! Posted as suggestion #${id} in ${await channelLink(channelId)}.`);
    },
  },
  decision("approved"),
  decision("denied"),
];
