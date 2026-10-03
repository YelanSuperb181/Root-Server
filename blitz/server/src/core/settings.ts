// Each community sets Blitz up on Root's App settings page (the "settings"
// groups in root-manifest.json): which channels it posts in, which roles it
// hands out, who counts as staff, which channels it stays out of. Anything
// left empty is simply off, so Blitz fits any community without creating a
// single channel or role.

import { rootServer, ChannelGuid, CommunityRoleGuid, ReadOnlyMemberGroup, UserGuid } from "@rootsdk/server-app";
import { channelMention, roleMention } from "../logic/text";
import { read } from "./api";

/** Channels a community can point Blitz at. */
export type ChannelSetting = "welcome" | "levelUps" | "quotes" | "birthdays" | "suggestions" | "log" | "messageLog";
/** Roles a community can give Blitz to hand out. */
export type RoleSetting = "joinRole" | "birthdayRole";

function raw(group: string, key: string): unknown {
  const all = rootServer.globalSettings as unknown as Record<string, Record<string, unknown> | undefined> | undefined;
  return all?.[group]?.[key];
}

function channelList(key: string): ChannelGuid[] {
  const value = raw("channels", key);
  return Array.isArray(value) ? (value.filter((v) => typeof v === "string") as ChannelGuid[]) : [];
}

function memberGroup(group: string, key: string): ReadOnlyMemberGroup | undefined {
  const value = raw(group, key) as ReadOnlyMemberGroup | undefined;
  return value && typeof value === "object" ? value : undefined;
}

const names = new Map<string, { name: string; at: number }>();
const NAME_TTL_MS = 10 * 60_000;

export const settings = {
  /** The channel picked for `key`, if any. */
  channel(key: ChannelSetting): ChannelGuid | undefined {
    return channelList(key)[0];
  },

  /** Channels Blitz stays out of: no XP, no quotes, nothing to Claude or the domain. */
  isPrivate(channelId: string): boolean {
    return channelList("private").includes(channelId as ChannelGuid);
  },

  /** Whether this is a staff log channel (Blitz's own notes go there, so it's left alone). */
  isLog(channelId: string): boolean {
    return settings.channel("log") === channelId || settings.channel("messageLog") === channelId;
  },

  /** The role picked for `key`, if any. */
  role(key: RoleSetting): CommunityRoleGuid | undefined {
    return memberGroup("roles", key)?.communityRoleIds?.[0];
  },

  /** Whether someone is on the staff list (by name or by role). */
  async isStaff(userId: string): Promise<boolean> {
    const staff = memberGroup("roles", "staff");
    if (!staff) return false;
    if (staff.userIds?.includes(userId as UserGuid)) return true;
    try {
      return await staff.isMember({ userId: userId as UserGuid });
    } catch {
      return false;
    }
  },

  /** The roles on the staff list, for pinging them. */
  staffRoles(): CommunityRoleGuid[] {
    return memberGroup("roles", "staff")?.communityRoleIds ?? [];
  },

  /**
   * Whether a feature is on. Root sends an untouched checkbox as unticked
   * (whatever its default says), so these are "Turn off …" boxes: the
   * feature stays on until an admin ticks one.
   */
  on(key: "levels" | "automod"): boolean {
    return raw(key === "levels" ? "features" : "automod", `${key}Off`) !== true;
  },

  /** An opt-in checkbox: true only once an admin ticks it. */
  ticked(key: "blockInvites"): boolean {
    return raw("automod", key) === true;
  },

  /** Roles members can give themselves with !role. */
  selfRoles(): CommunityRoleGuid[] {
    return memberGroup("roles", "selfRoles")?.communityRoleIds ?? [];
  },

  /** A whole number setting, kept within bounds. (While testing it arrives as text; see dev-manifest.js.) */
  number(key: "quoteThreshold", fallback: number, min: number, max: number): number {
    const value = raw("features", key);
    const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    return typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  },

  /** Free text an admin typed in (the welcome message, blocked words, "about" this community). */
  text(key: "about" | "welcomeMessage" | "blockedWords"): string | undefined {
    const group = key === "about" ? "brain" : key === "blockedWords" ? "automod" : "messages";
    const value = raw(group, key);
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  },
};

/** A clickable channel link ("#general"), or "a channel" if it can't be looked up. */
export async function channelLink(channelId: string): Promise<string> {
  const cached = names.get(channelId);
  if (cached && Date.now() - cached.at < NAME_TTL_MS) return channelMention(cached.name, channelId);
  try {
    const channel = await read("channels.get", () => rootServer.community.channels.get({ id: channelId as ChannelGuid }));
    names.set(channelId, { name: channel.name, at: Date.now() });
    return channelMention(channel.name, channelId);
  } catch {
    return "a channel";
  }
}

/** Pings for the staff roles, or "" when none are set. */
export async function staffPing(): Promise<string> {
  const ids = settings.staffRoles();
  if (ids.length === 0) return "";
  try {
    const roles = await read("communityRoles.list", () => rootServer.community.communityRoles.list());
    return ids
      .map((id) => roles.find((r) => r.id === id))
      .filter((r) => r !== undefined)
      .map((r) => roleMention(r.name, r.id))
      .join(" ");
  } catch {
    return "";
  }
}
