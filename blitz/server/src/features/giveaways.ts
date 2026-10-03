// Giveaways: the team posts one (`!giveaway 1d 2 winners Nitro`), members
// enter by reacting 🎉 or from Blitz's menu, and when time's up Blitz draws
// the winners at random, announces them and lets them know. A Stardust prize
// ("500 stardust") is paid out automatically. `!reroll` draws again.

import type { ChannelMessageReactionCreatedEvent, ChannelMessageReactionDeletedEvent } from "@rootsdk/server-app";
import { config } from "../config";
import { Command, UsageError } from "../core/commands";
import { cancelJobs, onJob, scheduleOnce } from "../core/jobs";
import { serialize } from "../core/lock";
import { isPerson, knownPeople, nickname } from "../core/members";
import { edit, modLog, notify, react, send } from "../core/messaging";
import { channelLink } from "../core/settings";
import { kv } from "../core/store";
import { E, isEmoji } from "../logic/emoji";
import { drawWinners, parseGiveaway, stardustPrize } from "../logic/giveaways";
import { formatDuration } from "../logic/parse";
import { defuseMentions, formatNumber, plural, truncate, userMention } from "../logic/text";
import { grantStardust } from "./stardust";

export interface Giveaway {
  id: number;
  channelId: string;
  messageId: string;
  prize: string;
  winners: number;
  endsAt: number;
  hostId: string;
  entrants: string[];
  ended: boolean;
  winnerIds: string[];
}

const JOB = "giveaway";
const key = (id: number) => `giveaway:${id}`;
const ACTIVE_KEY = "giveaways:active";
/** Message ID → giveaway, for reactions. */
const byMessage = new Map<string, number>();

export async function initGiveaways(): Promise<void> {
  for (const id of (await kv.get<number[]>(ACTIVE_KEY)) ?? []) {
    const g = await kv.get<Giveaway>(key(id));
    if (g && !g.ended) byMessage.set(g.messageId, g.id);
  }
  onJob(JOB, async (resourceId) => {
    const id = Number(resourceId.replace("giveaway-", ""));
    if (Number.isInteger(id)) await endGiveaway(id);
  });
}

export async function activeGiveaways(): Promise<Giveaway[]> {
  const ids = (await kv.get<number[]>(ACTIVE_KEY)) ?? [];
  const all = await Promise.all(ids.map((id) => kv.get<Giveaway>(key(id))));
  return all.filter((g): g is Giveaway => !!g && !g.ended).sort((a, b) => a.endsAt - b.endsAt);
}

/** The latest finished ones, for the menu. */
export async function recentGiveaways(count: number): Promise<Giveaway[]> {
  const total = (await kv.get<number>("giveawaystate:count")) ?? 0;
  const ids = Array.from({ length: Math.min(count * 2, total) }, (_, i) => total - i);
  const all = await Promise.all(ids.map((id) => kv.get<Giveaway>(key(id))));
  return all.filter((g): g is Giveaway => !!g && g.ended).slice(0, count);
}

function card(g: Giveaway, host: string, winners: string[] = []): string {
  const left = g.endsAt - Date.now();
  if (g.ended) {
    const won = winners.length ? winners.join(", ") : "nobody entered";
    return `🎉 **GIVEAWAY ENDED** · ${truncate(g.prize, 200)}\n🏆 ${g.winnerIds.length ? `Winner${g.winnerIds.length === 1 ? "" : "s"}: ${won}` : won} · ${plural(g.entrants.length, "entry", "entries")} · hosted by ${host}`;
  }
  return `🎉 **GIVEAWAY** · ${truncate(g.prize, 200)}\nReact 🎉 to enter (or from ${config.botName}'s menu)! ${plural(g.winners, "winner")} · ends in ${formatDuration(Math.max(0, left))} · hosted by ${host}`;
}

async function save(g: Giveaway): Promise<void> {
  await kv.set(key(g.id), g);
  await kv.update<number[]>(ACTIVE_KEY, (ids) => (g.ended ? ids.filter((i) => i !== g.id) : ids.includes(g.id) ? ids : [...ids, g.id]), []);
}

