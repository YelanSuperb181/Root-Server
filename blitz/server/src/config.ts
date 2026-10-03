// ┌─────────────────────────────────────────────────────────────────────────┐
// │ BLITZ'S DEFAULTS                                                          │
// │                                                                           │
// │ The same in every community. What differs per community (channels, roles, │
// │ staff, which features are on) is picked by its admins on Blitz's App      │
// │ settings page in Root; see core/settings.ts and root-manifest.json.       │
// └─────────────────────────────────────────────────────────────────────────┘

export const config = {
  /** What people type before commands: !help, !rank ... */
  prefix: "!",
  botName: "Blitz",

  levels: {
    /** XP per message, random in this range, at most once per cooldown. */
    minXp: 15,
    maxXp: 25,
    cooldownSeconds: 60,
  },

  /** The quote wall's reaction. */
  starboard: {
    emoji: { code: "speaking_head_in_silhouette", glyph: "🗣️" },
  },

  daily: {
    /** Hour (UTC, 0-23) for birthday shout-outs. 16:00 UTC = 9am PT / 12pm ET. */
    hourUtc: 16,
  },

  automod: {
    /** User + role mentions allowed in one message. */
    maxMentions: 8,
    /** More than `messages` messages within `seconds` counts as flooding. */
    spam: { messages: 7, seconds: 8 },
    /** The same text `count` times within `seconds` counts as spam. */
    duplicates: { count: 4, seconds: 30 },
    /** Delete invite links to Discord/Telegram/WhatsApp groups. */
    blockInviteLinks: false,
    /**
     * Words to delete on sight. Whole-word, case-insensitive; end with * to
     * match any ending ("scam*").
     */
    blockedWords: [] as string[],
    /** Strikes within this many minutes alert the staff in the log. */
    strikeWindowMinutes: 10,
    strikesToAlert: 3,
  },

  /**
   * Blitz's brain: Claude reads what people say to Blitz and decides how Blitz
   * feels, what it does and what it says back. Needs an Anthropic API key in
   * Blitz's App settings in Root (or ANTHROPIC_API_KEY in server/.env while
   * developing). Without a key, or if Claude can't be reached, Blitz falls
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
    /** Recent messages in the channel Blitz reads along with the one for it (0 = just that one). */
    contextMessages: 12,
    /** Exchanges with Blitz it remembers per channel. Memory lives only while Blitz runs. */
    memory: 6,
    /** At most one chat reply per channel this often. */
    replyCooldownSeconds: 3,
  },

  /** Blitz's domain, and how Blitz answers people who talk to it in chat. */
  domain: {
    /** React when a message says "blitz", @mentions Blitz or replies to one of its messages. */
    listen: true,
    /**
     * Without the brain: also answer in chat with a little canned line
     * ("hii!! *hops happily*"), at most once per channel this often.
     */
    replyInChat: true,
    replyCooldownSeconds: 25,
  },
} as const;

