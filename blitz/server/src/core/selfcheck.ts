// A quick look, at startup, at whether Blitz can actually read the chat in
// this community, so "Blitz doesn't answer" is easy to pin down from the log.

import { rootServer, ChannelGuid, MessageDirectionTake } from "@rootsdk/server-app";
import { errDetail, read } from "./api";
import { listChannels } from "./community";
import { log } from "./log";

const NO_PERMISSIONS = "Root may not have given Blitz its permissions here, so it won't hear commands.";

export async function checkCanRead(): Promise<void> {
  const tried: string[] = [];
  try {
    const text = (await listChannels()).filter((c) => c.type === "text");
    if (text.length === 0) {
      log("warn", `Blitz can't see any text channels. ${NO_PERMISSIONS}`);
      return;
    }
    // A few channels, in case one of them is private.
    for (const channel of text.slice(0, 3)) {
      try {
        await read("channelMessages.list", () =>
          rootServer.community.channelMessages.list({
            channelId: channel.id as ChannelGuid,
            messageDirectionTake: MessageDirectionTake.Older,
            dateAt: new Date(),
            limit: 50, // Root rejects very small pages
          }),
        );
        log("info", `Blitz can read the chat (${text.length} text channel${text.length === 1 ? "" : "s"}, like #${channel.name})`);
        return;
      } catch (err) {
        tried.push(`#${channel.name}: ${errDetail(err)}`);
      }
    }
    log("warn", `Blitz can't read the chat. ${NO_PERMISSIONS}`, { tried });
  } catch (err) {
    log("warn", `Blitz can't look at the channels. ${NO_PERMISSIONS}`, { error: errDetail(err) });
  }
}
