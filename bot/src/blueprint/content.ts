// The messages `!setup` posts: a short "how this channel works" note, pinned,
// in the channels where Wisp does something. Edit freely; `!setup content`
// posts anything that's missing, and `!setup refresh` re-renders the existing
// posts in place.
//
// Two optional extras are supported but unused here: a "rules" post whose ✅
// reaction unlocks the community (see config.onboarding.gate), and reaction
// role pickers posted right after a "roles-intro" post.

import { config } from "../config";
import { E, Emoji } from "../logic/emoji";
import { blueprint } from "./layout";

export interface PostContext {
  community: string;
  prefix: string;
  botName: string;
  gate: boolean;
  /** A clickable channel mention for a blueprint key. */
  channel(key: string): string;
  /** A role's display name, bold, without pinging anyone. */
  role(key: string): string;
}

export interface PanelOption {
  emoji: Emoji;
  role: string;
}

export interface RolePanel {
  key: string;
  title: string;
  blurb: string;
  /** Only one role from the panel at a time (picking one removes the others). */
  exclusive: boolean;
  options: PanelOption[];
}

/** If there's a "rules" post, reacting with this grants the role (gate on only). */
export const rulesGate = { emoji: E.check, role: "member" } as const;

/** Reaction role pickers. None in this server. */
export const rolePanels: RolePanel[] = [];

export interface StarterPost {
  key: string;
  channel: string;
  pin: boolean;
  render(ctx: PostContext): string;
}

export const starterPosts: StarterPost[] = [
  {
    key: "bot-commands",
    channel: "bot-commands",
    pin: true,
    render: (ctx) =>
      [
        `✨ **${ctx.botName} has drifted in.**`,
        "",
        `I live here now. \`${ctx.prefix}help\` lists everything; the good stuff:`,
        `• \`${ctx.prefix}rank\` your level · \`${ctx.prefix}top\` who yaps the most`,
        `• \`${ctx.prefix}birthday July 14\` and I'll make a fuss on the day`,
        `• \`${ctx.prefix}poll Pizza or tacos? | Pizza | Tacos\` settle it`,
        `• \`${ctx.prefix}quote\` a random gem from ${ctx.channel("quotes")}`,
        `• \`${ctx.prefix}8ball\`, \`${ctx.prefix}roll 2d6\`, \`${ctx.prefix}flip\`, \`${ctx.prefix}choose a | b\``,
      ].join("\n"),
  },
  {
    key: "quotes",
    channel: "quotes",
    pin: true,
    render: (ctx) =>
      [
        `🗣️ **The quote wall**`,
        "",
        `React ${config.starboard.emoji.glyph} on anything someone says. Once ${config.starboard.threshold} people do (not counting whoever said it), ${ctx.botName} saves it here forever. \`${ctx.prefix}quote\` pulls a random one back up.`,
        "",
        `Nothing from ${ctx.channel("the-vent-aka-hell")} ever ends up here.`,
      ].join("\n"),
  },
  {
    key: "birthdays",
    channel: "birthdays",
    pin: true,
    render: (ctx) =>
      [
        "🎂 **Birthdays**",
        "",
        `Tell ${ctx.botName} yours with \`${ctx.prefix}birthday July 14\` (no year, nobody needs to know). On the day you get a shout-out here and the ${ctx.role("birthday")} role for 24 hours. \`${ctx.prefix}birthdays\` shows who's next.`,
      ].join("\n"),
  },
  {
    key: "polls",
    channel: "polls",
    pin: true,
    render: (ctx) =>
      [
        "📊 **Polls**",
        "",
        `\`${ctx.prefix}poll 1h Movie night? | Shrek | Shrek 2\` makes a vote that closes itself after an hour and announces the winner. Leave out the options for a yes/no poll; leave out the time and close it with \`${ctx.prefix}endpoll <number>\`.`,
      ].join("\n"),
  },
];

/** The text of one role panel post. */
export function renderPanel(panel: RolePanel): string {
  const lines = [`**${panel.title}**`, `_${panel.blurb}_`, ""];
  for (const option of panel.options) {
    const role = blueprint.roles.find((r) => r.key === option.role);
    const name = role?.name ?? option.role;
    const extra = role && (role.category === "interest" || role.category === "ping") ? ` · ${role.description}` : "";
    lines.push(`${option.emoji.glyph}  **${name}**${extra}`);
  }
  return lines.join("\n");
}
