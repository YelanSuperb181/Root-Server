// What's actually in the community: its channel groups and channels, as
// Root reports them. Blitz adapts to whatever is there.

import { rootServer, ChannelType } from "@rootsdk/server-app";
import { read } from "./api";
import { isPerson } from "./members";

export interface CommunityChannel {
  id: string;
  name: string;
  /** Text channels are the ones Blitz can chat in. */
  type: "text" | "voice" | "other";
  description?: string;
  group: string;
}

function typeOf(type: number): CommunityChannel["type"] {
  if (type === ChannelType.Text || type === ChannelType.ThreadedText) return "text";
  if (type === ChannelType.Voice) return "voice";
  return "other";
}

/** Every channel Blitz can see, group by group. */
export async function listChannels(): Promise<CommunityChannel[]> {
  const groups = await read("channelGroups.list", () => rootServer.community.channelGroups.list());
  const out: CommunityChannel[] = [];
  for (const g of groups) {
    const channels = await read("channels.list", () => rootServer.community.channels.list({ channelGroupId: g.id }));
    for (const c of channels) {
      out.push({ id: c.id as string, name: c.name, type: typeOf(c.channelType), description: c.description || undefined, group: g.name });
    }
  }
  return out;
}

let nameCache: { at: number; name: string } | undefined;

/** The community's name (cached for a few minutes), for notifications. */
export async function communityName(): Promise<string> {
  if (nameCache && Date.now() - nameCache.at < 10 * 60_000) return nameCache.name;
  try {
    const name = (await read("communities.get", () => rootServer.community.communities.get())).name || "the community";
    nameCache = { at: Date.now(), name };
    return name;
  } catch {
    return nameCache?.name ?? "the community";
  }
}

/** How long the member and channel lists are reused (they're asked for often and change rarely). */
const LIST_TTL_MS = 60_000;
let members: { at: number; list: Array<{ userId: string; name: string }> } | undefined;
let texts: { at: number; list: Array<{ id: string; name: string; group: string }> } | undefined;

/** Everyone in the community, with their nicknames (cached for a minute). */
export async function allMembers(): Promise<Array<{ userId: string; name: string }>> {
  if (!members || Date.now() - members.at > LIST_TTL_MS) {
    const all = await read("communityMembers.listAll", () => rootServer.community.communityMembers.listAll());
    members = { at: Date.now(), list: all.filter((m) => isPerson(m.userId)).map((m) => ({ userId: m.userId, name: m.nickname || "someone" })) };
  }
  return members.list;
}

/** The text channels (cached for a minute). */
export async function textChannels(): Promise<Array<{ id: string; name: string; group: string }>> {
  if (!texts || Date.now() - texts.at > LIST_TTL_MS) {
    texts = { at: Date.now(), list: (await listChannels()).filter((c) => c.type === "text").map((c) => ({ id: c.id, name: c.name, group: c.group })) };
  }
  return texts.list;
}
