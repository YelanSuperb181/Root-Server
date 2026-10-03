// Blitz's brain helping the team (only when the community ticks "Let
// Blitz's brain help moderate" and has an API key). Two jobs:
//  - Reports: Claude reads the reported message and the conversation
//    around it, then tells the team what happened, how serious it looks
//    and what it would suggest. The team decides; Blitz never acts on it.
//  - Context checks: before auto-mod removes a message for a blocked word,
//    Claude looks at it in context ("that boss fight killed me" isn't a
//    threat), so fewer innocent messages get caught. If Claude can't be
//    reached, auto-mod goes ahead as usual.
// Private channels are never read or sent.

import { rootServer, ChannelGuid, MessageDirectionTake, RootGuidUtils } from "@rootsdk/server-app";
import { config } from "../config";
import { read } from "../core/api";
import { errMessage, log } from "../core/log";
import { nickname } from "../core/members";
import { modLog } from "../core/messaging";
import { settings } from "../core/settings";
import { kv } from "../core/store";
import { defuseMentions, truncate } from "../logic/text";
import { claudeFor, textOf } from "./brain";

export interface ChatLine {
  userId: string;
  name: string;
  text: string;
  at: number;
  id: string;
}

/** Whether the community lets Blitz's brain help moderate. */
export function brainModeration(): boolean {
  return settings.ticked("brainModeration");
}

/** The latest messages in a channel (oldest first), names filled in. Never from private or log channels. */
export async function recentMessages(channelId: string, limit: number, before?: Date): Promise<ChatLine[]> {
  if (!channelId || settings.isPrivate(channelId) || settings.isLog(channelId)) return [];
  const res = await read("channelMessages.list", () =>
    rootServer.community.channelMessages.list({ channelId: channelId as ChannelGuid, messageDirectionTake: MessageDirectionTake.Older, dateAt: before ?? new Date(), limit: Math.min(100, limit) }),
  );
  const names = new Map<string, string>();
  const lines: ChatLine[] = [];
  // Message IDs carry their creation time.
  const at = (id: string) => {
    try {
      return RootGuidUtils.toMilliseconds(id);
    } catch {
      return 0;
    }
  };
  for (const m of res.messages.filter((x) => !x.deletedAt).sort((a, b) => at(a.id) - at(b.id))) {
    if (!m.messageContent?.trim()) continue;
    if (!names.has(m.userId)) names.set(m.userId, await nickname(m.userId));
    lines.push({ userId: m.userId, name: names.get(m.userId)!, text: truncate(defuseMentions(m.messageContent).replace(/\s+/g, " "), 400), at: at(m.id), id: m.id });
  }
  return lines;
}

export const transcriptOf = (lines: readonly ChatLine[]) => lines.map((l) => `${l.name}: ${l.text}`).join("\n");

const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "One or two plain sentences: what happened, as the messages show it." },
    severity: { type: "string", enum: ["low", "medium", "high"] },
    suggestion: { type: "string", description: "What the team might do: e.g. 'no action needed', 'a friendly word', 'warn', 'mute 1h', 'ban: scam'." },
  },
  required: ["summary", "severity", "suggestion"],
  additionalProperties: false,
} as const;

const TRIAGE_SYSTEM = `You help the volunteer moderators of an online community triage reports. Read the report and the conversation, then say plainly what happened, how serious it is, and what you'd suggest. Be fair to everyone: the reported person may be innocent, joking among friends, or quoting someone. Severity: high for threats, hate, sexual content involving minors, doxxing, scams or self-harm risk; medium for harassment, slurs, targeted insults, spam; low for arguments, rudeness, or nothing wrong. Never invent details the messages don't show. Keep it short.`;

