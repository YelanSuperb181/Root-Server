// Blitz's wits on the server: what Blitz knows about the community, gathered
// for one question (channels and their topics, the community's own commands,
// roles, the asker's level and Stardust), handed to the shared `wits` logic,
// and, when the answer is a request ("remind me in 2h to stretch"), the real
// command run as the person asking. Used whenever Blitz has no brain, or its
// brain can't answer. Nothing here leaves Root.

import type { ChannelMessageCreatedEvent } from "@rootsdk/server-app";
import { WitsAnswer, WitsKnowledge, WitsMemory, wits } from "@blitz/shared";
import { config } from "../config";
import { allCommands, runAsTyped, runFromMenu } from "../core/commands";
import { communityName, listChannels, textChannels } from "../core/community";
import { errMessage, log } from "../core/log";
import { accessLevel, atLeast, communityRoles, knownPeople, nickname } from "../core/members";
import { remember } from "../core/memo";
import { settings } from "../core/settings";
import { customCommands } from "../features/custom";
import { levelRewards, levelRules, levelsFor } from "../features/levels";
import { roleChoices } from "../features/selfroles";
import { dailyReady, walletOf } from "../features/stardust";
import { channelMention } from "../logic/text";

/** The channels people can see, with their topics (re-read every minute). */
const visibleChannels = remember(60_000, async () =>
  (await listChannels()).filter((c) => c.type === "text").map((c) => ({ id: c.id, name: c.name, topic: c.description })),
);

/** What Blitz last answered each person, per channel (and in their domain), for follow-ups. */
const memories = new Map<string, WitsMemory>();
const MEMORY_MS = 180_000;

/** Runs `get`; on failure gives `fallback`, so one missing piece never stops Blitz answering. */
async function safely<T>(get: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await get();
  } catch {
    return fallback;
  }
}

async function knowledge(userId: string, where: WitsKnowledge["where"]): Promise<WitsKnowledge> {
  const level = await safely(() => accessLevel(userId), "everyone" as const);
  const [community, channels, roles, rewards, allRoles, levels, wallet, asker] = await Promise.all([
    safely(communityName, "this community"),
    safely(visibleChannels, []),
    safely(() => roleChoices(userId), []),
    safely(levelRewards, []),
    safely(communityRoles, []),
    settings.on("levels") ? safely(() => levelsFor(userId, 3), undefined) : Promise.resolve(undefined),
    settings.on("stardust") ? safely(() => walletOf(userId), undefined) : Promise.resolve(undefined),
    safely(() => nickname(userId), "friend"),
  ]);
  return {
    botName: config.botName,
    prefix: config.prefix,
    community,
    about: settings.text("about"),
    members: knownPeople().length,
    channels: channels.filter((c) => !settings.isPrivate(c.id) && !settings.isLog(c.id)).map((c) => ({ name: c.name, topic: c.topic, mention: channelMention(c.name, c.id) })),
    commands: allCommands()
      .filter((c) => atLeast(level, c.level))
      .map((c) => ({ name: c.name, aliases: c.aliases ?? [], summary: c.summary, usage: c.usage })),
    customs: customCommands().map((c) => ({ name: c.name, response: c.response })),
    selfRoles: roles.map((r) => r.name),
    levelRewards: rewards.map((r) => ({ level: r.level, role: allRoles.find((x) => x.id === r.roleId)?.name ?? "a role" })).filter((r) => r.role !== "a role"),
    levels: levels ? { level: levels.level, xp: levels.xp, into: levels.into, needed: levels.needed, place: levels.place, how: levelRules() } : undefined,
    top: levels?.top.map((t) => t.name),
    stardust: wallet ? { balance: wallet.balance, streak: wallet.streak, dailyReady: dailyReady(wallet) } : undefined,
    on: { inbox: settings.on("inbox"), birthdays: settings.channel("birthdays") !== undefined, suggestions: settings.channel("suggestions") !== undefined },
    asker,
    where,
    now: Date.now(),
  };
}

/** The first line of a command's reply, plain, for Blitz's speech bubble. */
function bubble(text: string): string {
  const line = text
    .split("\n")[0]
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
  return line.length <= 160 ? line : `${line.slice(0, 159).trimEnd()}…`;
}

/**
 * Blitz's answer to someone, without its brain. In chat, `evt` is their
 * message (commands they ask for run in that channel); in the domain there's
 * no channel, so commands answer the way they do from Blitz's menu.
 */
export async function witsAnswer(userId: string, text: string, where: WitsKnowledge["where"], evt?: ChannelMessageCreatedEvent): Promise<WitsAnswer> {
  const place = where === "chat" && evt ? `${evt.channelId}:${userId}` : `domain:${userId}`;
  const k = await knowledge(userId, where);
  const before = memories.get(place);
  const answer = wits(text, k, before && Date.now() - before.at < MEMORY_MS ? before : undefined);
  if (answer.intent !== "chatter") memories.set(place, { intent: answer.intent, topic: answer.topic, at: Date.now() });
  if (memories.size > 2000) memories.clear();
  if (!answer.run) return answer;

  // A request: run the real command as them, with the usual checks, and answer with what it says.
  try {
    const { command, args } = answer.run;
    const ran =
      where === "chat" && evt
        ? await runAsTyped(evt, command, args)
        : await runFromMenu(userId, command, args, "", async (id) => (await textChannels()).some((c) => c.id === id));
    if (ran.replies.length > 0) {
      const reply = ran.replies.join("\n\n");
      return { ...answer, reply, say: bubble(reply), mood: ran.ok ? answer.mood : "curious", trick: ran.ok ? answer.trick : "approach" };
    }
  } catch (err) {
    log("warn", "Blitz couldn't do what someone asked", { error: errMessage(err) });
  }
  return { ...answer, reply: "hmm, that didn't work. try the command itself?", say: "hmm, that didn't work…", mood: "curious", trick: "approach" };
}
