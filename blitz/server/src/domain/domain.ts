// Blitz's domain, server side. Everyone who opens the domain gets their own
// Blitz, which lives entirely in their window: its physics, tricks, naps and
// the burst bubble never touch the server. The server only does what a window
// can't: think with Claude (the community's API key stays here) when someone
// types to Blitz in their domain, and answer just them.

import { rootServer, ChannelGuid, Client } from "@rootsdk/server-app";
import { BlitzDomainServiceBase } from "@blitz/gen-server";
import { ThinkRequest, ThinkResponse } from "@blitz/gen-shared";
import { config } from "../config";
import { read } from "../core/api";
import { errMessage, log } from "../core/log";
import { nickname } from "../core/members";
import { settings } from "../core/settings";
import { findBlockedWord } from "../logic/automod";
import { parseWordList } from "../logic/moderation";
import { think } from "./brain";
import { recentTalk, rememberTalk } from "./memory";

/** One message to Blitz per person this often, in ms. */
const THINK_COOLDOWN_MS = 1200;
/** Longest message Blitz reads in the domain. */
const MAX_TEXT = 160;

/** The domain's channel (the App's own), for links to it. */
export const domain = {
  channelId: undefined as string | undefined,
  channelName: "blitz-domain",
};

const lastAsked = new Map<string, number>();
const NO_THOUGHT: ThinkResponse = { thought: false, mood: "", say: "", trick: "" };

class BlitzDomainService extends BlitzDomainServiceBase {
  async think(request: ThinkRequest, client: Client): Promise<ThinkResponse> {
    const now = Date.now();
    if (now - (lastAsked.get(client.userId) ?? 0) < THINK_COOLDOWN_MS) return NO_THOUGHT;
    const text = (request.text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    if (!text) return NO_THOUGHT;
    const blocked = [...config.automod.blockedWords, ...parseWordList(settings.text("blockedWords"))];
    if (findBlockedWord(text, blocked) !== undefined) return NO_THOUGHT;
    lastAsked.set(client.userId, now);
    try {
      const from = await nickname(client.userId);
      const place = `domain:${client.userId}`;
      const smart = await think({ from, text, channel: "", chat: [], memory: recentTalk(place), asleep: request.asleep, open: request.open });
      if (!smart) return NO_THOUGHT;
      rememberTalk(place, from, text, smart.say);
      return { thought: true, mood: smart.mood, say: smart.say, trick: smart.trick ?? "" };
    } catch (err) {
      log("warn", "Blitz couldn't think about a domain message", { error: errMessage(err) });
      return NO_THOUGHT;
    }
  }
}

export const domainService = new BlitzDomainService();

/** Learns which channel the domain lives in, for links to it. */
export async function initDomain(channelId: string): Promise<void> {
  domain.channelId = channelId;
  try {
    const channel = await read("channels.get", () => rootServer.community.channels.get({ id: channelId as ChannelGuid }));
    domain.channelName = channel.name || domain.channelName;
  } catch (err) {
    log("warn", "couldn't read the domain channel", { error: errMessage(err) });
  }
}
