// Who's who: member roles (kept live from the start-state snapshot plus role
// events), nicknames, the owner, and staff levels for command permissions.

import {
  rootServer,
  CommunityEvent,
  CommunityJoinedEvent,
  CommunityLeaveEvent,
  CommunityMemberRoleCreatedEvent,
  CommunityMemberRoleDeletedEvent,
  CommunityMemberRoleEvent,
  CommunityRole,
  CommunityRoleEvent,
  RootAppStartState,
  RootGuidType,
  RootGuidUtils,
  UserGuid,
} from "@rootsdk/server-app";
import { read } from "./api";
import { directory } from "./directory";
import { log } from "./log";
import { kv } from "./store";

export type AccessLevel = "everyone" | "mod" | "admin";

const memberRoles = new Map<string, Set<string>>();
let rolesCache: { at: number; roles: CommunityRole[] } | undefined;
let ownerId: string | undefined;
let selfId: string | undefined;

const ROLE_TTL_MS = 5 * 60_000;

export function initMembers(state: RootAppStartState): void {
  for (const [userId, roles] of state.communityMembers) memberRoles.set(userId, new Set(roles));

  const roleEvents = rootServer.community.communityMemberRoles;
  roleEvents.on(CommunityMemberRoleEvent.CommunityMemberRoleCreated, (evt: CommunityMemberRoleCreatedEvent) => {
    for (const userId of evt.userIds) rolesOf(userId).add(evt.communityRoleId);
  });
  roleEvents.on(CommunityMemberRoleEvent.CommunityMemberRoleDeleted, (evt: CommunityMemberRoleDeletedEvent) => {
    for (const userId of evt.userIds) rolesOf(userId).delete(evt.communityRoleId);
  });

  const communities = rootServer.community.communities;
  communities.on(CommunityEvent.CommunityJoined, (evt: CommunityJoinedEvent) => {
    memberRoles.set(evt.userId, new Set(evt.communityRoleIds));
  });
  communities.on(CommunityEvent.CommunityLeave, (evt: CommunityLeaveEvent) => {
    memberRoles.delete(evt.userId);
  });
  communities.on(CommunityEvent.CommunityEdited, () => {
    ownerId = undefined;
  });

  const invalidate = () => {
    rolesCache = undefined;
  };
  const roles = rootServer.community.communityRoles;
  roles.on(CommunityRoleEvent.CommunityRoleCreated, invalidate);
  roles.on(CommunityRoleEvent.CommunityRoleEdited, invalidate);
  roles.on(CommunityRoleEvent.CommunityRoleDeleted, invalidate);
}

function rolesOf(userId: string): Set<string> {
  let set = memberRoles.get(userId);
  if (!set) {
    set = new Set();
    memberRoles.set(userId, set);
  }
  return set;
}

/** Humans only; bots and Apps have App-type IDs. */
export function isPerson(userId: string): boolean {
  try {
    return RootGuidUtils.toRootGuidType(userId) === RootGuidType.Person;
  } catch {
    return false;
  }
}

export function hasRole(userId: string, roleId: string | undefined): boolean {
  return roleId !== undefined && (memberRoles.get(userId)?.has(roleId) ?? false);
}

/** Every human currently in the community, per the live snapshot. */
export function knownPeople(): string[] {
  return [...memberRoles.keys()].filter(isPerson);
}

/** Marks a role change we just made, so we don't wait for the event. */
export function noteRoleChange(userId: string, roleId: string, added: boolean): void {
  if (added) rolesOf(userId).add(roleId);
  else rolesOf(userId).delete(roleId);
}

export async function communityRoles(): Promise<CommunityRole[]> {
  if (!rolesCache || Date.now() - rolesCache.at > ROLE_TTL_MS) {
    const roles = await read("communityRoles.list", () => rootServer.community.communityRoles.list());
    rolesCache = { at: Date.now(), roles };
  }
  return rolesCache.roles;
}

export async function nickname(userId: string): Promise<string> {
  try {
    const member = await read("communityMembers.get", () => rootServer.community.communityMembers.get({ userId: userId as UserGuid }));
    return member.nickname || "someone";
  } catch {
    return "someone";
  }
}

async function owner(): Promise<string | undefined> {
  if (!ownerId) {
    try {
      ownerId = (await read("communities.get", () => rootServer.community.communities.get())).ownerUserId;
    } catch (err) {
      log("warn", "couldn't look up the community owner", { error: String(err) });
    }
  }
  return ownerId;
}

/** Admin: owner, or a role that can manage the community. Mod: a role that can kick/ban, or the blueprint's "moderator" role. */
export async function accessLevel(userId: string): Promise<AccessLevel> {
  if (!isPerson(userId)) return "everyone";
  if (userId === (await owner())) return "admin";
  const mine = memberRoles.get(userId) ?? new Set<string>();
  if (mine.size === 0) return "everyone";

  let level: AccessLevel = "everyone";
  for (const role of await communityRoles()) {
    if (!mine.has(role.id)) continue;
    const c = role.communityPermission;
    if (c.communityFullControl || c.communityManageCommunity || role.id === directory.roleId("admin")) return "admin";
    if (c.communityKick || c.communityCreateBan || role.id === directory.roleId("moderator")) level = "mod";
  }
  return level;
}

export function atLeast(level: AccessLevel, needed: AccessLevel): boolean {
  const order: AccessLevel[] = ["everyone", "mod", "admin"];
  return order.indexOf(level) >= order.indexOf(needed);
}

/** The bot's own member ID, learned from a message it posted. */
export function botUserId(): string | undefined {
  return selfId;
}

export async function loadSelf(): Promise<void> {
  selfId = await kv.get<string>("self:id");
}

export async function learnSelf(userId: string): Promise<void> {
  if (!userId || userId === selfId) return;
  selfId = userId;
  await kv.set("self:id", userId);
}
