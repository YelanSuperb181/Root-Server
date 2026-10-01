// Poll rendering and tallying. Votes are reactions, so a tally is just the
// unique members per option emoji, minus bots.

import { E, Emoji, NUMBERS, isEmoji } from "./emoji";
import { formatDuration } from "./parse";
import { progressBar } from "./text";

export interface PollRecord {
  id: number;
  channelId: string;
  messageId: string;
  authorId: string;
  question: string;
  /** Empty for a yes/no poll. */
  options: string[];
  createdAt: number;
  closesAt?: number;
  closed: boolean;
}

export function pollEmojis(options: readonly string[]): Emoji[] {
  return options.length === 0 ? [E.check, E.cross] : NUMBERS.slice(0, options.length);
}

export function pollLabels(options: readonly string[]): string[] {
  return options.length === 0 ? ["Yes", "No"] : [...options];
}

export interface Reaction {
  shortcode: string;
  userId: string;
}

/** Votes per option; each member counts once per option. */
export function tally(reactions: readonly Reaction[], emojis: readonly Emoji[], ignore: (userId: string) => boolean): number[] {
  return emojis.map((e) => {
    const voters = new Set<string>();
    for (const r of reactions) {
      if (isEmoji(r.shortcode, e) && !ignore(r.userId)) voters.add(r.userId);
    }
    return voters.size;
  });
}

/** Indexes of the options with the most votes (several on a tie, none if nobody voted). */
export function winners(counts: readonly number[]): number[] {
  const top = Math.max(0, ...counts);
  if (top === 0) return [];
  return counts.flatMap((c, i) => (c === top ? [i] : []));
}

export function renderPoll(poll: PollRecord, authorMention: string, now: number, counts?: readonly number[]): string {
  const emojis = pollEmojis(poll.options);
  const labels = pollLabels(poll.options);
  const lines = [`📊 **Poll #${poll.id}** · by ${authorMention}`, `**${poll.question}**`, ""];

  if (!counts) {
    labels.forEach((label, i) => lines.push(`${emojis[i].glyph}  ${label}`));
    lines.push("");
    const closes =
      poll.closesAt !== undefined ? ` · closes in **${formatDuration(Math.max(0, poll.closesAt - now))}**` : "";
    lines.push(`_React below to vote${closes}._`);
    return lines.join("\n");
  }

  const total = counts.reduce((a, b) => a + b, 0);
  const best = new Set(winners(counts));
  labels.forEach((label, i) => {
    const share = total > 0 ? counts[i] / total : 0;
    const crown = best.has(i) ? " 👑" : "";
    lines.push(`${emojis[i].glyph}  ${label}${crown}`);
    lines.push(`${progressBar(share)}  ${Math.round(share * 100)}% · ${counts[i]} vote${counts[i] === 1 ? "" : "s"}`);
  });
  lines.push("");
  lines.push(`🏁 _Poll closed · ${total} vote${total === 1 ? "" : "s"} in total._`);
  return lines.join("\n");
}

/** The one-line result announcement posted as a reply when a poll closes. */
export function resultLine(poll: PollRecord, counts: readonly number[]): string {
  const labels = pollLabels(poll.options);
  const top = winners(counts);
  if (top.length === 0) return `📊 Poll #${poll.id} closed with no votes.`;
  if (top.length === 1) return `📊 Poll #${poll.id} closed! The winner is **${labels[top[0]]}** 🎉`;
  return `📊 Poll #${poll.id} closed in a tie between ${top.map((i) => `**${labels[i]}**`).join(" and ")}!`;
}
