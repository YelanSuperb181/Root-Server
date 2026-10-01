// ┌─────────────────────────────────────────────────────────────────────────┐
// │ WISP SETTINGS                                                             │
// │                                                                           │
// │ Channel and role values are blueprint keys (see blueprint/layout.ts),     │
// │ not display names, so renaming a channel in Root never breaks anything.   │
// │ `npm test` checks every key here exists in the blueprint.                 │
// └─────────────────────────────────────────────────────────────────────────┘

export const config = {
  /** What people type before commands: !help, !rank ... */
  prefix: "!",
  botName: "Wisp",

  onboarding: {
    /**
     * The "react ✅ on the rules to get in" gate. Off: this is a friend group,
     * not a public server, so everyone sees everything right away.
     */
    gate: false,
    /** Where newcomers get welcomed. */
    greetIn: "bitches-yapping",
    /** Push notification pointing new members at the rules (gate only). */
    notifyOnJoin: false,
    /** Role every new member gets automatically, or null. */
    autoRole: "member" as string | null,
  },

  levels: {
    enabled: true,
    /** XP per message, random in this range, at most once per cooldown. */
    minXp: 15,
    maxXp: 25,
    cooldownSeconds: 60,
    /** Where level-up messages go. null = the channel where it happened. */
    announceIn: "bot-commands" as string | null,
    /** Channels where chatting earns no XP. */
    noXpIn: ["bot-commands", "the-vent-aka-hell", "dyno-status"],
    /** Roles handed out at levels, e.g. { level: 10, role: "some-role-key" }. None yet. */
    rewards: [] as Array<{ level: number; role: string }>,
    /** false = members keep only their highest level role. */
    stackRewards: false,
  },

  /** The quote board: react with the emoji and the message is saved in #quotes. */
  starboard: {
    enabled: true,
    channel: "quotes",
    emoji: { code: "speaking_head_in_silhouette", glyph: "🗣️" },
    /** Reactions from people other than the author needed to save a message. */
    threshold: 2,
    /** Channels whose messages can't be quoted. */
    ignore: ["quotes", "the-vent-aka-hell", "dyno-status", "announcements"],
  },

  daily: {
    /** Hour (UTC, 0-23) for birthday shout-outs. 16:00 UTC = 9am PT / 12pm ET. */
    hourUtc: 16,
  },

  /** A daily conversation starter. Off: there's no channel for it in this server. */
  questionOfTheDay: {
    enabled: false,
    channel: null as string | null,
    pingRole: null as string | null,
  },

  birthdays: {
    enabled: true,
    channel: "birthdays",
    role: "birthday" as string | null,
  },

  /** Idea voting. Off: there's no suggestions channel in this server. */
  suggestions: {
    enabled: false,
    channel: null as string | null,
  },

  automod: {
    enabled: true,
    /** User + role mentions allowed in one message. */
    maxMentions: 8,
    /** More than `messages` messages within `seconds` counts as flooding. */
    spam: { messages: 7, seconds: 8 },
    /** The same text `count` times within `seconds` counts as spam. */
    duplicates: { count: 4, seconds: 30 },
    /** Delete invite links to other Discord/Telegram/WhatsApp groups. Off: you're still moving people over. */
    blockInviteLinks: false,
    /**
     * Words to delete on sight. Whole-word, case-insensitive; end with * to
     * match any ending ("scam*").
     */
    blockedWords: [] as string[],
    /** Strikes within this many minutes alert the team in the log. */
    strikeWindowMinutes: 10,
    strikesToAlert: 3,
    /** Channels auto-mod leaves alone. */
    ignore: ["dyno-status"],
  },

  /**
   * Wisp's brain: Claude reads what people say to Wisp and decides how Wisp
   * feels, what it does and what it says back. Needs an Anthropic API key in
   * Wisp's App settings in Root (or ANTHROPIC_API_KEY in server/.env while
   * developing). Without a key, or if Claude can't be reached, Wisp falls
   * back to reading moods from keywords.
   */
  brain: {
    enabled: true,
    model: "claude-opus-5-5",
    /** How hard Claude thinks before answering. "low" keeps chat snappy. */
    effort: "low" as "low" | "medium" | "high",
    /** Give up and use keywords after this long. */
    timeoutSeconds: 20,
    /** At most this many answers an hour, across the whole community; keywords after that. */
    maxPerHour: 200,
    /** Recent messages in the channel Wisp reads along with the one for it (0 = just that one). */
    contextMessages: 12,
    /** Exchanges with Wisp it remembers per channel. Memory lives only while Wisp runs. */
    memory: 6,
    /** At most one chat reply per channel this often. */
    replyCooldownSeconds: 3,
    /** Channels whose messages are never sent to Claude. Wisp answers there with keywords only. */
    skipIn: ["the-vent-aka-hell"],
  },

  /** Wisp's domain, and how Wisp answers people who talk to it in chat. */
  domain: {
    /** React when a message says "wisp", @mentions Wisp or replies to one of its messages. */
    listen: true,
    /**
     * Without the brain: also answer in chat with a little canned line
     * ("hii!! *hops happily*"), at most once per channel this often.
     */
    replyInChat: true,
    replyCooldownSeconds: 25,
    /** Channels whose messages never show up in the domain. Wisp still reacts to them in chat. */
    quietIn: ["the-vent-aka-hell"],
  },

  modLog: {
    /** Dyno doesn't exist on Root, so Wisp takes over its status channel. */
    channel: "dyno-status",
    joinsAndLeaves: true,
  },

  /** Where `!announce` and `!event` post, and who they ping. */
  announcements: { channel: "announcements", pingRole: null as string | null },
  events: { channel: "announcements", pingRole: null as string | null },
} as const;

export type Config = typeof config;
