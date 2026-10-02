// Birthdays: members save their day (no year, no age), and on the day they
// get a shout-out in the community's birthday channel and wear its birthday
// role for the day. Both are picked in Blitz's settings; with no channel
// picked, birthdays are off.

import { birthdayLines } from "../content/lines";
import { config } from "../config";
import { Command, UsageError } from "../core/commands";
import { errMessage, log } from "../core/log";
import { knownPeople, nickname } from "../core/members";
import { addRole, removeRole, sendTo } from "../core/messaging";
import { settings } from "../core/settings";
import { kv } from "../core/store";
import { BirthdayEntry, birthdaysOn, upcomingBirthdays, utcDateKey } from "../logic/dates";
import { MonthDay, formatMonthDay, parseMonthDay } from "../logic/parse";
import { fillTemplate, pick, userMention } from "../logic/text";

const entryKey = (userId: string) => `bday:${userId}`;

async function allBirthdays(): Promise<BirthdayEntry[]> {
  const present = new Set(knownPeople());
  return (await kv.entries<MonthDay>("bday:"))
    .map(({ key, value }) => ({ userId: key.slice("bday:".length), birthday: value }))
    .filter((e) => present.has(e.userId));
}

interface Wearing {
  roleId: string;
  userIds: string[];
}

/** Daily: takes off yesterday's birthday roles and celebrates today's birthdays. */
export async function celebrateBirthdays(): Promise<void> {
  const now = Date.now();
  const today = utcDateKey(now);
  if ((await kv.get<string>("bdaystate:last")) === today) return;
  await kv.set("bdaystate:last", today);

  // Yesterday's role comes off even if birthdays were switched off since.
  const wore = await kv.get<Wearing>("bdaystate:wearing");
  if (wore?.roleId) {
    for (const userId of wore.userIds) {
      await removeRole(userId, wore.roleId).catch((err) => log("warn", "couldn't remove birthday role", { error: errMessage(err) }));
    }
    await kv.delete("bdaystate:wearing");
  }
  if (!settings.channel("birthdays")) return;
  const roleId = settings.role("birthdayRole");

  const todays = birthdaysOn(await allBirthdays(), now);
  if (todays.length === 0) return;

  const mentions: string[] = [];
  for (const entry of todays) mentions.push(userMention(await nickname(entry.userId), entry.userId));
  const users = mentions.length === 1 ? mentions[0] : `${mentions.slice(0, -1).join(", ")} and ${mentions[mentions.length - 1]}`;
  await sendTo("birthdays", fillTemplate(pick(birthdayLines), { users }));

  if (roleId) {
    const wearing: string[] = [];
    for (const entry of todays) {
      try {
        await addRole(entry.userId, roleId);
        wearing.push(entry.userId);
      } catch (err) {
        log("warn", "couldn't give birthday role", { error: errMessage(err) });
      }
    }
    await kv.set<Wearing>("bdaystate:wearing", { roleId, userIds: wearing });
  }
}

export const birthdayCommands: Command[] = [
  {
    name: "birthday",
    aliases: ["bday"],
    usage: "[July 14 | 07-14 | remove]",
    summary: "Save your birthday for a shout-out on the day (no year needed).",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      const input = ctx.rest.trim();
      if (input === "") {
        const mine = await kv.get<MonthDay>(entryKey(ctx.userId));
        await ctx.reply(
          mine
            ? `🎂 Your birthday is saved as **${formatMonthDay(mine)}**. Change it with \`${config.prefix}birthday <date>\` or \`${config.prefix}birthday remove\`.`
            : `🎂 Tell me your birthday with \`${config.prefix}birthday July 14\` and you'll get a shout-out on the day!`,
        );
        return;
      }
      if (/^(remove|delete|forget|clear)$/i.test(input)) {
        await kv.delete(entryKey(ctx.userId));
        await ctx.reply("🗑️ Birthday forgotten.");
        return;
      }
      const date = parseMonthDay(input);
      if (!date) throw new UsageError(`I couldn't read that date. Try \`${config.prefix}birthday July 14\` or \`${config.prefix}birthday 07-14\` (month-day).`);
      await kv.set(entryKey(ctx.userId), date);
      await ctx.reply(
        settings.channel("birthdays")
          ? `🎉 Got it! I'll celebrate you on **${formatMonthDay(date)}**.`
          : `🎉 Saved **${formatMonthDay(date)}**. Birthday shout-outs start once an admin picks a birthday channel in my settings.`,
      );
    },
  },
  {
    name: "birthdays",
    summary: "Upcoming birthdays.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      const upcoming = upcomingBirthdays(await allBirthdays(), Date.now(), 8);
      if (upcoming.length === 0) {
        await ctx.reply(`🎂 No birthdays saved yet. Add yours with \`${config.prefix}birthday July 14\`!`);
        return;
      }
      const lines = ["🎂 **Upcoming birthdays**"];
      for (const e of upcoming) {
        const when = e.inDays === 0 ? "**today!** 🎉" : e.inDays === 1 ? "tomorrow" : `in ${e.inDays} days`;
        lines.push(`• **${await nickname(e.userId)}**: ${formatMonthDay(e.birthday)} (${when})`);
      }
      await ctx.reply(lines.join("\n"));
    },
  },
];
