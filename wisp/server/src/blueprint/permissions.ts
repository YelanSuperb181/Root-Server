// Permission building blocks for the blueprint. Type-only SDK imports, so
// this file runs in tests without a Root connection.

import type { ChannelOverlayPermission, ChannelPermission, CommunityPermission } from "@rootsdk/server-app";
import type { AccessRuleSpec, Subject } from "./types";

const NO_COMMUNITY: CommunityPermission = {
  communityManageCommunity: false,
  communityManageRoles: false,
  communityManageEmojis: false,
  communityManageAuditLog: false,
  communityCreateInvite: false,
  communityManageInvites: false,
  communityCreateBan: false,
  communityManageBans: false,
  communityFullControl: false,
  communityKick: false,
  communityChangeMyNickname: false,
  communityChangeOtherNickname: false,
  communityCreateChannelGroup: false,
  communityManageApps: false,
};

const NO_CHANNEL: ChannelPermission = {
  channelFullControl: false,
  channelView: false,
  channelUseExternalEmoji: false,
  channelCreateMessage: false,
  channelDeleteMessageOther: false,
  channelManagePinnedMessages: false,
  channelViewMessageHistory: false,
  channelCreateMessageAttachment: false,
  channelCreateMessageMention: false,
  channelCreateMessageReaction: false,
  channelMakeMessagePublic: false,
  channelMoveUserOther: false,
  channelVoiceTalk: false,
  channelVoiceMuteOther: false,
  channelVoiceDeafenOther: false,
  channelVoiceKick: false,
  channelVideoStreamMedia: false,
  channelCreateFile: false,
  channelManageFiles: false,
  channelViewFile: false,
  channelAppKick: false,
};

/** A complete community permission set: listed grants on, everything else off. */
export function communityPermission(grants: Partial<CommunityPermission> = {}): CommunityPermission {
  return { ...NO_COMMUNITY, ...grants };
}

/** A complete channel permission set: listed grants on, everything else off. */
export function channelPermission(grants: Partial<ChannelPermission> = {}): ChannelPermission {
  return { ...NO_CHANNEL, ...grants };
}

/** True when a role spec asks for anything beyond Root's defaults. */
export function hasElevatedPermissions(community?: Partial<CommunityPermission>, channel?: Partial<ChannelPermission>): boolean {
  return Object.values(community ?? {}).some(Boolean) || Object.values(channel ?? {}).some(Boolean);
}

// --- Access rule presets -------------------------------------------------------

export const EVERYONE: Subject = "@everyone";
export const SELF: Subject = "@self";

export const HIDE: ChannelOverlayPermission = { channelView: false };
export const SHOW: ChannelOverlayPermission = { channelView: true, channelViewMessageHistory: true };

/** Members can read and react, but not post. */
export const READ_ONLY: ChannelOverlayPermission = {
  channelCreateMessage: false,
  channelCreateMessageAttachment: false,
};

/** Lets staff post (and pin) where members can't. */
export const CAN_POST: ChannelOverlayPermission = {
  channelCreateMessage: true,
  channelCreateMessageAttachment: true,
  channelCreateMessageMention: true,
  channelManagePinnedMessages: true,
};

/** Voice: listen only. */
export const LISTEN_ONLY: ChannelOverlayPermission = { channelVoiceTalk: false, channelVideoStreamMedia: false };
export const CAN_SPEAK: ChannelOverlayPermission = { channelVoiceTalk: true, channelVideoStreamMedia: true };

/** The bot's own rule on private areas, so it can always see what it manages. */
export const BOT_ACCESS: ChannelOverlayPermission = { channelFullControl: true, channelView: true };

export function rule(subject: Subject, overlay: ChannelOverlayPermission): AccessRuleSpec {
  return { subject, overlay };
}

/**
 * Combines rule lists. Later lists win: rules for the same subject are merged
 * field by field, so a channel can override one setting of its group's rule.
 */
export function mergeRules(...lists: ReadonlyArray<readonly AccessRuleSpec[] | undefined>): AccessRuleSpec[] {
  const bySubject = new Map<Subject, ChannelOverlayPermission>();
  for (const list of lists) {
    for (const r of list ?? []) {
      bySubject.set(r.subject, { ...(bySubject.get(r.subject) ?? {}), ...r.overlay });
    }
  }
  return [...bySubject].map(([subject, overlay]) => ({ subject, overlay }));
}
