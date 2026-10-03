// The community's own commands: staff save an answer once ("!addcmd rules
// Be kind, no spam…") and anyone can bring it up with "!rules". Handy for
// rules, FAQs, links and how-tos. Blitz's brain knows about them too, so it
// can point people at the right one.

import { config } from "../config";
import { Command, UsageError, isCommandName, setFallback } from "../core/commands";
import { nickname } from "../core/members";
import { kv } from "../core/store";
import { customNameProblem } from "../logic/moderation";
import { fillTemplate, plural, truncate, userMention } from "../logic/text";

interface Custom {
  name: string;
  response: string;
  by: string;
  at: number;
  uses: number;
}

const key = (name: string) => `custom:${name}`;
const customs = new Map<string, Custom>();
const lastRun = new Map<string, number>();
const MAX_CUSTOMS = 200;
const COOLDOWN_MS = 3000;

let changed: () => void = () => undefined;

/** Loads the community's commands and starts answering them. `onChange` runs whenever staff add or remove one. */
export async function initCustom(onChange: () => void): Promise<void> {
  changed = onChange;
  for (const { value } of await kv.entries<Custom>("custom:")) customs.set(value.name, value);
  setFallback(async (name, ctx) => {
    const custom = customs.get(name);
    if (!custom) return false;
    const now = Date.now();
    const spot = `${ctx.channelId}:${name}`;
    if (now - (lastRun.get(spot) ?? 0) < COOLDOWN_MS) return true;
    lastRun.set(spot, now);
    const text = fillTemplate(custom.response, {
      user: userMention(await nickname(ctx.userId), ctx.userId),
      args: ctx.rest,
    });
    await ctx.reply(text);
    custom.uses++;
    await kv.set(key(name), custom);
    return true;
  });
}

/** The community's commands (and how often each was used), for !help, the brain and the menu. */
export function customCommands(): Array<{ name: string; response: string; uses: number }> {
  return [...customs.values()].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ name: c.name, response: c.response, uses: c.uses }));
}

function nameFrom(input: string | undefined): string {
  return (input ?? "").toLowerCase().replace(new RegExp(`^\\${config.prefix}`), "");
}

export const customCommandsAdmin: Command[] = [
  {
    name: "addcmd",
    aliases: ["setcmd", "editcmd"],
    usage: "<name> <response>",
    summary: `Make (or change) a command anyone can use, like \`${config.prefix}addcmd rules Be kind!\`. {user} becomes whoever uses it.`,
    level: "mod",
    category: "Staff",
    async run(ctx) {
      const name = nameFrom(ctx.args[0]);
      const response = ctx.rest.slice((ctx.args[0] ?? "").length).trim();
      if (!name || !response) {
        throw new UsageError(`Usage: \`${config.prefix}addcmd rules 1. Be kind 2. No spam\`. Then anyone can type \`${config.prefix}rules\`.`);
      }
      const problem = customNameProblem(name, isCommandName);
      if (problem) throw new UsageError(problem);
      const existing = customs.get(name);
      if (!existing && customs.size >= MAX_CUSTOMS) throw new UsageError(`That's ${MAX_CUSTOMS} commands already; remove one first.`);
      const custom: Custom = { name, response: truncate(response, 4000), by: ctx.userId, at: Date.now(), uses: existing?.uses ?? 0 };
      customs.set(name, custom);
      await kv.set(key(name), custom);
      changed();
      await ctx.reply(`${existing ? "✏️ Updated" : "✅ Made"} \`${config.prefix}${name}\`. Try it!`);
    },
  },
  {
    name: "delcmd",
    aliases: ["removecmd"],
    usage: "<name>",
    summary: "Remove one of the community's commands.",
    level: "mod",
    category: "Staff",
    async run(ctx) {
      const name = nameFrom(ctx.args[0]);
      if (!customs.has(name)) throw new UsageError(`There's no \`${config.prefix}${name || "…"}\`. \`${config.prefix}cmds\` lists them.`);
      customs.delete(name);
      await kv.delete(key(name));
      changed();
      await ctx.reply(`🗑️ Removed \`${config.prefix}${name}\`.`);
    },
  },
  {
    name: "cmds",
    aliases: ["customs"],
    summary: "This community's own commands.",
    level: "everyone",
    category: "Community",
    async run(ctx) {
      const list = [...customs.values()].sort((a, b) => a.name.localeCompare(b.name));
      if (list.length === 0) {
        await ctx.reply(`📌 No community commands yet. The team can make one with \`${config.prefix}addcmd <name> <response>\`.`);
        return;
      }
      const lines = await Promise.all(
        list.slice(0, 50).map(async (c) => `\`${config.prefix}${c.name}\` · ${truncate(c.response.replace(/\s+/g, " "), 60)}${ctx.level !== "everyone" ? ` _(by ${await nickname(c.by)}, used ${plural(c.uses, "time")})_` : ""}`),
      );
      await ctx.reply([`📌 **Community commands**`, ...lines].join("\n"));
    },
  },
];
