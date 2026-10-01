// Decides what `!setup` has to do: which blueprint roles, groups and channels
// already exist (matched by the ID saved last time, or else by name) and
// which need creating. Pure, so it's tested without Root.

import { sameName } from "../logic/text";
import type { Blueprint, ChannelSpec, GroupSpec, RoleSpec } from "./types";

export interface ExistingRole {
  id: string;
  name: string;
}

export interface ExistingChannel {
  id: string;
  name: string;
  type: "text" | "voice" | "other";
}

export interface ExistingGroup {
  id: string;
  name: string;
  channels: ExistingChannel[];
}

export interface ExistingState {
  roles: ExistingRole[];
  groups: ExistingGroup[];
  /** IDs saved by earlier runs: "role:<key>", "group:<key>", "channel:<key>". */
  saved: Readonly<Record<string, string>>;
}

export type Step<T> =
  | { spec: T; action: "keep"; id: string; matchedBy: "saved" | "name" }
  | { spec: T; action: "create" }
  /** A built-in role we couldn't find; it can't be created, only reported. */
  | { spec: T; action: "missing" };

export type ChannelStep = Step<ChannelSpec> & {
  /** For a kept channel: the group it's in now, and whether setup must move it into its blueprint group. */
  currentGroupId?: string;
  needsMove?: boolean;
};

export interface GroupStep {
  group: Step<GroupSpec>;
  channels: ChannelStep[];
}

export interface SetupPlan {
  roles: Step<RoleSpec>[];
  groups: GroupStep[];
  /** Existing groups and channels the blueprint doesn't mention. Setup leaves them alone. */
  leftovers: { groups: ExistingGroup[]; channels: ExistingChannel[] };
}

export function savedKey(kind: "role" | "group" | "channel", key: string): string {
  return `${kind}:${key}`;
}

interface Found {
  id: string;
  matchedBy: "saved" | "name";
}

type Named = { id: string; name: string };

/**
 * Matching runs in passes: every saved ID is claimed before any name is
 * compared, so a renamed channel is never taken by a different spec that
 * happens to share its new name. Each existing item is claimed at most once.
 */
export function planSetup(bp: Blueprint, existing: ExistingState): SetupPlan {
  const claimed = new Set<string>();
  const take = (id: string, matchedBy: Found["matchedBy"]): Found => {
    claimed.add(id);
    return { id, matchedBy };
  };
  const bySaved = (savedId: string | undefined, candidates: readonly Named[]): Found | undefined =>
    savedId && !claimed.has(savedId) && candidates.some((c) => c.id === savedId) ? take(savedId, "saved") : undefined;
  const byName = (name: string, candidates: readonly Named[]): Found | undefined => {
    const hit = candidates.find((c) => !claimed.has(c.id) && sameName(c.name, name));
    return hit ? take(hit.id, "name") : undefined;
  };
  const keep = <T>(spec: T, found: Found): Step<T> => ({ spec, action: "keep", ...found });

  // Roles
  const roleFound = bp.roles.map((r) => bySaved(existing.saved[savedKey("role", r.key)], existing.roles));
  bp.roles.forEach((r, i) => (roleFound[i] ??= byName(r.name, existing.roles)));
  const roles = bp.roles.map((spec, i): Step<RoleSpec> => {
    const found = roleFound[i];
    if (found) return keep(spec, found);
    return spec.builtIn ? { spec, action: "missing" } : { spec, action: "create" };
  });

  // Groups
  const groupFound = bp.groups.map((g) => bySaved(existing.saved[savedKey("group", g.key)], existing.groups));
  bp.groups.forEach((g, i) => (groupFound[i] ??= byName(g.name, existing.groups)));

  // Channels: saved ID anywhere, then name inside the matched group, then name anywhere.
  const allChannels = existing.groups.flatMap((g) => g.channels);
  const groupOfChannel = new Map<string, string>();
  for (const g of existing.groups) for (const c of g.channels) groupOfChannel.set(c.id, g.id);
  const ofType = (list: readonly ExistingChannel[], type: ChannelSpec["type"]) => list.filter((c) => c.type === type);

  const specs = bp.groups.flatMap((g, gi) => g.channels.map((spec) => ({ spec, gi })));
  const channelFound = specs.map(({ spec }) => bySaved(existing.saved[savedKey("channel", spec.key)], ofType(allChannels, spec.type)));
  specs.forEach(({ spec, gi }, i) => {
    const inGroup = existing.groups.find((g) => g.id === groupFound[gi]?.id)?.channels ?? [];
    channelFound[i] ??= byName(spec.name, ofType(inGroup, spec.type));
  });
  specs.forEach(({ spec }, i) => (channelFound[i] ??= byName(spec.name, ofType(allChannels, spec.type))));

  const groups: GroupStep[] = bp.groups.map((spec, gi) => {
    const found = groupFound[gi];
    const group: Step<GroupSpec> = found ? keep(spec, found) : { spec, action: "create" };
    const channels = specs.flatMap((s, i): ChannelStep[] => {
      if (s.gi !== gi) return [];
      const hit = channelFound[i];
      if (!hit) return [{ spec: s.spec, action: "create" }];
      const currentGroupId = groupOfChannel.get(hit.id);
      return [{ ...keep(s.spec, hit), currentGroupId, needsMove: currentGroupId !== found?.id }];
    });
    return { group, channels };
  });

  const leftovers = {
    groups: existing.groups.filter((g) => !claimed.has(g.id)),
    channels: allChannels.filter((c) => !claimed.has(c.id)),
  };
  return { roles, groups, leftovers };
}

export interface PlanCounts {
  create: { roles: number; groups: number; channels: number };
  keep: { roles: number; groups: number; channels: number };
  /** Kept channels that will be moved into their blueprint group. */
  moves: number;
  missing: string[];
}

export function countPlan(plan: SetupPlan): PlanCounts {
  const channels = plan.groups.flatMap((g) => g.channels);
  return {
    create: {
      roles: plan.roles.filter((s) => s.action === "create").length,
      groups: plan.groups.filter((g) => g.group.action === "create").length,
      channels: channels.filter((s) => s.action === "create").length,
    },
    keep: {
      roles: plan.roles.filter((s) => s.action === "keep").length,
      groups: plan.groups.filter((g) => g.group.action === "keep").length,
      channels: channels.filter((s) => s.action === "keep").length,
    },
    moves: channels.filter((s) => s.needsMove).length,
    missing: plan.roles.filter((s) => s.action === "missing").map((s) => s.spec.name),
  };
}
