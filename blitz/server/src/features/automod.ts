// Light auto-moderation: removes mass mentions, invite links, blocked words,
// floods and copy-paste spam, tells the member why, logs it for the team, and
// raises a flag in the mod log when someone keeps at it. Staff are exempt.
// Each community sets its own blocked words and invite rule in Blitz's settings.

import type { ChannelMessageCreatedEvent } from "@rootsdk/server-app";
import { config } from "../config";
import { errMessage, log } from "../core/log";
import { accessLevel, nickname } from "../core/members";
import { modLog, remove, sendEphemeral } from "../core/messaging";
import { channelLink, settings, staffPing } from "../core/settings";
import { AutomodRules, History, addStrike, checkContent, checkRate, emptyHistory } from "../logic/automod";
import { parseWordList } from "../logic/moderation";
import { parseCommand } from "../logic/parse";
import { defuseMentions, truncate, userMention } from "../logic/text";

/** The rules, with the community's own blocked words and invite setting from Blitz's settings. */
let cached: { words: string | undefined; invites: boolean; rules: AutomodRules } | undefined;
function rules(): AutomodRules {
  const words = settings.text("blockedWords");
  const invites = settings.ticked("blockInvites");
  if (!cached || cached.words !== words || cached.invites !== invites) {
    cached = {
      words,
      invites,
      rules: {
        maxMentions: config.automod.maxMentions,
        spam: config.automod.spam,
        duplicates: config.automod.duplicates,
        blockInviteLinks: config.automod.blockInviteLinks || invites,
        blockedWords: [...config.automod.blockedWords, ...parseWordList(words)],
      },
    };
  }
  return cached.rules;
}

const histories = new Map<string, History>();
const strikes = new Map<string, number[]>();
const STRIKE_WINDOW_MS = config.automod.strikeWindowMinutes * 60_000;

export function initAutomod(): void {
  // Forget quiet members now and then, so memory stays flat.
  setInterval(() => {
    const cutoff = Date.now() - Math.max(STRIKE_WINDOW_MS, 5 * 60_000);
    for (const [userId, h] of histories) if ((h.times[h.times.length - 1] ?? 0) < cutoff) histories.delete(userId);
    for (const [userId, s] of strikes) if ((s[s.length - 1] ?? 0) < cutoff) strikes.delete(userId);
  }, 10 * 60_000).unref();
}

/** Returns true if the message was removed (the caller should stop processing it). */
export async function screenMessage(evt: ChannelMessageCreatedEvent): Promise<boolean> {
  if (!settings.on("automod")) return false;
  if (settings.isLog(evt.channelId)) return false;
  if ((await accessLevel(evt.userId)) !== "everyone") return false;

  const text = evt.messageContent ?? "";
  let history = histories.get(evt.userId);
  if (!history) {
    history = emptyHistory();
    histories.set(evt.userId, history);
  }
  const now = Date.now();
  // A report often quotes the very words it's about, so only flooding counts against one.
  const isReport = parseCommand(text, config.prefix)?.name === "report";
  const verdict = (isReport ? undefined : checkContent(text, rules())) ?? checkRate(history, text, now, rules());
  if (!verdict) return false;

  try {
    await remove(evt.channelId, evt.id);
  } catch (err) {
    log("warn", "auto-mod couldn't delete a message", { error: errMessage(err) });
    return false;
  }

  const name = await nickname(evt.userId);
  const who = userMention(name, evt.userId);
  sendEphemeral(evt.channelId, `🛡️ ${who}, your message was removed: ${verdict.reason}.`);

  const where = await channelLink(evt.channelId);
  const excerpt = truncate(defuseMentions(text).replace(/\s+/g, " "), 200);
  await modLog(`🛡️ Removed a message from **${name}** in ${where} (${verdict.kind})${excerpt ? `: "${excerpt}"` : ""}`);

  const list = addStrike(strikes.get(evt.userId) ?? [], now, STRIKE_WINDOW_MS);
  strikes.set(evt.userId, list);
  if (list.length >= config.automod.strikesToAlert) {
    strikes.delete(evt.userId);
    await modLog(
      `🚨 ${who} has had ${list.length} messages removed in ${config.automod.strikeWindowMinutes} minutes. ${(await staffPing()) || "Staff"}, can someone take a look?`,
    );
  }
  return true;
}
