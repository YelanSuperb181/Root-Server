// Maps blueprint keys ("bitches-yapping", "moderator") to real Root IDs. IDs are
// saved when setup creates something, and anything built by hand (or by an
// imported Discord template) is matched by name, so features work either way
// and keep working after a channel or role is renamed in Root.

import {
  rootServer,
  ChannelGroupGuid,
  ChannelGuid,
  ChannelType,
  CommunityRoleGuid,
  WellKnownRootGuids,
} from "@rootsdk/server-app";
import { blueprint } from "../blueprint/layout";
import { ExistingChannel, ExistingState, planSetup, savedKey } from "../blueprint/plan";
import { channelMention, roleMention } from "../logic/text";
import { read } from "./api";
import { log } from "./log";
import { kv } from "./store";

const PREFIX = "bp:";

const ids = new Map<string, string>(); // "channel:general" -> id
const reverse = new Map<string, string>(); // id -> "channel:general"

function remember(key: string, id: string): void {
  const old = ids.get(key);
  if (old) reverse.delete(old);
  ids.set(key, id);
  reverse.set(id, key);
}

function channelTypeOf(type: number): ExistingChannel["type"] {
  if (type === ChannelType.Text || type === ChannelType.ThreadedText) return "text";
  if (type === ChannelType.Voice) return "voice";
  return "other";
}

/** Everything that exists in the community right now, for planning and matching. */
export async function fetchExistingState(): Promise<ExistingState> {
  const [groups, roles] = await Promise.all([
    read("channelGroups.list", () => rootServer.community.channelGroups.list()),
    read("communityRoles.list", () => rootServer.community.communityRoles.list()),
  ]);
  const withChannels = [];
  for (const g of groups) {
    const channels = await read("channels.list", () => rootServer.community.channels.list({ channelGroupId: g.id }));
    withChannels.push({
      id: g.id as string,
      name: g.name,
      channels: channels.map((c) => ({ id: c.id as string, name: c.name, type: channelTypeOf(c.channelType) })),
    });
  }
  return {
    roles: roles.map((r) => ({ id: r.id as string, name: r.name })),
    groups: withChannels,
    saved: Object.fromEntries(ids),
  };
}

export const directory = {
  /** Loads saved IDs, then matches anything else by name. Safe to call any time. */
  async sync(): Promise<void> {
    for (const { key, value } of await kv.entries<string>(PREFIX)) {
      remember(key.slice(PREFIX.length), value);
    }
    try {
      const plan = planSetup(blueprint, await fetchExistingState());
      const found: Array<[string, string]> = [];
      for (const step of plan.roles) if (step.action === "keep") found.push([savedKey("role", step.spec.key), step.id]);
      for (const g of plan.groups) {
        if (g.group.action === "keep") found.push([savedKey("group", g.group.spec.key), g.group.id]);
        for (const c of g.channels) if (c.action === "keep") found.push([savedKey("channel", c.spec.key), c.id]);
      }
      // Forget IDs whose role or channel is gone, then record what's there now.
      const foundKeys = new Set(found.map(([key]) => key));
      for (const key of [...ids.keys()]) {
        if (!foundKeys.has(key)) {
          ids.delete(key);
          await kv.delete(PREFIX + key);
        }
      }
      reverse.clear();
      for (const [key, id] of found) {
        if (ids.get(key) !== id) await kv.set(PREFIX + key, id);
        remember(key, id);
      }
    } catch (err) {
      log("warn", "directory sync failed; using saved IDs only", { error: String(err) });
    }
  },

  async save(key: string, id: string): Promise<void> {
    remember(key, id);
    await kv.set(PREFIX + key, id);
  },

  channelId(key: string): ChannelGuid | undefined {
    return ids.get(savedKey("channel", key)) as ChannelGuid | undefined;
  },

  groupId(key: string): ChannelGroupGuid | undefined {
    return ids.get(savedKey("group", key)) as ChannelGroupGuid | undefined;
  },

  roleId(key: string): CommunityRoleGuid | undefined {
    if (key === "@everyone") return WellKnownRootGuids.CommunityRoles.EveryoneRole;
    return ids.get(savedKey("role", key)) as CommunityRoleGuid | undefined;
  },

  /** Blueprint key of a channel ID, if it's one of ours. */
  channelKey(id: string): string | undefined {
    const key = reverse.get(id);
    return key?.startsWith("channel:") ? key.slice("channel:".length) : undefined;
  },

  /** Clickable channel link, or plain "#name" before setup has run. */
  channelMention(key: string): string {
    const name = blueprint.groups.flatMap((g) => g.channels).find((c) => c.key === key)?.name ?? key;
    const id = directory.channelId(key);
    return id ? channelMention(name, id) : `#${name}`;
  },

  roleName(key: string): string {
    return blueprint.roles.find((r) => r.key === key)?.name ?? key;
  },

  /** A role mention that pings, or the bold name if the role doesn't exist yet. */
  rolePing(key: string): string {
    const id = directory.roleId(key);
    return id ? roleMention(directory.roleName(key), id) : `**@${directory.roleName(key)}**`;
  },

  saved(): Record<string, string> {
    return Object.fromEntries(ids);
  },
};
