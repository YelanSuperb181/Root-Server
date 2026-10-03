// Stardust: a little currency for being part of the community. Earned by
// chatting (once a minute), the daily gift (bigger with a streak), levelling
// up and giveaways; spent in the shop on looks for your own Blitz (a hat, a
// trail, a glow), which it wears in your domain window. Members can gift it.
// A community can turn it off in Blitz's settings.

import type { ChannelMessageCreatedEvent } from "@rootsdk/server-app";
import { COSMETICS, Cosmetic, CosmeticSlot, Outfit, cosmetic, findCosmetic } from "@blitz/shared";
import { config } from "../config";
import { Command, UsageError } from "../core/commands";
import { serialize } from "../core/lock";
import { isPerson, knownPeople, nickname } from "../core/members";
import { settings } from "../core/settings";
import { kv } from "../core/store";
import { formatDuration } from "../logic/parse";
import { CHAT_COOLDOWN_MS, chatEarning, claimDaily, levelUpReward, nextDailyAt } from "../logic/stardust";
import { formatNumber, mentionedUserIds, placeLabel } from "../logic/text";

export interface Wallet {
  balance: number;
  /** Everything ever earned (for the leaderboard). */
  earned: number;
  /** The UTC day of the last daily gift. */
  lastDaily?: string;
  streak: number;
  owned: string[];
  wearing: Outfit;
  lastChat?: number;
}

const EMPTY: Wallet = { balance: 0, earned: 0, streak: 0, owned: [], wearing: {} };
const key = (userId: string) => `dust:${userId}`;
const SLOT_LABEL: Record<CosmeticSlot, string> = { hat: "Hats", trail: "Trails", glow: "Glows" };

export async function walletOf(userId: string): Promise<Wallet> {
  return { ...EMPTY, ...((await kv.get<Wallet>(key(userId))) ?? {}) };
}

/** Read, change, write, one at a time per member (a change that throws leaves the wallet as it was). */
async function change(userId: string, fn: (w: Wallet) => Wallet): Promise<Wallet> {
  return serialize(key(userId), async () => {
    const before = await walletOf(userId);
    const after = fn(before);
    if (after !== before) await kv.set(key(userId), after);
    return after;
  });
}

/** Adds (or, with a negative amount, takes) Stardust. */
export async function grantStardust(userId: string, amount: number): Promise<Wallet> {
  return change(userId, (w) => ({ ...w, balance: Math.max(0, w.balance + amount), earned: w.earned + Math.max(0, amount) }));
}

/** Chatting pays a little Stardust, at most once a minute. */
export async function earnStardust(evt: ChannelMessageCreatedEvent): Promise<void> {
  if (!settings.on("stardust") || settings.isPrivate(evt.channelId) || settings.isLog(evt.channelId)) return;
  const now = Date.now();
  await change(evt.userId, (w) => {
    if (w.lastChat && now - w.lastChat < CHAT_COOLDOWN_MS) return w;
    const amount = chatEarning();
    return { ...w, balance: w.balance + amount, earned: w.earned + amount, lastChat: now };
  });
}

/** A level-up's Stardust; returns how much (0 when Stardust is off). */
export async function levelUpBonus(userId: string, level: number): Promise<number> {
  if (!settings.on("stardust")) return 0;
  const amount = levelUpReward(level);
  await grantStardust(userId, amount);
  return amount;
}

/** Claims today's gift. */
export async function claimDailyGift(userId: string): Promise<{ ok: boolean; amount: number; streak: number; weekBonus: boolean; balance: number; nextAt: number }> {
  let result = { ok: false, amount: 0, streak: 0, weekBonus: false };
  const now = Date.now();
  const w = await change(userId, (cur) => {
    result = claimDaily(cur.lastDaily, cur.streak, now);
    if (!result.ok) return cur;
    return { ...cur, balance: cur.balance + result.amount, earned: cur.earned + result.amount, streak: result.streak, lastDaily: new Date(now).toISOString().slice(0, 10) };
  });
  return { ...result, balance: w.balance, nextAt: nextDailyAt(now) };
}

export function dailyReady(w: Wallet, now = Date.now()): boolean {
  return w.lastDaily !== new Date(now).toISOString().slice(0, 10);
}

