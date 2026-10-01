// Catches blueprint and config mistakes before they reach Root: typos in
// keys, invalid channel names, duplicate names, missing roles. `npm test`
// runs this, and `!setup` refuses to run if it finds problems.

import { config } from "../config";
import { MAX_TOPIC, sanitizeChannelName } from "../logic/text";
import { PostContext, renderPanel, rolePanels, rulesGate, starterPosts } from "./content";
import { EVERYONE, SELF } from "./permissions";
import type { AccessRuleSpec, Blueprint } from "./types";

const COLOR = /^#[0-9A-Fa-f]{6}$/;
/** Roles the bot's own logic depends on. */
const REQUIRED_ROLES = ["member", "moderator"];
const KNOWN_BUILT_IN = ["admin"];

export function validateBlueprint(bp: Blueprint): string[] {
  const problems: string[] = [];
  const roleKeys = new Set<string>();
  const roleNames = new Set<string>();
  const channelKeys = new Set<string>();
  const channelNames = new Set<string>();
  const groupKeys = new Set<string>();
  const groupNames = new Set<string>();

  for (const role of bp.roles) {
    if (roleKeys.has(role.key)) problems.push(`Role key "${role.key}" is used twice.`);
    roleKeys.add(role.key);
    const lower = role.name.trim().toLowerCase();
    if (!lower) problems.push(`Role "${role.key}" has no name.`);
    if (roleNames.has(lower)) problems.push(`Two roles are named "${role.name}".`);
    roleNames.add(lower);
    if (role.color !== undefined && !COLOR.test(role.color)) problems.push(`Role "${role.key}" color "${role.color}" must look like #RRGGBB.`);
    if (role.builtIn && !KNOWN_BUILT_IN.includes(role.key)) problems.push(`Role "${role.key}" is marked builtIn, but Root only creates: ${KNOWN_BUILT_IN.join(", ")}.`);
  }
  for (const key of REQUIRED_ROLES) {
    if (!roleKeys.has(key)) problems.push(`The blueprint needs a role with key "${key}".`);
  }

  const checkRules = (where: string, rules: readonly AccessRuleSpec[] | undefined) => {
    for (const r of rules ?? []) {
      if (r.subject !== EVERYONE && r.subject !== SELF && !roleKeys.has(r.subject)) {
        problems.push(`${where}: access rule for unknown role "${r.subject}".`);
      }
      if (Object.keys(r.overlay).length === 0) problems.push(`${where}: access rule for "${r.subject}" changes nothing.`);
    }
  };

  for (const group of bp.groups) {
    if (groupKeys.has(group.key)) problems.push(`Group key "${group.key}" is used twice.`);
    groupKeys.add(group.key);
    const lower = group.name.trim().toLowerCase();
    if (!lower) problems.push(`Group "${group.key}" has no name.`);
    if (groupNames.has(lower)) problems.push(`Two groups are named "${group.name}".`);
    groupNames.add(lower);
    checkRules(`Group "${group.key}"`, group.access);
    if (group.channels.length === 0) problems.push(`Group "${group.key}" has no channels.`);

    for (const channel of group.channels) {
      if (channelKeys.has(channel.key)) problems.push(`Channel key "${channel.key}" is used twice.`);
      channelKeys.add(channel.key);
      if (sanitizeChannelName(channel.name) !== channel.name) {
        problems.push(`Channel name "${channel.name}" isn't allowed: Root channel names are letters, digits and single hyphens.`);
      }
      if (channel.name.length > 100) problems.push(`Channel name "${channel.name}" is longer than 100 characters.`);
      if (channelNames.has(channel.name.toLowerCase())) problems.push(`Two channels are named "${channel.name}".`);
      channelNames.add(channel.name.toLowerCase());
      if (channel.topic.length > MAX_TOPIC) problems.push(`Channel "${channel.key}" topic is over ${MAX_TOPIC} characters.`);
      checkRules(`Channel "${channel.key}"`, channel.access);
    }
  }
  return problems;
}

