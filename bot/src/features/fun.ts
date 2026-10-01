// Small toys for #bot-commands.

import { eightBallAnswers } from "../content/lines";
import { config } from "../config";
import { Command, UsageError } from "../core/commands";
import { parseChoices, parseDice } from "../logic/parse";
import { defuseMentions, pick, truncate } from "../logic/text";

export const funCommands: Command[] = [
  {
    name: "8ball",
    usage: "<question>",
    summary: "Ask the magic 8-ball.",
    level: "everyone",
    category: "Fun",
    async run(ctx) {
      if (ctx.rest.length < 3) throw new UsageError(`Ask a question: \`${config.prefix}8ball Will it rain tomorrow?\``);
      await ctx.reply(`🎱 _${truncate(defuseMentions(ctx.rest), 200)}_\n**${pick(eightBallAnswers)}**`);
    },
  },
  {
    name: "roll",
    aliases: ["dice"],
    usage: "[d20 | 2d6+1 | 100]",
    summary: "Roll dice.",
    level: "everyone",
    category: "Fun",
    async run(ctx) {
      const dice = parseDice(ctx.rest);
      if (!dice) throw new UsageError(`Try \`${config.prefix}roll d20\`, \`${config.prefix}roll 2d6+1\` or \`${config.prefix}roll 100\`.`);
      const rolls = Array.from({ length: dice.count }, () => 1 + Math.floor(Math.random() * dice.sides));
      const total = rolls.reduce((a, b) => a + b, 0) + dice.modifier;
      const mod = dice.modifier === 0 ? "" : dice.modifier > 0 ? ` + ${dice.modifier}` : ` - ${-dice.modifier}`;
      const shown = dice.count > 1 || dice.modifier !== 0 ? `[${rolls.join(", ")}]${mod} = ` : "";
      const label = `${dice.count > 1 ? dice.count : ""}d${dice.sides}${mod.replace(/ /g, "")}`;
      await ctx.reply(`🎲 ${label} → ${shown}**${total}**`);
    },
  },
  {
    name: "flip",
    aliases: ["coin"],
    summary: "Flip a coin.",
    level: "everyone",
    category: "Fun",
    async run(ctx) {
      await ctx.reply(`🪙 **${Math.random() < 0.5 ? "Heads" : "Tails"}!**`);
    },
  },
  {
    name: "choose",
    aliases: ["pick"],
    usage: "<a | b | c>",
    summary: `Can't decide? Let ${config.botName} pick.`,
    level: "everyone",
    category: "Fun",
    async run(ctx) {
      const options = parseChoices(defuseMentions(ctx.rest));
      if (options.length < 2) throw new UsageError(`Give me at least two options: \`${config.prefix}choose pizza | tacos | sushi\``);
      await ctx.reply(`🤔 I choose… **${truncate(pick(options), 200)}**!`);
    },
  },
];
