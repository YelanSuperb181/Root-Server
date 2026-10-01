// ┌─────────────────────────────────────────────────────────────────────────┐
// │ THE COMMUNITY BLUEPRINT: Bich ass bitchess, moved over from Discord       │
// │                                                                           │
// │ Same categories and channels as the Discord server. Root channel names   │
// │ can only use letters, digits and hyphens, so each channel's emoji lives   │
// │ at the start of its description instead.                                  │
// │                                                                           │
// │ Edit this file, run `npm test` (it validates the blueprint), then         │
// │ `!setup` again. Setup only creates what's missing and never deletes or    │
// │ renames anything you already have.                                        │
// └─────────────────────────────────────────────────────────────────────────┘

import { CAN_POST, EVERYONE, READ_ONLY, SELF, rule } from "./permissions";
import { mailboxes } from "./mailboxes";
import type { Blueprint, RoleSpec } from "./types";

// Roles, highest first. Keys are what the code and config refer to; names are
// what everyone sees. "moderator" and "member" are the keys the bot relies on.
const roles: RoleSpec[] = [
  {
    key: "admin",
    name: "Admin",
    category: "staff",
    builtIn: true,
    description: "Root gives this role (full control) to whoever creates the community.",
    mentionable: false,
    selfAssignable: false,
  },
  {
    key: "moderator",
    name: "Bitchiest Bitch",
    color: "#F23F6F",
    category: "staff",
    description: "Top of the food chain: posts announcements, removes messages, kicks, bans and runs voice.",
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
    key: "member",
    name: "Bitches",
    color: "#B07CF0",
    category: "member",
    description: "Everyone. Wisp hands it out when someone joins.",
    mentionable: true,
    selfAssignable: false,
  },
  {
    key: "birthday",
    name: "Birthday Bitch",
    color: "#FF8FC7",
    category: "special",
    description: "Worn for 24 hours on your birthday (save yours with !birthday).",
    mentionable: false,
    selfAssignable: false,
  },
];

const staffPost = [rule(EVERYONE, READ_ONLY), rule("moderator", CAN_POST), rule(SELF, CAN_POST)];

export const blueprint: Blueprint = {
  roles,
  groups: [
    {
      key: "important",
      name: "Important!!!",
      description: "The stuff that matters (and the stuff that really doesn't).",
      membersOnly: false,
      channels: [
        { key: "announcements", name: "announcements", type: "text", topic: "‼️ Big news. Only the Bitchiest Bitch posts here.", access: staffPost },
        { key: "polls", name: "polls", type: "text", topic: "📊 Settle it democratically. Start one with !poll" },
        { key: "freakiest-freakstars", name: "freakiest-freakstars", type: "text", topic: "👅 Freakiest freakstars only." },
        { key: "jockie-music-status", name: "jockie-music-status", type: "text", topic: "🎵 What's playing." },
        { key: "dyno-status", name: "dyno-status", type: "text", topic: "🤖 Wisp's log: joins, leaves and anything auto-mod removed.", access: staffPost },
        { key: "birthdays", name: "birthdays", type: "text", topic: "🎂 Birthday shout-outs. Save yours with !birthday" },
        { key: "personality-types", name: "personality-types", type: "text", topic: "🧬 MBTI, enneagram, star signs, all of it." },
        { key: "quotes", name: "quotes", type: "text", topic: "🗣️ Things that should never have been said. React 🗣️ on any message to send it here." },
      ],
    },
    {
      key: "social",
      name: "Ze Social Place",
      description: "Where the yapping happens.",
      membersOnly: false,
      channels: [
        { key: "bitches-yapping", name: "bitches-yapping", type: "text", topic: "✨ The main chat." },
        { key: "games", name: "games", type: "text", topic: "🎮 Games, clips and who's getting on tonight." },
        { key: "fm-bot", name: "fm-bot", type: "text", topic: "🎶 Music stats and now playing." },
        { key: "bot-commands", name: "bot-commands", type: "text", topic: "💡 Talk to Wisp here: !help" },
        { key: "availability", name: "availability", type: "text", topic: "🗓️ Who's free, who's busy, who's asleep." },
      ],
    },
    {
      key: "mailing",
      name: "Bitch Mailing Service",
      description: "A mailbox channel for each of you, plus one for everyone. The mailboxes live in mailboxes.local.ts.",
      membersOnly: false,
      channels: [
        { key: "to-all-bitches", name: "to-all-bitches", type: "text", topic: "📬 Mail for everyone." },
        ...mailboxes,
      ],
    },
    {
      key: "minecraft",
      name: "Bitches Playing Minecraft",
      description: "Everything Minecraft and the Realm.",
      membersOnly: false,
      channels: [
        { key: "minecraft-chat", name: "minecraft-chat", type: "text", topic: "⛏️ Minecraft talk." },
        { key: "minecraft-pics", name: "minecraft-pics", type: "text", topic: "📷 Builds, views and crimes against architecture." },
        { key: "minecraft-coords", name: "minecraft-coords", type: "text", topic: "🗺️ Where everything is." },
        { key: "realm-finance", name: "realm-finance", type: "text", topic: "💸 Who's paying for the Realm this month." },
      ],
    },
    {
      key: "terraria",
      name: "Bitches Playing Terraria",
      description: "Everything Terraria.",
      membersOnly: false,
      channels: [
        { key: "yappity-yap", name: "yappity-yap", type: "text", topic: "🫧 Terraria talk." },
        { key: "terraria-info", name: "info", type: "text", topic: "😳 World info, seeds and boss progress." },
      ],
    },
    {
      key: "voices",
      name: "Yap... With Your Voices",
      description: "Voice and the music that goes with it.",
      membersOnly: false,
      channels: [
        { key: "music", name: "music", type: "text", topic: "💫 Song requests and what's on." },
        { key: "voice-chat", name: "bitches-endlessly-bitching", type: "voice", topic: "🌟 Bitches endlessly bitching." },
      ],
    },
    {
      key: "other",
      name: "Other",
      description: "Everything else.",
      membersOnly: false,
      channels: [
        { key: "the-vent-aka-hell", name: "the-vent-aka-hell", type: "text", topic: "👁️ Vent freely. Nothing here gets quoted or earns XP." },
      ],
    },
  ],
};