/** Asks Claude to triage a report filed in the inbox, then adds its notes to the conversation and the staff log. */
export async function triageReport(ticketId: number, channelId: string, reportedMessageId: string | undefined): Promise<void> {
  if (!brainModeration()) return;
  const claude = claudeFor("report triage");
  if (!claude) return;
  try {
    const ticket = await kv.get<{ id: number; messages: Array<{ text: string }>; aboutUserId?: string; triage?: unknown }>(`ticket:${ticketId}`);
    if (!ticket) return;
    const context = channelId ? await recentMessages(channelId, 25).catch(() => []) : [];
    const about = ticket.aboutUserId ? await nickname(ticket.aboutUserId) : "not named";
    const prompt = [
      `Report: ${ticket.messages[0]?.text ?? ""}`,
      `Reported person: ${about}`,
      reportedMessageId ? `The reported message is marked with >>>.` : "",
      context.length ? `Recent conversation where it was reported:\n${context.map((l) => `${l.id === reportedMessageId ? ">>> " : ""}${l.name}: ${l.text}`).join("\n")}` : "(No conversation available: it came from Blitz's menu or a private channel.)",
    ]
      .filter(Boolean)
      .join("\n\n");
    const response = await claude.messages.create({
      model: config.brain.model,
      max_tokens: 2000,
      output_config: { effort: "low", format: { type: "json_schema", schema: TRIAGE_SCHEMA } },
      system: TRIAGE_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const text = textOf(response);
    if (!text) return;
    const triage = JSON.parse(text) as { summary: string; severity: "low" | "medium" | "high"; suggestion: string };
    const saved = await kv.get<Record<string, unknown>>(`ticket:${ticketId}`);
    if (saved) await kv.set(`ticket:${ticketId}`, { ...saved, triage });
    const dot = { low: "🟢", medium: "🟠", high: "🔴" }[triage.severity] ?? "⚪";
    await modLog(`🧠 **Report #${ticketId}**, as ${config.botName}'s brain reads it: ${dot} ${triage.severity} · ${truncate(triage.summary, 400)}\nSuggests: ${truncate(triage.suggestion, 200)} _(the team decides)_`);
  } catch (err) {
    log("warn", "couldn't triage a report", { error: errMessage(err) });
  }
}

const CHECK_SCHEMA = {
  type: "object",
  properties: {
    remove: { type: "boolean", description: "True if, in context, this message really is what the blocked word is there to stop." },
    why: { type: "string", description: "A few words explaining the call." },
  },
  required: ["remove", "why"],
  additionalProperties: false,
} as const;

/**
 * Whether a message auto-mod caught for a blocked word should really go.
 * True: remove it (also when Claude can't be asked in time).
 */
export async function confirmRemoval(text: string, channelId: string, word: string | undefined): Promise<{ remove: boolean; why?: string }> {
  if (!brainModeration() || settings.isPrivate(channelId)) return { remove: true };
  const claude = claudeFor("a context check");
  if (!claude) return { remove: true };
  try {
    const before = (await recentMessages(channelId, 8).catch(() => [])).slice(-6);
    const response = await claude.messages.create(
      {
        model: config.brain.model,
        max_tokens: 1000,
        output_config: { effort: "low", format: { type: "json_schema", schema: CHECK_SCHEMA } },
        system:
          "You double-check an online community's word filter. A message contains a word the community blocked. Decide whether, in context, it's what the filter is meant to stop (an insult, slur, harassment, sexual or hateful use) or an innocent use (gaming talk, quoting the rules, a word inside another meaning, self-deprecation among friends). When unsure, say remove.",
        messages: [{ role: "user", content: `Blocked word: ${word ?? "(one of the list)"}\nConversation before it:\n${transcriptOf(before) || "(none)"}\n\nThe message:\n${truncate(text, 800)}` }],
      },
      { timeout: 8000 },
    );
    const answer = textOf(response);
    if (!answer) return { remove: true };
    const verdict = JSON.parse(answer) as { remove: boolean; why: string };
    return { remove: verdict.remove !== false, why: verdict.why };
  } catch (err) {
    log("info", "context check skipped; auto-mod goes ahead", { error: errMessage(err) });
    return { remove: true };
  }
}