export async function buyCosmetic(userId: string, item: Cosmetic): Promise<Wallet> {
  return change(userId, (w) => {
    if (w.owned.includes(item.id)) throw new UsageError(`You already have the ${item.name}. Wear it with \`${config.prefix}wear ${item.id}\`.`);
    if (w.balance < item.price) throw new UsageError(`The ${item.name} costs ${formatNumber(item.price)} ✨ and you have ${formatNumber(w.balance)}. Keep chatting, and grab your \`${config.prefix}daily\`!`);
    // Bought things go straight on.
    return { ...w, balance: w.balance - item.price, owned: [...w.owned, item.id], wearing: { ...w.wearing, [item.slot]: item.id } };
  });
}

export async function wearCosmetic(userId: string, item: Cosmetic | undefined, slot?: CosmeticSlot): Promise<Wallet> {
  return change(userId, (w) => {
    if (!item) {
      const wearing = { ...w.wearing };
      if (slot) delete wearing[slot];
      return { ...w, wearing: slot ? wearing : {} };
    }
    if (!w.owned.includes(item.id)) throw new UsageError(`You don't have the ${item.name} yet: \`${config.prefix}buy ${item.id}\` (${formatNumber(item.price)} ✨).`);
    return { ...w, wearing: { ...w.wearing, [item.slot]: item.id } };
  });
}

export async function stardustTop(count: number): Promise<Array<{ userId: string; earned: number; balance: number }>> {
  const present = new Set(knownPeople());
  return (await kv.entries<Wallet>("dust:"))
    .map(({ key: k, value }) => ({ userId: k.slice(5), earned: value.earned ?? 0, balance: value.balance ?? 0 }))
    .filter((e) => present.has(e.userId) && e.earned > 0)
    .sort((a, b) => b.earned - a.earned)
    .slice(0, count);
}

function needsStardust(): void {
  if (!settings.on("stardust")) throw new UsageError("✨ Stardust is switched off in this community.");
}

const outfitLine = (o: Outfit) =>
  (["hat", "trail", "glow"] as const)
    .map((s) => o[s] && cosmetic(o[s]!))
    .filter((c): c is Cosmetic => !!c)
    .map((c) => `${c.icon} ${c.name}`)
    .join(" · ") || "nothing yet";

