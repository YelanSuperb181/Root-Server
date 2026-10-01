// Reaction roles: the ✅ on the rules post unlocks the community (gate on),
// and any role pickers from blueprint/content.ts hand out roles by reaction.

import { rootServer, CommunityRoleGuid, UserGuid } from "@rootsdk/server-bot";
import { rolePanels, rulesGate } from "../blueprint/content";
import { config } from "../config";
import { write } from "../core/api";
import { directory } from "../core/directory";
import { serialize } from "../core/lock";
import { errMessage, log } from "../core/log";
import { hasRole } from "../core/members";
import { addRole, removeRole } from "../core/messaging";
import { kv } from "../core/store";
import { isEmoji } from "../logic/emoji";
import { blueprint } from "../blueprint/layout";
import { greet } from "./welcome";

export type PanelInfo = { kind: "gate" } | { kind: "roles"; panel: string };

const panels = new Map<string, PanelInfo>();

export async function loadPanels(): Promise<void> {
  for (const { key, value } of await kv.entries<PanelInfo>("panel:")) {
    panels.set(key.slice("panel:".length), value);
  }
}

export async function registerPanel(messageId: string, info: PanelInfo): Promise<void> {
  panels.set(messageId, info);
  await kv.set(`panel:${messageId}`, info);
}

export interface ReactionInput {
  messageId: string;
  userId: string;
  shortcode: string;
}

export async function onPanelReaction(evt: ReactionInput, added: boolean): Promise<void> {
  const info = panels.get(evt.messageId);
  if (!info) return;
  // One member's clicks are handled in order, so fast color swaps don't race.
  await serialize(`roles:${evt.userId}`, async () => {
    try {
      if (info.kind === "gate") await onGate(evt, added);
      else await onRolePanel(info.panel, evt, added);
    } catch (err) {
      log("warn", "reaction role failed", { error: errMessage(err) });
    }
  });
}

async function onGate(evt: ReactionInput, added: boolean): Promise<void> {
  // With the gate off the ✅ is just a "read it" nod (members were greeted on
  // join). Removing the ✅ later doesn't lock anyone out again.
  if (!config.onboarding.gate || !added || !isEmoji(evt.shortcode, rulesGate.emoji)) return;
  const roleId = directory.roleId(rulesGate.role);
  if (!roleId) {
    log("warn", "rules gate: the Member role doesn't exist; run !setup");
    return;
  }
  if (hasRole(evt.userId, roleId)) return;
  await addRole(evt.userId, roleId);
  await greet(evt.userId);
}

async function onRolePanel(panelKey: string, evt: ReactionInput, added: boolean): Promise<void> {
  const panel = rolePanels.find((p) => p.key === panelKey);
  const option = panel?.options.find((o) => isEmoji(evt.shortcode, o.emoji));
  if (!panel || !option) return;
  const roleId = directory.roleId(option.role);
  if (!roleId) return;

  if (!added) {
    if (hasRole(evt.userId, roleId)) await removeRole(evt.userId, roleId);
    return;
  }

  if (panel.exclusive) {
    for (const other of panel.options) {
      const otherId = directory.roleId(other.role);
      if (otherId && otherId !== roleId && hasRole(evt.userId, otherId)) await removeRole(evt.userId, otherId);
    }
  }
  if (!hasRole(evt.userId, roleId)) await addRole(evt.userId, roleId);

  // A member's primary role sets their name color, so a color pick becomes primary.
  if (blueprint.roles.find((r) => r.key === option.role)?.category === "color") {
    try {
      await write("communityMemberRoles.setPrimary", () =>
        rootServer.community.communityMemberRoles.setPrimary({
          userId: evt.userId as UserGuid,
          communityRoleId: roleId as CommunityRoleGuid,
        }),
      );
    } catch (err) {
      log("warn", "couldn't set primary role", { error: errMessage(err) });
    }
  }
}
