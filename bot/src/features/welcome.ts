// Greets newcomers (after they accept the rules, when the gate is on), nudges
// them with a push notification on join, and logs joins and leaves for staff.

import {
  rootServer,
  CommunityEvent,
  CommunityJoinedEvent,
  CommunityLeaveEvent,
  CommunityLeaveReason,
} from "@rootsdk/server-bot";
import { welcomeLines } from "../content/lines";
import { config } from "../config";
import { read } from "../core/api";
import { directory } from "../core/directory";
import { errMessage, log } from "../core/log";
import { isPerson, nickname } from "../core/members";
import { modLog, notify, sendTo } from "../core/messaging";
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
  const name = await nickname(userId);
  const line = fillTemplate(pick(welcomeLines), { user: userMention(name, userId), community: `**${communityName}**` });
  const tip = `Grab some roles in ${directory.channelMention("roles")} and tell us about yourself in ${directory.channelMention("introductions")} 💚`;
  await sendTo(config.onboarding.greetIn, `${line}\n${tip}`);
}

async function onJoin(evt: CommunityJoinedEvent): Promise<void> {
  if (!isPerson(evt.userId)) return;
  try {
    const name = await nickname(evt.userId);
    if (config.modLog.joinsAndLeaves) await modLog(`📥 ${userMention(name, evt.userId)} joined.`);

    if (!config.onboarding.gate) {
      await greet(evt.userId);
    } else if (config.onboarding.notifyOnJoin) {
      await notify([evt.userId], `Welcome to ${communityName}! 🌱`, "Read #rules and react ✅ to unlock the whole community.");
    }
  } catch (err) {
    log("warn", "welcome failed", { error: errMessage(err) });
  }
}

async function onLeave(evt: CommunityLeaveEvent): Promise<void> {
  if (!config.modLog.joinsAndLeaves || !isPerson(evt.userId)) return;
  const how =
    evt.leaveReason === CommunityLeaveReason.Kicked ? "was kicked" : evt.leaveReason === CommunityLeaveReason.Banned ? "was banned" : "left";
  await modLog(`📤 A member ${how} (${userMention("member", evt.userId)}).`).catch(() => undefined);
}
