// Suggestions: anything a member types in #suggestions (or sends with
// !suggest) becomes a numbered card with 👍/👎 votes. The team marks cards
// approved, in progress, done or declined, and the author gets notified.

import type { ChannelMessageCreatedEvent } from "@rootsdk/server-bot";
import { config } from "../config";
import { Command, UsageError } from "../core/commands";
import { directory } from "../core/directory";
import { serialize } from "../core/lock";
import { errMessage, log } from "../core/log";
import { accessLevel, nickname } from "../core/members";
import { edit, notify, react, remove, send, sendEphemeral } from "../core/messaging";
import { kv } from "../core/store";
import { E } from "../logic/emoji";
import { defuseMentions, quote, truncate } from "../logic/text";

type Status = "open" | "approved" | "progress" | "done" | "declined";

const STATUS: Record<Status, { icon: string; name: string }> = {
  open: { icon: "🟡", name: "Open for votes" },
  approved: { icon: "✅", name: "Approved" },
  progress: { icon: "🛠️", name: "In progress" },
  done: { icon: "🚀", name: "Done" },
  declined: { icon: "❌", name: "Declined" },
};

const label = (status: Status) => `${STATUS[status].icon} ${STATUS[status].name}`;

interface Suggestion {
  id: number;
  channelId: string;
  messageId: string;
  authorId: string;
  authorName: string;
  text: string;
  status: Status;
  note?: string;
  reviewer?: string;
}

const key = (id: number) => `suggestion:${id}`;

function render(s: Suggestion): string {
  const lines = [`💡 **Suggestion #${s.id}** · from **${s.authorName}**`, quote(s.text), ""];
  let status = `**Status:** ${label(s.status)}`;
  if (s.status !== "open" && s.reviewer) status += ` by **${s.reviewer}**`;
  lines.push(status);
  if (s.note) lines.push(`> 📝 ${s.note}`);
  if (s.status === "open") lines.push("_Vote with 👍 or 👎_");
  return lines.join("\n");
}

async function createSuggestion(authorId: string, rawText: string): Promise<Suggestion | undefined> {
  const channelId = directory.channelId(config.suggestions.channel);
  if (!channelId) return undefined;
  const text = truncate(defuseMentions(rawText).trim(), 1500);
  const id = await kv.next("suggestionstate:count");
  const draft: Suggestion = { id, channelId, messageId: "", authorId, authorName: await nickname(authorId), text, status: "open" };
  const msg = await send(channelId, render(draft));
  const suggestion = { ...draft, messageId: msg.id };
  await kv.set(key(id), suggestion);
  await react(channelId, msg.id, E.thumbsUp);
  await react(channelId, msg.id, E.thumbsDown);
  return suggestion;
}

/**
 * A member's plain message in #suggestions becomes a card. Replies (discussion
 * under a card) and the team's messages are left as they are.
 */
export async function captureSuggestion(evt: ChannelMessageCreatedEvent): Promise<boolean> {
  if (!config.suggestions.enabled) return false;
  if (evt.channelId !== directory.channelId(config.suggestions.channel)) return false;
  if (evt.parentMessages.length > 0) return false;
  const text = (evt.messageContent ?? "").trim();
  if (text.length === 0 || (await accessLevel(evt.userId)) !== "everyone") return false;
  if (text.length < 10) {
    sendEphemeral(evt.channelId, "💡 Tell us a bit more! Suggestions need at least a sentence.");
    await remove(evt.channelId, evt.id).catch(() => undefined);
    return true;
  }
  try {
    const created = await createSuggestion(evt.userId, text);
    if (created) await remove(evt.channelId, evt.id);
  } catch (err) {
    log("warn", "couldn't capture suggestion", { error: errMessage(err) });
  }
  return true;
}

function reviewCommand(name: string, status: Status, aliases: string[], summary: string): Command {
  return {
    name,
    aliases,
    usage: "<number> [note]",
    summary,
    level: "mod",
    category: "Staff",
    async run(ctx) {
      const id = Number(ctx.args[0]?.replace(/^#/, ""));
      if (!Number.isInteger(id)) throw new UsageError(`Usage: \`${config.prefix}${name} 12 Great idea, starting next week!\``);
      const note = ctx.args.slice(1).join(" ").trim() || undefined;

      await serialize(key(id), async () => {
        const s = await kv.get<Suggestion>(key(id));
        if (!s) throw new UsageError(`There's no suggestion #${id}.`);
        const updated: Suggestion = {
          ...s,
          status,
          note: note ? truncate(defuseMentions(note), 500) : status === "open" ? undefined : s.note,
          reviewer: await nickname(ctx.userId),
        };
        await edit(s.channelId, s.messageId, render(updated));
        await kv.set(key(id), updated);
        if (status !== "open") {
          await notify([s.authorId], `Suggestion #${id}: ${STATUS[status].name}`, s.text);
        }
      });
      await ctx.reply(`👍 Suggestion #${id} marked **${label(status)}**.`);
    },
  };
}

export const suggestionCommands: Command[] = [
  {
    name: "suggest",
    usage: "<your idea>",
    summary: "Send an idea to #suggestions for everyone to vote on.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      if (ctx.rest.length < 10) throw new UsageError(`Tell us a bit more: \`${config.prefix}suggest A monthly movie night in the Stage\``);
      const created = await createSuggestion(ctx.userId, ctx.rest);
      if (!created) {
        await ctx.reply("⚠️ The suggestions channel doesn't exist yet.");
        return;
      }
      await ctx.reply(`💡 Thanks! Your idea is up for votes as **Suggestion #${created.id}** in ${directory.channelMention(config.suggestions.channel)}.`);
    },
  },
  reviewCommand("approve", "approved", [], "Mark a suggestion approved."),
  reviewCommand("wip", "progress", ["inprogress"], "Mark a suggestion in progress."),
  reviewCommand("done", "done", ["implemented"], "Mark a suggestion done."),
  reviewCommand("decline", "declined", ["deny"], "Decline a suggestion (a note explaining why is kind)."),
  reviewCommand("reopen", "open", [], "Put a suggestion back up for votes."),
];
