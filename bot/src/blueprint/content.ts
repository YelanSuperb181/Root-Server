// The messages `!setup` posts: the welcome guide, the rules (with the ✅
// gate), the role pickers and a short "how this channel works" note in the
// channels that need one. Edit freely; `!setup content` posts anything that's
// missing, and `!setup refresh` re-renders the existing posts in place.

import { config } from "../config";
import { E, Emoji, emoji } from "../logic/emoji";
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

/** The rules post doubles as the door: reacting with this grants the role. */
export const rulesGate = { emoji: E.check, role: "member" } as const;

export const rolePanels: RolePanel[] = [
  {
    key: "interests",
    title: "🎯 Interests",
    blurb: "What are you into? Each one is pingable, so people can find a squad, a critique buddy or a movie night crew.",
    exclusive: false,
    options: [
      { emoji: emoji("video_game", "🎮"), role: "gamer" },
      { emoji: emoji("art", "🎨"), role: "creator" },
      { emoji: emoji("computer", "💻"), role: "techie" },
      { emoji: emoji("headphones", "🎧"), role: "music-lover" },
      { emoji: emoji("popcorn", "🍿"), role: "movie-buff" },
      { emoji: emoji("ramen", "🍜"), role: "foodie" },
    ],
  },
  {
    key: "pings",
    title: "🔔 Notifications",
    blurb: "Choose what you want to be pinged for. No pings unless you opt in.",
    exclusive: false,
    options: [
      { emoji: emoji("mega", "📣"), role: "ping-announcements" },
      { emoji: emoji("calendar", "📆"), role: "ping-events" },
      { emoji: emoji("sunny", "☀️"), role: "ping-qotd" },
    ],
  },
  {
    key: "pronouns",
    title: "💬 Pronouns",
    blurb: "Shown on your profile so everyone gets it right. Pick as many as apply.",
    exclusive: false,
    options: [
      { emoji: emoji("green_heart", "💚"), role: "pronoun-he" },
      { emoji: emoji("yellow_heart", "💛"), role: "pronoun-she" },
      { emoji: emoji("purple_heart", "💜"), role: "pronoun-they" },
      { emoji: emoji("white_heart", "🤍"), role: "pronoun-any" },
      { emoji: emoji("speech_balloon", "💬"), role: "pronoun-ask" },
    ],
  },
  {
    key: "colors",
    title: "🎨 Name color",
    blurb: "Pick one. Choosing a new color swaps out the old one; un-react to go back to default.",
    exclusive: true,
    options: [
      { emoji: emoji("red_circle", "🔴"), role: "color-ruby" },
      { emoji: emoji("large_orange_circle", "🟠"), role: "color-amber" },
      { emoji: emoji("large_yellow_circle", "🟡"), role: "color-citrine" },
      { emoji: emoji("large_green_circle", "🟢"), role: "color-jade" },
      { emoji: emoji("large_blue_circle", "🔵"), role: "color-sapphire" },
      { emoji: emoji("large_purple_circle", "🟣"), role: "color-amethyst" },
      { emoji: emoji("cherry_blossom", "🌸"), role: "color-rose" },
    ],
  },
];

export interface StarterPost {
  key: string;
  channel: string;
  pin: boolean;
  render(ctx: PostContext): string;
}

function levelLadder(ctx: PostContext): string {
  return config.levels.rewards.map((r) => `${ctx.role(r.role)} at level ${r.level}`).join(", ");
}

