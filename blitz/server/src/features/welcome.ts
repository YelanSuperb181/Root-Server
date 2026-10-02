// Greets newcomers in the community's welcome channel, gives them the join
// role, and notes joins and leaves in the staff log. Each part only runs if
// the community picked a channel or role for it in Blitz's settings.

import {
  rootServer,
  CommunityEvent,
  CommunityJoinedEvent,
  CommunityLeaveEvent,
  CommunityLeaveReason,
} from "@rootsdk/server-app";
import { welcomeLines } from "../content/lines";
import { config } from "../config";
import { read } from "../core/api";
import { errMessage, log } from "../core/log";
import { hasRole, isPerson, nickname } from "../core/members";
import { addRole, modLog, sendTo } from "../core/messaging";
import { settings } from "../core/settings";
import { fillTemplate, pick, userMention } from "../logic/text";

let communityName = "the community";

export function initWelcome(): void {
  rootServer.community.communities.on(CommunityEvent.CommunityJoined, (evt: CommunityJoinedEvent) => void onJoin(evt));
  rootServer.community.communities.on(CommunityEvent.CommunityLeave, (evt: CommunityLeaveEvent) => void onLeave(evt));
  read("communities.get", () => rootServer.community.communities.get())
    .then((c) => {
      communityName = c.name || communityName;
    })
    .catch(() => undefined);
}

/** Posts a welcome for a member who just got in. */
export async function greet(userId: string): Promise<void> {
  if (!settings.channel("welcome")) return;
  const name = await nickname(userId);
  const line = fillTemplate(pick(welcomeLines), { user: userMention(name, userId), community: `**${communityName}**` });
  await sendTo("welcome", `${line}\nSay \`${config.prefix}help\` to see what ${config.botName} can do ✨`);
}

async function onJoin(evt: CommunityJoinedEvent): Promise<void> {
  if (!isPerson(evt.userId)) return;
  try {
    const name = await nickname(evt.userId);
    await modLog(`📥 ${userMention(name, evt.userId)} joined.`);
    const joinRole = settings.role("joinRole");
    if (joinRole && !hasRole(evt.userId, joinRole)) {
      await addRole(evt.userId, joinRole).catch((err) => log("warn", "couldn't give the join role", { error: errMessage(err) }));
    }
    await greet(evt.userId);
  } catch (err) {
    log("warn", "welcome failed", { error: errMessage(err) });
  }
}

async function onLeave(evt: CommunityLeaveEvent): Promise<void> {
  if (!isPerson(evt.userId)) return;
  const how =
    evt.leaveReason === CommunityLeaveReason.Kicked ? "was kicked" : evt.leaveReason === CommunityLeaveReason.Banned ? "was banned" : "left";
  await modLog(`📤 A member ${how} (${userMention("member", evt.userId)}).`).catch(() => undefined);
}
