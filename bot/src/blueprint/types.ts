// The shape of a community blueprint. A blueprint is plain data: roles,
// channel groups and channels, plus who can see and do what. `!setup` turns
// it into the real community; docs/SERVER-LAYOUT.md is generated from it.

import type { ChannelOverlayPermission, ChannelPermission, CommunityPermission } from "@rootsdk/server-bot";

/**
 * Who an access rule applies to:
 * - "@everyone": every member (Root's EVERYONE role)
 * - "@self": this bot, so it can always see the channels it manages
 * - any other string: the `key` of a role in the blueprint
 */
export type Subject = string;

export interface AccessRuleSpec {
  subject: Subject;
  /** true = allow, false = deny, missing = inherit. */
  overlay: ChannelOverlayPermission;
}

export type RoleCategory = "staff" | "member" | "level" | "special" | "interest" | "ping" | "pronoun" | "color";

export interface RoleSpec {
  /** Stable identifier used by code and config. Never shown to members. */
  key: string;
  /** Display name in Root. */
  name: string;
  /** "#RRGGBB"; leave out to use Root's default role color. */
  color?: string;
  category: RoleCategory;
  /** One sentence for the docs and the !roles overview. */
  description: string;
  mentionable: boolean;
  /** Members can add/remove it themselves from their profile card. */
  selfAssignable: boolean;
  community?: Partial<CommunityPermission>;
  channel?: Partial<ChannelPermission>;
  /** Root creates this role in every community; setup only maps it, never creates it. */
  builtIn?: boolean;
}

export interface ChannelSpec {
  key: string;
  /** Lower-case letters, digits and hyphens only (a Root rule). */
  name: string;
  type: "text" | "voice";
  topic: string;
  /** Hidden until the rules are accepted, even inside a public group. */
  membersOnly?: boolean;
  /**
   * Rules for this channel on top of its group's rules. A channel with rules
   * stops sharing its group's permissions (Root ignores rules otherwise).
   */
  access?: AccessRuleSpec[];
}

export interface GroupSpec {
  key: string;
  name: string;
  description: string;
  /** Hidden until a member accepts the rules (when onboarding.gate is on). */
  membersOnly: boolean;
  access?: AccessRuleSpec[];
  channels: ChannelSpec[];
}

export interface Blueprint {
  roles: RoleSpec[];
  groups: GroupSpec[];
}
