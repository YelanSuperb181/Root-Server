// What's actually in the community: its channel groups and channels, as
// Root reports them. Blitz adapts to whatever is there.

import { rootServer, ChannelType } from "@rootsdk/server-app";
import { read } from "./api";

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