export async function enterGiveaway(id: number, userId: string, entering = true): Promise<Giveaway> {
  return serialize(key(id), async () => {
    const g = await kv.get<Giveaway>(key(id));
    if (!g) throw new UsageError(`There's no giveaway #${id}.`);
    if (g.ended) throw new UsageError(`Giveaway #${id} has ended.`);
    const has = g.entrants.includes(userId);
    if (entering && !has) g.entrants = [...g.entrants, userId];
    if (!entering && has) g.entrants = g.entrants.filter((u) => u !== userId);
    if (has !== entering) await save(g);
    return g;
  });
}

/** 🎉 reactions enter (and un-react leaves). */
export async function onGiveawayReaction(evt: ChannelMessageReactionCreatedEvent | ChannelMessageReactionDeletedEvent, added: boolean): Promise<void> {
  const id = byMessage.get(evt.messageId);
  if (id === undefined || !isEmoji(evt.shortcode, E.tada) || !isPerson(evt.userId)) return;
  await enterGiveaway(id, evt.userId, added).catch(() => undefined);
}

export async function endGiveaway(id: number, by?: string): Promise<Giveaway | undefined> {
  return serialize(key(id), async () => {
    const g = await kv.get<Giveaway>(key(id));
    if (!g || g.ended) return g;
    const present = new Set(knownPeople());
    g.winnerIds = drawWinners(g.entrants.filter((u) => present.has(u)), g.winners);
    g.ended = true;
    await save(g);
    byMessage.delete(g.messageId);
    await cancelJobs(`giveaway-${id}`).catch(() => undefined);
    await announce(g, by);
    return g;
  });
}

async function announce(g: Giveaway, by?: string): Promise<void> {
  const host = userMention(await nickname(g.hostId), g.hostId);
  const names = await Promise.all(g.winnerIds.map(async (id) => userMention(await nickname(id), id)));
  await edit(g.channelId, g.messageId, card(g, host, names)).catch(() => undefined);
  const dust = stardustPrize(g.prize);
  if (g.winnerIds.length === 0) {
    await send(g.channelId, `🎉 Giveaway #${g.id} (${truncate(g.prize, 100)}) ended with no entries. Next time!`).catch(() => undefined);
    return;
  }
  if (dust) for (const id of g.winnerIds) await grantStardust(id, dust).catch(() => undefined);
  await send(g.channelId, `🎉 Congratulations ${names.join(", ")}! You won **${truncate(defuseMentions(g.prize), 200)}**${dust ? ` (${formatNumber(dust)} ✨ is already in your wallet)` : `. ${host} will be in touch`}!`).catch(() => undefined);
  await notify(g.winnerIds, "🎉 You won a giveaway!", truncate(g.prize, 120));
  await modLog(`🎉 Giveaway #${g.id} (${truncate(g.prize, 100)}) ${by ? `ended early by **${await nickname(by)}**` : "ended"}: ${names.join(", ")} won out of ${plural(g.entrants.length, "entry", "entries")}.`);
}

