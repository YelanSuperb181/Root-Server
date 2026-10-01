// Works out the access rules each group and channel should get, given
// whether the onboarding gate is on. Pure; setup and the docs both use it.

import { BOT_ACCESS, EVERYONE, HIDE, SELF, SHOW, mergeRules, rule } from "./permissions";
import type { AccessRuleSpec, ChannelSpec, GroupSpec } from "./types";

/** Hide from everyone, show to members, staff and the bot. */
export const GATE_RULES: readonly AccessRuleSpec[] = [
  rule(EVERYONE, HIDE),
  rule("member", SHOW),
  rule("moderator", SHOW),
  rule(SELF, BOT_ACCESS),
];

export function groupRules(group: GroupSpec, gate: boolean): AccessRuleSpec[] {
  return mergeRules(gate && group.membersOnly ? GATE_RULES : undefined, group.access);
}

export interface ChannelRules {
  /** true: the channel shares its group's permissions and gets no rules of its own. */
  inherit: boolean;
  rules: AccessRuleSpec[];
}

export function channelRules(group: GroupSpec, channel: ChannelSpec, gate: boolean): ChannelRules {
  const ownGate = gate && channel.membersOnly === true && !group.membersOnly;
  if (!channel.access && !ownGate) return { inherit: true, rules: [] };
  // Root ignores a channel's rules while it shares its group's permissions,
  // so a channel with its own rules restates the group's rules first.
  return {
    inherit: false,
    rules: mergeRules(groupRules(group, gate), ownGate ? GATE_RULES : undefined, channel.access),
  };
}
