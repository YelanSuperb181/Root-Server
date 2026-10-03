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
import { log } from "./log";
import { settings } from "./settings";
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

/**
 * Nicknames already looked up. Menus and lists name lots of people at once,
 * and Root allows only about 20 reads a second, so asking once per person
 * every time made the menu slow enough to time out.
 */
const names = new Map<string, { name: string; until: number }>();
const NAME_TTL_MS = 10 * 60_000;
/** Someone who isn't a member (left, or banned) is asked about again sooner. */
const MISSING_TTL_MS = 2 * 60_000;
const lookingUp = new Map<string, Promise<string>>();
/** Name lookups running at once, at most. */
const MAX_LOOKUPS = 6;
let lookups = 0;
const lookupQueue: Array<() => void> = [];

/** Remembers the nicknames in a member list (one call names everyone). */
export function rememberNames(list: Array<{ userId: string; name: string }>): void {
  const until = Date.now() + NAME_TTL_MS;
  for (const m of list) names.set(m.userId, { name: m.name, until });
}

export async function nickname(userId: string): Promise<string> {
  const known = names.get(userId);
  if (known && Date.now() < known.until) return known.name;
  let pending = lookingUp.get(userId);
  if (!pending) {
    pending = lookUpName(userId).finally(() => lookingUp.delete(userId));
    lookingUp.set(userId, pending);
  }
  return pending;
}

async function lookUpName(userId: string): Promise<string> {
  // A finished lookup hands its place straight to the next one waiting.
  if (lookups >= MAX_LOOKUPS) await new Promise<void>((go) => lookupQueue.push(go));
  else lookups++;
  try {
    const member = await read("communityMembers.get", () => rootServer.community.communityMembers.get({ userId: userId as UserGuid }));
    const name = member.nickname || "someone";
    names.set(userId, { name, until: Date.now() + NAME_TTL_MS });
    return name;
  } catch {
    // Keep the name we last knew them by (someone who left still has one).
    const name = names.get(userId)?.name ?? "someone";
    names.set(userId, { name, until: Date.now() + MISSING_TTL_MS });
    return name;
  } finally {
    const next = lookupQueue.shift();
    if (next) next();
    else lookups--;
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

/**
 * Admin: the owner, or a role that can manage the community. Mod: a role that
 * can kick or ban, or anyone on the community's Staff list in Blitz's settings.
 */
export async function accessLevel(userId: string): Promise<AccessLevel> {
  if (!isPerson(userId)) return "everyone";
  if (userId === (await owner())) return "admin";
  const mine = memberRoles.get(userId) ?? new Set<string>();
  let level: AccessLevel = "everyone";
  if (mine.size > 0) {
    for (const role of await communityRoles()) {
      if (!mine.has(role.id)) continue;
      const c = role.communityPermission;
      if (c.communityFullControl || c.communityManageCommunity) return "admin";
      if (c.communityKick || c.communityCreateBan) level = "mod";
    }
  }
  if (level === "everyone" && (await settings.isStaff(userId))) level = "mod";
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