export const starterPosts: StarterPost[] = [
  {
    key: "welcome",
    channel: "welcome",
    pin: true,
    render: (ctx) =>
      [
        `🌱 **Welcome to ${ctx.community}!**`,
        "",
        "This is a friendly corner of the internet for hanging out, sharing what we love and making new friends. Whether you're here for games, art, tech, music or just good conversation, pull up a chair.",
        "",
        "**Get started in three steps**",
        ctx.gate
          ? `1️⃣ Read the ${ctx.channel("rules")} and react with ✅ to unlock the community`
          : `1️⃣ Read the ${ctx.channel("rules")} (the short version: be kind)`,
        `2️⃣ Pick your interests, pings, pronouns and name color in ${ctx.channel("roles")}`,
        `3️⃣ Say hi in ${ctx.channel("introductions")}. We'd love to meet you!`,
        "",
        "**Find your way around**",
        `💬 ${ctx.channel("general")}: the main hangout`,
        `🌞 ${ctx.channel("daily-question")}: a fresh question every day`,
        `🎮 **Interests**: gaming, art, tech, music, movies and food`,
        `🔊 **Voice**: drop into ${ctx.channel("lounge")} anytime, no invite needed`,
        `⭐ ${ctx.channel("hall-of-fame")}: the best messages, voted by you`,
        `💡 ${ctx.channel("suggestions")}: help shape this place`,
        "",
        `**Level up as you chat** 🌿 You'll earn ${levelLadder(ctx)}. Check your progress with \`${ctx.prefix}rank\` in ${ctx.channel("bot-commands")}.`,
        "",
        `Need anything? Ask in ${ctx.channel("help-desk")} or ping a ${ctx.role("moderator")}. Have fun! 💚`,
      ].join("\n"),
  },
  {
    key: "rules",
    channel: "rules",
    pin: true,
    render: (ctx) =>
      [
        `📜 **The ${ctx.community} rules**`,
        "",
        "**1. Be kind.** Treat everyone with respect. No harassment, hate speech, bullying or discrimination of any kind.",
        "**2. Keep it safe for everyone.** No NSFW, gore or shock content, anywhere.",
        "**3. No spam or self-promo.** No ads, invite links or unsolicited DMs. Ask the team first if you want to share something you made for sale.",
        "**4. Use the right channel.** Keep topics where they belong and mark spoilers.",
        "**5. Respect privacy.** Never share anyone's personal info, screenshots of private chats or photos without consent.",
        "**6. Disagree well.** Debate ideas, not people. If the team asks you to drop a topic, drop it.",
        "**7. Follow Root's Community Guidelines.** They apply here too.",
        `**8. The team has the final say.** If something feels off, ping a ${ctx.role("moderator")} or ask in ${ctx.channel("help-desk")}.`,
        "",
        ctx.gate
          ? "✅ **React with ✅ below to agree to the rules and unlock the rest of the community.**"
          : "✅ React with ✅ below to show you've read them. Thanks for helping keep this place great!",
      ].join("\n"),
  },
  {
    key: "roles-intro",
    channel: "roles",
    pin: false,
    render: (ctx) =>
      [
        "🎭 **Pick your roles**",
        "",
        "React to the messages below to add a role; remove your reaction to drop it. Roles show on your profile, unlock pings and let people find others who share their interests.",
        "",
        "_Tip: these roles are also self-assignable, so you can add them from your own profile card too._",
      ].join("\n"),
  },
  {
    key: "introductions",
    channel: "introductions",
    pin: true,
    render: (ctx) =>
      [
        "🙋 **Introduce yourself!** Copy this, fill in whatever you like, and post it:",
        "",
        "```",
        "Name / nickname:",
        "Pronouns:",
        "Where I'm from (as specific as you like):",
        "I'm into:",
        "Currently playing / reading / watching:",
        "Fun fact:",
        "```",
        "",
        `Then go say hi to someone else's intro. That's how friendships start 💚`,
      ].join("\n"),
  },
  {
    key: "daily-question",
    channel: "daily-question",
    pin: true,
    render: (ctx) =>
      [
        "🌞 **Question of the Day**",
        "",
        `Every day at ${String(config.daily.hourUtc).padStart(2, "0")}:00 UTC, ${ctx.botName} posts a new question here. Answer it, react to answers you love, and get to know everyone a little better.`,
        "",
        `Want a ping? Pick ${ctx.role("ping-qotd")} in ${ctx.channel("roles")}. Got a great question? Drop it in ${ctx.channel("suggestions")}!`,
      ].join("\n"),
  },
  {
    key: "hall-of-fame",
    channel: "hall-of-fame",
    pin: true,
    render: (ctx) =>
      [
        "⭐ **Hall of Fame**",
        "",
        `When a message gets ${config.starboard.threshold} ⭐ reactions (not counting the author's own), ${ctx.botName} brings it here, forever. Funny, wholesome, brilliant: you decide.`,
      ].join("\n"),
  },
  {
    key: "suggestions",
    channel: "suggestions",
    pin: true,
    render: (ctx) =>
      [
        "💡 **How suggestions work**",
        "",
        `Just type your idea in this channel (or use \`${ctx.prefix}suggest your idea\` anywhere). ${ctx.botName} turns it into a numbered suggestion with 👍 / 👎 votes.`,
        "",
        "The team reviews the popular ones and marks them ✅ approved, 🛠️ in progress, 🚀 done or ❌ declined. You'll get a notification when yours is updated.",
      ].join("\n"),
  },
  {
    key: "help-desk",
    channel: "help-desk",
    pin: true,
    render: (ctx) =>
      [
        "🆘 **Need a hand?**",
        "",
        `Ask anything about the community here: roles, channels, rules, events, or if something's wrong. The team will get back to you. For anything private or urgent, ping a ${ctx.role("moderator")}.`,
      ].join("\n"),
  },
  {
    key: "bot-commands",
    channel: "bot-commands",
    pin: true,
    render: (ctx) =>
      [
        `🤖 **Say hi to ${ctx.botName}!**`,
        "",
        `\`${ctx.prefix}help\` lists everything. Some favorites:`,
        `• \`${ctx.prefix}rank\` your level and XP · \`${ctx.prefix}top\` the leaderboard`,
        `• \`${ctx.prefix}birthday July 14\` get a shout-out on your day`,
        `• \`${ctx.prefix}poll Pizza or tacos? | Pizza | Tacos\` start a vote`,
        `• \`${ctx.prefix}8ball\`, \`${ctx.prefix}roll 2d6\`, \`${ctx.prefix}flip\`, \`${ctx.prefix}choose a | b\``,
      ].join("\n"),
  },
  {
    key: "events",
    channel: "events",
    pin: false,
    render: (ctx) =>
      [
        "📅 **Events live here**",
        "",
        `Game nights, watch parties, art jams, community calls... When something's happening, it's announced in this channel and hosted on the ${ctx.channel("stage")} or in ${ctx.channel("lounge")}.`,
        "",
        `Don't miss out: pick ${ctx.role("ping-events")} in ${ctx.channel("roles")}.`,
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
