// A quick look, at startup, at whether Blitz can actually read the chat in
// this community, so "Blitz doesn't answer" is easy to pin down from the log.

import { rootServer, ChannelGuid, MessageDirectionTake } from "@rootsdk/server-app";
import { read } from "./api";
import { fetchExistingState } from "./directory";
import { errMessage, log } from "./log";

const NO_PERMISSIONS = "Root may not have given Blitz its permissions here, so it won't hear commands.";

export async function checkCanRead(): Promise<void> {
  try {
    const state = await fetchExistingState();
    const text = state.groups.flatMap((g) => g.channels).filter((c) => c.type === "text");
    const channel = text[0];
    if (!channel) {
      log("warn", `Blitz can't see any text channels. ${NO_PERMISSIONS}`);
      return;
    }
    await read("channelMessages.list", () =>
      rootServer.community.channelMessages.list({
        channelId: channel.id as ChannelGuid,
        messageDirectionTake: MessageDirectionTake.Older,
        dateAt: new Date(),
        limit: 1,
      }),
    );
    log("info", `Blitz can read the chat (${text.length} text channel${text.length === 1 ? "" : "s"}, like #${channel.name})`);
  } catch (err) {
    log("warn", `Blitz can't read the chat. ${NO_PERMISSIONS}`, { error: errMessage(err) });
  }
}
