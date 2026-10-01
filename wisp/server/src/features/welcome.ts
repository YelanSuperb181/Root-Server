// Greets newcomers (after they accept the rules, when the gate is on), gives
// them the auto role, optionally nudges them with a push notification, and
// logs joins and leaves for staff.

import {
  rootServer,
  CommunityEvent,
  CommunityJoinedEvent,
  CommunityLeaveEvent,
  CommunityLeaveReason,
} from "@rootsdk/server-app";
import { rulesGate } from "../blueprint/content";
import { welcomeLines } from "../content/lines";
import { config } from "../config";
import { read } from "../core/api";
import { directory } from "../core/directory";
import { errMessage, log } from "../core/log";
import { hasRole, isPerson, nickname } from "../core/members";
import { addRole, modLog, notify, sendTo } from "../core/messaging";
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
  const tip = `Say hi to ${config.botName} in ${directory.channelMention("bot-commands")} with \`${config.prefix}help\` ✨`;
  await sendTo(config.onboarding.greetIn, `${line}\n${tip}`);
}

async function onJoin(evt: CommunityJoinedEvent): Promise<void> {
  if (!isPerson(evt.userId)) return;
  try {
    const name = await nickname(evt.userId);
    if (config.modLog.joinsAndLeaves) await modLog(`📥 ${userMention(name, evt.userId)} joined.`);

    // With the gate on, the gate's role is earned by reacting to the rules, not handed out.
    const gated = config.onboarding.gate && config.onboarding.autoRole === rulesGate.role;
    const autoRole = config.onboarding.autoRole && !gated ? directory.roleId(config.onboarding.autoRole) : undefined;
    if (autoRole && !hasRole(evt.userId, autoRole)) {
      await addRole(evt.userId, autoRole).catch((err) => log("warn", "couldn't give the auto role", { error: errMessage(err) }));
    }

    if (!config.onboarding.gate) {
      await greet(evt.userId);
    } else if (config.onboarding.notifyOnJoin) {
      await notify([evt.userId], `Welcome to ${communityName}! ✨`, "Read #rules and react ✅ to unlock the whole community.");
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
