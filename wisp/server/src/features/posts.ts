// Publishes the starter content from blueprint/content.ts: the welcome
// guide, the rules gate, role panels and channel how-tos. Each post's ID is
// saved, so re-running only fills gaps, and "refresh" edits posts in place.

import { rootServer } from "@rootsdk/server-app";
import { PostContext, renderPanel, rolePanels, rulesGate, starterPosts } from "../blueprint/content";
import { config } from "../config";
import { read } from "../core/api";
import { directory } from "../core/directory";
import { errMessage, log } from "../core/log";
import { edit, getMessage, pin, react, send } from "../core/messaging";
import { kv } from "../core/store";
import { Emoji, emojiKey } from "../logic/emoji";
import { registerPanel } from "./roles";

interface SavedPost {
  channelId: string;
  messageId: string;
}

export interface PostResult {
  posted: string[];
  refreshed: string[];
  skipped: string[];
  failed: string[];
}

export async function postContext(): Promise<PostContext> {
  let community = "our community";
  try {
    community = (await read("communities.get", () => rootServer.community.communities.get())).name || community;
  } catch (err) {
    log("warn", "couldn't read community name", { error: errMessage(err) });
  }
  return {
    community,
    prefix: config.prefix,
    botName: config.botName,
    gate: config.onboarding.gate,
    channel: (key) => directory.channelMention(key),
    role: (key) => `**${directory.roleName(key)}**`,
  };
}

/**
 * Makes sure one post exists. Returns what happened, and the message ID.
 * With `refresh`, an existing post is edited to the current text.
 */
async function ensurePost(
  key: string,
  channelKey: string,
  content: string,
  options: { pin: boolean; refresh: boolean; reactions: readonly Emoji[] },
): Promise<{ outcome: "posted" | "refreshed" | "skipped" | "failed"; messageId?: string }> {
  const channelId = directory.channelId(channelKey);
  if (!channelId) return { outcome: "failed" };

  const saved = await kv.get<SavedPost>(`post:${key}`);
  const existing = saved && saved.channelId === channelId ? await getMessage(saved.channelId, saved.messageId) : undefined;

  try {
    if (existing) {
      if (!options.refresh) return { outcome: "skipped", messageId: existing.id };
      if (existing.messageContent !== content) await edit(channelId, existing.id, content);
      // Add any reactions a panel gained since it was posted.
      const have = new Set(existing.reactions.map((r) => emojiKey(r.shortcode)));
      for (const e of options.reactions) if (!have.has(emojiKey(e.code))) await react(channelId, existing.id, e);
      return { outcome: "refreshed", messageId: existing.id };
    }

    const msg = await send(channelId, content);
    await kv.set<SavedPost>(`post:${key}`, { channelId, messageId: msg.id });
    for (const e of options.reactions) await react(channelId, msg.id, e);
    if (options.pin) await pin(channelId, msg.id);
    return { outcome: "posted", messageId: msg.id };
  } catch (err) {
    log("warn", `couldn't publish post "${key}"`, { error: errMessage(err) });
    return { outcome: "failed" };
  }
}

export async function publishContent(refresh: boolean): Promise<PostResult> {
  const result: PostResult = { posted: [], refreshed: [], skipped: [], failed: [] };
  const record = (key: string, outcome: keyof PostResult) => result[outcome].push(key);
  const ctx = await postContext();

  for (const post of starterPosts) {
    const isRules = post.key === "rules";
    const { outcome, messageId } = await ensurePost(post.key, post.channel, post.render(ctx), {
      pin: post.pin,
      refresh,
      reactions: isRules ? [rulesGate.emoji] : [],
    });
    record(post.key, outcome);
    if (isRules && messageId) await registerPanel(messageId, { kind: "gate" });

    // The role panels go right after the intro post in #roles.
    if (post.key === "roles-intro") {
      for (const panel of rolePanels) {
        const key = `panel-${panel.key}`;
        const res = await ensurePost(key, post.channel, renderPanel(panel), {
          pin: false,
          refresh,
          reactions: panel.options.map((o) => o.emoji),
        });
        record(key, res.outcome);
        if (res.messageId) await registerPanel(res.messageId, { kind: "roles", panel: panel.key });
      }
    }
  }
  return result;
}
