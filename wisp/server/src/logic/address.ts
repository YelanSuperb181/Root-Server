// Is a chat message for Wisp? Pure (type-only SDK import), so tests can cover it.

import type { ChannelMessageCreatedEvent } from "@rootsdk/server-app";
import { defuseMentions, mentionedUserIds } from "./text";

type MessageLike = Pick<ChannelMessageCreatedEvent, "messageContent" | "referenceMaps" | "parentMessages">;

/** True when the message is for Wisp: its name, an @mention, or a reply to one of its messages. */
export function addressedToWisp(evt: MessageLike, selfId: string | undefined): boolean {
  const text = evt.messageContent ?? "";
  if (selfId) {
    if (mentionedUserIds(text).includes(selfId)) return true;
    if (evt.referenceMaps?.users?.some((u) => u.userId === selfId)) return true;
    if (evt.parentMessages?.some((p) => p.userId === selfId)) return true;
  }
  return /\bwisp(y|ie)?\b/i.test(defuseMentions(text));
}