export const stardustCommands: Command[] = [
  {
    name: "stardust",
    aliases: ["dust", "balance", "bal", "wallet"],
    usage: "[@member | top]",
    summary: "Your Stardust, streak and Blitz's outfit (or someone else's, or the top collectors).",
    level: "everyone",
    category: "Fun",
    async run(ctx) {
      needsStardust();
      if (/^(top|leaderboard|lb)$/i.test(ctx.args[0] ?? "")) {
        const top = await stardustTop(10);
        if (top.length === 0) {
          await ctx.reply("✨ Nobody has collected any Stardust yet!");
          return;
        }
        const lines = await Promise.all(top.map(async (e, i) => `${placeLabel(i + 1)} **${await nickname(e.userId)}** · ${formatNumber(e.earned)} ✨ collected`));
        await ctx.reply(["✨ **Top Stardust collectors**", ...lines].join("\n"));
        return;
      }
      const target = mentionedUserIds(ctx.rest)[0] ?? ctx.userId;
      const w = await walletOf(target);
      const name = await nickname(target);
      const mine = target === ctx.userId;
      await ctx.reply(
        [
          `✨ **${name}** · ${formatNumber(w.balance)} Stardust`,
          `🔥 ${w.streak > 0 ? `${w.streak}-day streak` : "No streak yet"}${mine && dailyReady(w) ? ` · your \`${config.prefix}daily\` gift is ready!` : ""}`,
          `🪄 Wearing: ${outfitLine(w.wearing)}`,
        ].join("\n"),
      );
    },
  },
  {
    name: "daily",
    summary: "Collect today's Stardust gift (bigger every day in a row).",
    level: "everyone",
    category: "Fun",
    async run(ctx) {
      needsStardust();
      const r = await claimDailyGift(ctx.userId);
      if (!r.ok) {
        await ctx.reply(`🌙 You've had today's gift. The next one is ready in ${formatDuration(r.nextAt - Date.now())}.`);
        return;
      }
      await ctx.reply(`✨ +${formatNumber(r.amount)} Stardust${r.weekBonus ? " (a whole week in a row: bonus!)" : ""} · 🔥 ${r.streak}-day streak · you have ${formatNumber(r.balance)}.`);
    },
  },
  {
    name: "shop",
    summary: "Looks for your own Blitz, bought with Stardust.",
    level: "everyone",
    category: "Fun",
    async run(ctx) {
      needsStardust();
      const w = await walletOf(ctx.userId);
      const lines = [`🛍️ **Blitz's shop** · you have ${formatNumber(w.balance)} ✨`];
      for (const slot of ["hat", "trail", "glow"] as const) {
        lines.push("", `**${SLOT_LABEL[slot]}**`);
        for (const c of COSMETICS.filter((x) => x.slot === slot)) lines.push(`${c.icon} ${c.name} · ${w.owned.includes(c.id) ? (w.wearing[slot] === c.id ? "wearing" : "owned") : `${formatNumber(c.price)} ✨`}`);
      }
      lines.push("", `\`${config.prefix}buy crown\` · \`${config.prefix}wear halo\` · or shop in ${config.botName}'s menu`);
      await ctx.reply(lines.join("\n"));
    },
  },
  {
    name: "buy",
    usage: "<item>",
    summary: "Buy a look for your Blitz from the shop.",
    level: "everyone",
    category: "Fun",
    async run(ctx) {
      needsStardust();
      const item = findCosmetic(ctx.rest);
      if (!item) throw new UsageError(`There's nothing called "${ctx.rest}" in the shop. \`${config.prefix}shop\` shows what there is.`);
      const w = await buyCosmetic(ctx.userId, item);
      await ctx.reply(`🛍️ Your Blitz is now wearing the **${item.icon} ${item.name}**! (${formatNumber(w.balance)} ✨ left) Open its domain to see.`);
    },
  },
  {
    name: "wear",
    usage: "<item> | none [hat | trail | glow]",
    summary: "Change what your Blitz wears.",
    level: "everyone",
    category: "Fun",
    async run(ctx) {
      needsStardust();
      if (/^(none|nothing|off|remove)$/i.test(ctx.args[0] ?? "")) {
        const slot = (["hat", "trail", "glow"] as const).find((s) => s === ctx.args[1]?.toLowerCase());
        await wearCosmetic(ctx.userId, undefined, slot);
        await ctx.reply(slot ? `🪄 Took off the ${slot}.` : "🪄 Your Blitz is back to its plain glowing self.");
        return;
      }
      const item = findCosmetic(ctx.rest);
      if (!item) throw new UsageError(`Usage: \`${config.prefix}wear crown\` or \`${config.prefix}wear none\`.`);
      await wearCosmetic(ctx.userId, item);
      await ctx.reply(`🪄 Your Blitz put on the **${item.icon} ${item.name}**.`);
    },
  },
  {
    name: "gift",
    aliases: ["give", "pay"],
    usage: "@member <amount>",
    summary: "Give some of your Stardust to someone.",
    level: "everyone",
    category: "Fun",
    async run(ctx) {
      needsStardust();
      const to = mentionedUserIds(ctx.rest)[0];
      const amount = Number(ctx.rest.replace(/\[@[^\]]*\]\([^)]*\)/g, "").trim().split(/\s+/)[0]);
      if (!to || !Number.isInteger(amount) || amount < 1) throw new UsageError(`Usage: \`${config.prefix}gift @someone 50\`.`);
      if (to === ctx.userId) throw new UsageError("🙃 That's you!");
      if (!isPerson(to)) throw new UsageError("🤖 Apps don't collect Stardust.");
      await change(ctx.userId, (w) => {
        if (w.balance < amount) throw new UsageError(`You only have ${formatNumber(w.balance)} ✨.`);
        return { ...w, balance: w.balance - amount };
      });
      await change(to, (w) => ({ ...w, balance: w.balance + amount }));
      await ctx.reply(`🎁 Sent ${formatNumber(amount)} ✨ to **${await nickname(to)}**!`);
    },
  },
];