export const giveawayCommands: Command[] = [
  {
    name: "giveaway",
    aliases: ["gstart"],
    usage: "<how long> [N winners] <prize>",
    summary: "Start a giveaway: members react 🎉 to enter, and winners are drawn when time's up. A prize like \"500 stardust\" pays out by itself.",
    level: "mod",
    category: "Staff",
    menu: "channel",
    async run(ctx) {
      const parsed = parseGiveaway(ctx.rest);
      if (!parsed) throw new UsageError(`Usage: \`${config.prefix}giveaway 1d 2 winners Nitro\` or \`${config.prefix}giveaway 2h 500 stardust\` (from 1 minute to 30 days).`);
      const id = await kv.next("giveawaystate:count");
      const g: Giveaway = { id, channelId: ctx.channelId, messageId: "", prize: defuseMentions(parsed.prize), winners: parsed.winners, endsAt: Date.now() + parsed.ms, hostId: ctx.userId, entrants: [], ended: false, winnerIds: [] };
      const msg = await send(ctx.channelId, card(g, userMention(await nickname(ctx.userId), ctx.userId)));
      g.messageId = msg.id;
      await save(g);
      byMessage.set(msg.id, id);
      await react(ctx.channelId, msg.id, E.tada);
      await scheduleOnce(JOB, `giveaway-${id}`, new Date(g.endsAt));
      if (ctx.from === "menu") await ctx.reply(`🎉 Giveaway #${id} is up in ${await channelLink(ctx.channelId)}!`);
    },
  },
  {
    name: "enter",
    usage: "<giveaway number>",
    summary: "Enter a giveaway (same as reacting 🎉).",
    level: "everyone",
    category: "Fun",
    async run(ctx) {
      const id = Number(ctx.args[0]?.replace(/^#/, ""));
      if (!Number.isInteger(id)) throw new UsageError(`Usage: \`${config.prefix}enter 3\`.`);
      const g = await enterGiveaway(id, ctx.userId);
      await ctx.notice(`🎉 You're in giveaway #${id} for **${truncate(g.prize, 80)}**! Good luck. (${plural(g.entrants.length, "entry", "entries")} so far)`);
    },
  },
  {
    name: "gend",
    aliases: ["endgiveaway"],
    usage: "<giveaway number>",
    summary: "End a giveaway now and draw the winners.",
    level: "mod",
    category: "Staff",
    async run(ctx) {
      const id = Number(ctx.args[0]?.replace(/^#/, ""));
      if (!Number.isInteger(id)) throw new UsageError(`Usage: \`${config.prefix}gend 3\`.`);
      const g = await endGiveaway(id, ctx.userId);
      if (!g) throw new UsageError(`There's no giveaway #${id}.`);
      await ctx.reply(`🎉 Giveaway #${id} is over.`);
    },
  },
  {
    name: "reroll",
    usage: "<giveaway number> [how many]",
    summary: "Draw new winners for a finished giveaway.",
    level: "mod",
    category: "Staff",
    async run(ctx) {
      const id = Number(ctx.args[0]?.replace(/^#/, ""));
      if (!Number.isInteger(id)) throw new UsageError(`Usage: \`${config.prefix}reroll 3\`.`);
      const g = await kv.get<Giveaway>(key(id));
      if (!g) throw new UsageError(`There's no giveaway #${id}.`);
      if (!g.ended) throw new UsageError(`Giveaway #${id} is still running. \`${config.prefix}gend ${id}\` ends it.`);
      const count = Math.max(1, Math.min(20, Number(ctx.args[1]) || g.winners));
      const present = new Set(knownPeople());
      const pool = g.entrants.filter((u) => present.has(u) && !g.winnerIds.includes(u));
      const fresh = drawWinners(pool, count);
      if (fresh.length === 0) throw new UsageError("There's nobody left to draw.");
      g.winnerIds = fresh;
      await kv.set(key(id), g);
      await announce(g, ctx.userId);
      if (ctx.channelId !== g.channelId) await ctx.reply(`🎲 Drew again for giveaway #${id}.`);
    },
  },
  {
    name: "giveaways",
    summary: "Giveaways running now.",
    level: "everyone",
    category: "Fun",
    async run(ctx) {
      const list = await activeGiveaways();
      if (list.length === 0) {
        await ctx.reply("🎉 No giveaways right now.");
        return;
      }
      const lines = await Promise.all(list.map(async (g) => `**#${g.id}** ${truncate(g.prize, 80)} · ends in ${formatDuration(g.endsAt - Date.now())} · ${await channelLink(g.channelId)} · ${plural(g.entrants.length, "entry", "entries")}`));
      await ctx.reply(["🎉 **Giveaways**", ...lines, `\`${config.prefix}enter <number>\` to join`].join("\n"));
    },
  },
];

