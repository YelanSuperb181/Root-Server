// ┌─────────────────────────────────────────────────────────────────────────┐
// │ SPROUT SETTINGS                                                           │
// │                                                                           │
// │ Channel and role values are blueprint keys (see blueprint/layout.ts),     │
// │ not display names, so renaming a channel in Root never breaks anything.   │
// │ `npm test` checks every key here exists in the blueprint.                 │
// └─────────────────────────────────────────────────────────────────────────┘

export const config = {
  /** What members type before commands: !help, !rank ... */
  prefix: "!",
  botName: "Sprout",

  onboarding: {
    /**
     * Members-only areas stay hidden until a new member reacts ✅ on the
     * rules post. Keeps drive-by spam bots out of your chats.
     */
    gate: true,
    /** Where new members get greeted (after accepting the rules when the gate is on). */
    greetIn: "general",
    /** Send new members a push notification pointing them at the rules. */
    notifyOnJoin: true,
  },

  levels: {
    enabled: true,
    /** XP per message, random in this range, at most once per cooldown. */
    minXp: 15,
    maxXp: 25,
    cooldownSeconds: 60,
    /** Where level-up messages go. Set to null to post in the channel where it happened. */
    announceIn: "celebrations" as string | null,
    /** Channels where chatting earns no XP. */
    noXpIn: ["bot-commands", "memes"],
    rewards: [
      { level: 5, role: "regular" },
      { level: 15, role: "veteran" },
      { level: 30, role: "legend" },
    ],
    /** false = members keep only their highest level role. */
    stackRewards: false,
  },

  starboard: {
    enabled: true,
    channel: "hall-of-fame",
    /** Unique ⭐ reactions (not counting the author's own) needed to get in. */
    threshold: 3,
    /** Channels whose messages can't be starred. */
    ignore: ["hall-of-fame", "staff-chat", "mod-log", "rules", "welcome"],
  },

  daily: {
    /** Hour (UTC, 0-23) for the daily question and birthday shout-outs. 16:00 UTC = 9am PT / 12pm ET / 6pm CEST. */
    hourUtc: 16,
  },

  questionOfTheDay: {
    enabled: true,
    channel: "daily-question",
    pingRole: "ping-qotd" as string | null,
  },

  birthdays: {
    enabled: true,
    channel: "celebrations",
    role: "birthday" as string | null,
  },

  suggestions: {
    enabled: true,
    channel: "suggestions",
  },

  automod: {
    enabled: true,
    /** User + role mentions allowed in one message. */
    maxMentions: 5,
    /** More than `messages` messages within `seconds` counts as flooding. */
    spam: { messages: 6, seconds: 8 },
    /** The same text `count` times within `seconds` counts as spam. */
    duplicates: { count: 3, seconds: 30 },
    /** Delete invite links to other Discord/Telegram/WhatsApp groups. */
    blockInviteLinks: true,
    /**
     * Words to delete on sight. Whole-word, case-insensitive; end with * to
     * match any ending ("scam*"). Add your own list here.
     */
    blockedWords: [] as string[],
    /** Strikes within this many minutes alert the team in the mod log. */
    strikeWindowMinutes: 10,
    strikesToAlert: 3,
    /** Channels auto-mod leaves alone. */
    ignore: ["staff-chat", "mod-log"],
  },

  modLog: {
    channel: "mod-log",
    joinsAndLeaves: true,
  },

  /** Where `!announce` and `!event` post, and who they ping. */
  announcements: { channel: "announcements", pingRole: "ping-announcements" as string | null },
  events: { channel: "events", pingRole: "ping-events" as string | null },
} as const;

export type Config = typeof config;
