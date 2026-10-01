// ┌─────────────────────────────────────────────────────────────────────────┐
// │ THE COMMUNITY BLUEPRINT                                                   │
// │                                                                           │
// │ Everything `!setup` builds lives here. Rename channels, add interests,   │
// │ recolor roles: edit this file, run `npm test` (it validates the          │
// │ blueprint), then `!setup` again. Setup only creates what's missing and    │
// │ never deletes or renames anything you already have.                       │
// └─────────────────────────────────────────────────────────────────────────┘

import { BOT_ACCESS, CAN_POST, CAN_SPEAK, EVERYONE, HIDE, LISTEN_ONLY, READ_ONLY, SELF, SHOW, rule } from "./permissions";
import type { Blueprint, RoleSpec } from "./types";

// Roles, highest first. Keys are what the code and config refer to.
const roles: RoleSpec[] = [
  // ── Staff ───────────────────────────────────────────────────────────────
  {
    key: "admin",
    name: "Admin",
    category: "staff",
    builtIn: true,
    description: "Runs the place. Root gives this role (full control) to the community's creator.",
    mentionable: false,
    selfAssignable: false,
  },
  {
    key: "moderator",
    name: "Moderator",
    color: "#2ED3A0",
    category: "staff",
    description: "Keeps things friendly: can remove messages, kick, ban and manage voice.",
    mentionable: true,
    selfAssignable: false,
    community: {
      communityKick: true,
      communityCreateBan: true,
      communityManageBans: true,
      communityChangeOtherNickname: true,
      communityManageAuditLog: true,
    },
    channel: {
      channelDeleteMessageOther: true,
      channelManagePinnedMessages: true,
      channelVoiceMuteOther: true,
      channelVoiceDeafenOther: true,
      channelVoiceKick: true,
      channelMoveUserOther: true,
    },
  },
  {
    key: "event-host",
    name: "Event Host",
    color: "#E879F9",
    category: "staff",
    description: "Runs game nights and watch parties: posts in #events and speaks on the Stage.",
    mentionable: true,
    selfAssignable: false,
    channel: {
      channelManagePinnedMessages: true,
      channelVoiceMuteOther: true,
      channelMoveUserOther: true,
    },
  },

  // ── Everyone who accepted the rules ────────────────────────────────────
  {
    key: "member",
    name: "Member",
    category: "member",
    description: "Given automatically when someone reacts ✅ to the rules. Unlocks the community.",
    mentionable: false,
    selfAssignable: false,
  },

  // ── Earned by chatting (see config.levels) ─────────────────────────────
  {
    key: "legend",
    name: "Legend",
    color: "#FFB800",
    category: "level",
    description: "Reached level 30. A pillar of the community.",
    mentionable: false,
    selfAssignable: false,
  },
  {
    key: "veteran",
    name: "Veteran",
    color: "#9B8AFB",
    category: "level",
    description: "Reached level 15. Been here, seen things.",
    mentionable: false,
    selfAssignable: false,
  },
  {
    key: "regular",
    name: "Regular",
    color: "#5EB1EF",
    category: "level",
    description: "Reached level 5. A familiar face.",
    mentionable: false,
    selfAssignable: false,
  },

  // ── Special ─────────────────────────────────────────────────────────────
  {
    key: "birthday",
    name: "Birthday Star",
    color: "#FF8FAB",
    category: "special",
    description: "Worn for 24 hours on your birthday (set it with !birthday).",
    mentionable: false,
    selfAssignable: false,
  },

  // ── Name colors (pick one in #roles) ────────────────────────────────────
  { key: "color-ruby", name: "Ruby", color: "#FF5C5C", category: "color", description: "Red name color.", mentionable: false, selfAssignable: true },
  { key: "color-amber", name: "Amber", color: "#FF9F43", category: "color", description: "Orange name color.", mentionable: false, selfAssignable: true },
  { key: "color-citrine", name: "Citrine", color: "#FFD93D", category: "color", description: "Yellow name color.", mentionable: false, selfAssignable: true },
  { key: "color-jade", name: "Jade", color: "#3DDC84", category: "color", description: "Green name color.", mentionable: false, selfAssignable: true },
  { key: "color-sapphire", name: "Sapphire", color: "#4C8DFF", category: "color", description: "Blue name color.", mentionable: false, selfAssignable: true },
  { key: "color-amethyst", name: "Amethyst", color: "#A66CFF", category: "color", description: "Purple name color.", mentionable: false, selfAssignable: true },
  { key: "color-rose", name: "Rose", color: "#FF7EC8", category: "color", description: "Pink name color.", mentionable: false, selfAssignable: true },

  // ── Interests (pingable, so "@Gamer anyone up for a match?" works) ──────
  { key: "gamer", name: "Gamer", category: "interest", description: "Games of every kind. Pinged for squads and game nights.", mentionable: true, selfAssignable: true },
  { key: "creator", name: "Creator", category: "interest", description: "Artists, writers, musicians and makers.", mentionable: true, selfAssignable: true },
  { key: "techie", name: "Techie", category: "interest", description: "Code, gadgets and builds.", mentionable: true, selfAssignable: true },
  { key: "music-lover", name: "Music Lover", category: "interest", description: "Always has a recommendation ready.", mentionable: true, selfAssignable: true },
  { key: "movie-buff", name: "Movie Buff", category: "interest", description: "Movies, series and anime.", mentionable: true, selfAssignable: true },
  { key: "foodie", name: "Foodie", category: "interest", description: "Cooks, bakers and snack critics.", mentionable: true, selfAssignable: true },

  // ── Notification pings (opt in) ─────────────────────────────────────────
  { key: "ping-announcements", name: "Announcements Ping", category: "ping", description: "Get pinged for important news.", mentionable: true, selfAssignable: true },
  { key: "ping-events", name: "Events Ping", category: "ping", description: "Get pinged when an event is announced.", mentionable: true, selfAssignable: true },
  { key: "ping-qotd", name: "Daily Question Ping", category: "ping", description: "Get pinged for the question of the day.", mentionable: true, selfAssignable: true },

  // ── Pronouns ────────────────────────────────────────────────────────────
  { key: "pronoun-he", name: "he/him", category: "pronoun", description: "Pronouns: he/him.", mentionable: false, selfAssignable: true },
  { key: "pronoun-she", name: "she/her", category: "pronoun", description: "Pronouns: she/her.", mentionable: false, selfAssignable: true },
  { key: "pronoun-they", name: "they/them", category: "pronoun", description: "Pronouns: they/them.", mentionable: false, selfAssignable: true },
  { key: "pronoun-any", name: "any pronouns", category: "pronoun", description: "Any pronouns are fine.", mentionable: false, selfAssignable: true },
  { key: "pronoun-ask", name: "ask my pronouns", category: "pronoun", description: "Ask before assuming.", mentionable: false, selfAssignable: true },
];

