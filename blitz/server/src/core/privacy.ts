// Blitz is a private App. Packaged for upload (stage.js), it carries a list
// of owners, and in a community owned by anyone else it switches itself off:
// no setup, no levels, no brain, nothing saved. It only answers commands
// there to say it's private. Run on your own computer (no lock file), it's
// never locked, and it learns who you are: Root makes you the owner of your
// test community, so that owner is who an uploaded Blitz is locked to.

import fs from "fs";
import path from "path";
import { rootServer, ChannelMessageCreatedEvent, ChannelMessageEvent, MessageType } from "@rootsdk/server-app";
import { config } from "../config";
import { ownerAllowed } from "../logic/owner";
import { errDetail, read } from "./api";
import { log } from "./log";
import { isPerson } from "./members";
import { send } from "./messaging";

const LOCK_FILE = path.join(__dirname, "..", "lock.json");
/** Where a Blitz running on your computer notes who you are (blitz/server/owner.local.json; git ignores it). */
const OWNER_FILE = path.join(__dirname, "..", "..", "owner.local.json");
const NOTICE_EVERY_MS = 10 * 60_000;

function readOwners(): string[] | undefined {
  if (!fs.existsSync(LOCK_FILE)) return undefined;
  try {
    const owners = (JSON.parse(fs.readFileSync(LOCK_FILE, "utf8")) as { owners?: unknown }).owners;
    return Array.isArray(owners) ? owners.filter((o): o is string => typeof o === "string") : [];
  } catch {
    return []; // A broken lock file locks everything rather than nothing.
  }
}

/** Whether Blitz must stay switched off in this community. */
export async function lockedOut(): Promise<boolean> {
  const owners = readOwners();
  if (!owners) return false;
  for (let attempt = 1; ; attempt++) {
    try {
      const community = await read("communities.get", () => rootServer.community.communities.get());
      if (ownerAllowed(community.ownerUserId, owners)) return false;
      log("warn", `${config.botName} is a private App and "${community.name}" isn't owned by its owner, so it's switched off here`);
      return true;
    } catch (err) {
      if (attempt >= 3) {
        log("error", `couldn't check who owns this community, so ${config.botName} stays switched off`, { error: errDetail(err) });
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}

/** On your own computer: remember the test community's owner (you) for the lock. */
export async function rememberOwner(): Promise<void> {
  if (readOwners()) return; // An uploaded copy: nothing to learn.
  try {
    const community = await read("communities.get", () => rootServer.community.communities.get());
    if (!isPerson(community.ownerUserId)) {
      log("warn", `"${community.name}" isn't owned by a person, so ${config.botName} can't learn who you are from it`);
      return;
    }
    fs.writeFileSync(OWNER_FILE, JSON.stringify({ owner: community.ownerUserId, community: community.name }, null, 2) + "\n");
    log("info", `Noted you as the owner of "${community.name}": an uploaded ${config.botName} will only work in your communities`);
  } catch (err) {
    log("warn", "couldn't look up who owns this community", { error: errDetail(err) });
  }
}

/** All Blitz does in someone else's community: say it's private when someone tries a command. */
export function runLocked(): void {
  const lastNotice = new Map<string, number>();
  rootServer.community.channelMessages.on(ChannelMessageEvent.ChannelMessageCreated, (evt: ChannelMessageCreatedEvent) => {
    if (evt.messageType === MessageType.System || !isPerson(evt.userId)) return;
    if (!(evt.messageContent ?? "").trimStart().startsWith(config.prefix)) return;
    const now = Date.now();
    if (now - (lastNotice.get(evt.channelId) ?? 0) < NOTICE_EVERY_MS) return;
    lastNotice.set(evt.channelId, now);
    void send(evt.channelId, `🔒 ${config.botName} is a private App made for another community, so it doesn't do anything here.`, evt.id).catch(
      () => undefined,
    );
  });
}