/** Checks config.ts and content.ts only point at things the blueprint has. */
export function validateReferences(bp: Blueprint): string[] {
  const problems: string[] = [];
  const roles = new Map(bp.roles.map((r) => [r.key, r]));
  const channels = new Map(bp.groups.flatMap((g) => g.channels).map((c) => [c.key, c]));

  const needChannel = (where: string, key: string | null, type: "text" | "voice" = "text") => {
    if (key === null) return;
    const channel = channels.get(key);
    if (!channel) problems.push(`${where} points at channel "${key}", which isn't in the blueprint.`);
    else if (channel.type !== type) problems.push(`${where} needs a ${type} channel, but "${key}" is ${channel.type}.`);
  };
  const needRole = (where: string, key: string | null) => {
    if (key !== null && !roles.has(key)) problems.push(`${where} points at role "${key}", which isn't in the blueprint.`);
  };

  needChannel("config.onboarding.greetIn", config.onboarding.greetIn);
  needChannel("config.levels.announceIn", config.levels.announceIn);
  config.levels.noXpIn.forEach((k) => needChannel("config.levels.noXpIn", k));
  needChannel("config.starboard.channel", config.starboard.channel);
  config.starboard.ignore.forEach((k) => needChannel("config.starboard.ignore", k));
  needChannel("config.questionOfTheDay.channel", config.questionOfTheDay.channel);
  needRole("config.questionOfTheDay.pingRole", config.questionOfTheDay.pingRole);
  needChannel("config.birthdays.channel", config.birthdays.channel);
  needRole("config.birthdays.role", config.birthdays.role);
  needChannel("config.suggestions.channel", config.suggestions.channel);
  config.automod.ignore.forEach((k) => needChannel("config.automod.ignore", k));
  needChannel("config.modLog.channel", config.modLog.channel);
  needChannel("config.announcements.channel", config.announcements.channel);
  needRole("config.announcements.pingRole", config.announcements.pingRole);
  needChannel("config.events.channel", config.events.channel);
  needRole("config.events.pingRole", config.events.pingRole);

  const levels = config.levels.rewards.map((r) => r.level);
  if (new Set(levels).size !== levels.length) problems.push("config.levels.rewards has two rewards for the same level.");
  for (const reward of config.levels.rewards) {
    needRole(`config.levels.rewards (level ${reward.level})`, reward.role);
    if (reward.level < 1) problems.push(`config.levels.rewards: level ${reward.level} must be 1 or more.`);
  }
  if (config.levels.minXp > config.levels.maxXp) problems.push("config.levels.minXp is bigger than maxXp.");
  if (config.daily.hourUtc < 0 || config.daily.hourUtc > 23) problems.push("config.daily.hourUtc must be 0-23.");
  if (config.starboard.threshold < 1) problems.push("config.starboard.threshold must be 1 or more.");

  needRole("rulesGate.role", rulesGate.role);
  for (const panel of rolePanels) {
    const codes = new Set<string>();
    for (const option of panel.options) {
      needRole(`Role panel "${panel.key}"`, option.role);
      if (codes.has(option.emoji.code)) problems.push(`Role panel "${panel.key}" uses ${option.emoji.glyph} twice.`);
      codes.add(option.emoji.code);
      const role = roles.get(option.role);
      if (role && (role.category === "staff" || role.category === "member")) {
        problems.push(`Role panel "${panel.key}" offers "${option.role}", a ${role.category} role. Members must not be able to give themselves that.`);
      }
    }
    if (panel.options.length > 20) problems.push(`Role panel "${panel.key}" has more than 20 options.`);
    if (renderPanel(panel).length > 4000) problems.push(`Role panel "${panel.key}" is too long.`);
  }

  // Render every post with a context that records which keys it asks for.
  const postKeys = new Set<string>();
  for (const post of starterPosts) {
    if (postKeys.has(post.key)) problems.push(`Starter post key "${post.key}" is used twice.`);
    postKeys.add(post.key);
    needChannel(`Starter post "${post.key}"`, post.channel);
    const ctx: PostContext = {
      community: "Test",
      prefix: config.prefix,
      botName: config.botName,
      gate: config.onboarding.gate,
      channel: (key) => {
        if (!channels.has(key)) problems.push(`Starter post "${post.key}" mentions unknown channel "${key}".`);
        return `#${key}`;
      },
      role: (key) => {
        needRole(`Starter post "${post.key}"`, key);
        return `**${key}**`;
      },
    };
    if (post.render(ctx).length > 4000) problems.push(`Starter post "${post.key}" is over 4000 characters.`);
  }
  return problems;
}

export function validateAll(bp: Blueprint): string[] {
  return [...validateBlueprint(bp), ...validateReferences(bp)];
}