export const blueprint: Blueprint = {
  roles,
  groups: [
    {
      key: "start-here",
      name: "Start Here",
      description: "The front door: what this place is, the rules, news and events. Everyone can read it; only the team posts.",
      membersOnly: false,
      access: [rule(EVERYONE, READ_ONLY), rule("moderator", CAN_POST), rule(SELF, CAN_POST)],
      channels: [
        { key: "welcome", name: "welcome", type: "text", topic: "👋 New here? Start with this channel: it explains everything." },
        { key: "rules", name: "rules", type: "text", topic: "📜 The house rules. React ✅ on the rules post to unlock the community." },
        { key: "announcements", name: "announcements", type: "text", topic: "📣 News from the team. Pick the Announcements Ping role to be notified." },
        {
          key: "events",
          name: "events",
          type: "text",
          topic: "📅 Game nights, watch parties and community events. Pick the Events Ping role to be notified.",
          access: [rule("event-host", CAN_POST)],
        },
        {
          key: "roles",
          name: "roles",
          type: "text",
          topic: "🎭 Pick your pronouns, interests, pings and name color by reacting.",
          membersOnly: true,
        },
      ],
    },
    {
      key: "community",
      name: "Community",
      description: "Where most of the talking happens.",
      membersOnly: true,
      channels: [
        { key: "general", name: "general", type: "text", topic: "💬 The main hangout. Chat about anything." },
        { key: "introductions", name: "introductions", type: "text", topic: "🙋 New? Tell us about yourself! There's a template in the pins." },
        { key: "daily-question", name: "daily-question", type: "text", topic: "🌞 A new question every day. Answer it, then read everyone else's." },
        { key: "show-and-tell", name: "show-and-tell", type: "text", topic: "📸 Pets, photos, setups, wins and things you made." },
        { key: "memes", name: "memes", type: "text", topic: "😂 Memes, jokes and good vibes. Keep it kind." },
        { key: "celebrations", name: "celebrations", type: "text", topic: "🎉 Birthdays, level-ups and wins worth cheering for." },
        {
          key: "hall-of-fame",
          name: "hall-of-fame",
          type: "text",
          topic: "⭐ The best messages, voted by you. React ⭐ on any message to nominate it.",
          access: [rule(EVERYONE, READ_ONLY), rule(SELF, CAN_POST)],
        },
        { key: "bot-commands", name: "bot-commands", type: "text", topic: "🤖 Play with Sprout here: !help, !rank, !8ball and more." },
      ],
    },
    {
      key: "interests",
      name: "Interests",
      description: "One channel per hobby. Each has a matching pingable role in #roles.",
      membersOnly: true,
      channels: [
        { key: "gaming", name: "gaming", type: "text", topic: "🎮 What are you playing? Clips, LFG and hot takes. Ping @Gamer for a squad." },
        { key: "creative-corner", name: "creative-corner", type: "text", topic: "🎨 Art, writing, music and crafts. Share what you make and cheer each other on." },
        { key: "tech-talk", name: "tech-talk", type: "text", topic: "💻 Code, gadgets, setups and tech help." },
        { key: "music", name: "music", type: "text", topic: "🎧 Recs, playlists, concerts and the song stuck in your head." },
        { key: "movies-and-shows", name: "movies-and-shows", type: "text", topic: "🍿 Movies, series and anime. Please mark spoilers!" },
        { key: "food-and-drink", name: "food-and-drink", type: "text", topic: "🍜 Recipes, food pics and late-night snack debates." },
      ],
    },
    {
      key: "voice",
      name: "Voice",
      description: "Drop-in voice rooms. No invite needed: just join.",
      membersOnly: true,
      channels: [
        { key: "lounge", name: "lounge", type: "voice", topic: "🛋️ Drop in and hang out." },
        { key: "gaming-room", name: "gaming-room", type: "voice", topic: "🎮 Squad up and play together." },
        { key: "music-and-chill", name: "music-and-chill", type: "voice", topic: "🎶 Listen together, low-key vibes." },
        { key: "focus-room", name: "focus-room", type: "voice", topic: "📚 Co-working and study. Mics muted, cameras optional." },
        {
          key: "stage",
          name: "stage",
          type: "voice",
          topic: "🎤 Community events. Hosts speak, everyone else listens.",
          access: [rule(EVERYONE, LISTEN_ONLY), rule("event-host", CAN_SPEAK), rule("moderator", CAN_SPEAK)],
        },
      ],
    },
    {
      key: "feedback",
      name: "Feedback and Help",
      description: "Shape the community and get help from the team.",
      membersOnly: true,
      channels: [
        { key: "suggestions", name: "suggestions", type: "text", topic: "💡 Type an idea here and Sprout turns it into a vote." },
        { key: "help-desk", name: "help-desk", type: "text", topic: "🆘 Questions about the community? Ask here and the team will help." },
      ],
    },
    {
      key: "staff",
      name: "Staff",
      description: "Private to Moderators and Admins.",
      membersOnly: false,
      access: [rule(EVERYONE, HIDE), rule("moderator", SHOW), rule(SELF, BOT_ACCESS)],
      channels: [
        { key: "staff-chat", name: "staff-chat", type: "text", topic: "🛡️ Private chat for the team." },
        { key: "mod-log", name: "mod-log", type: "text", topic: "📋 Sprout's log: auto-mod actions, joins and leaves, setup reports." },
        { key: "staff-room", name: "staff-room", type: "voice", topic: "🔒 Private voice for the team." },
      ],
    },
  ],
};
