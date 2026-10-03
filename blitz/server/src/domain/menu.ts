// Blitz's menu, server side: what a domain window shows in its menu, and the
// actions taken from it. Actions run Blitz's own commands (core/commands'
// runFromMenu), so the menu can do everything chat can, with the same checks,
// and its replies come back to the window instead of being posted.

import { rootServer, Client, UserGuid } from "@rootsdk/server-app";
import { BlitzMenuServiceBase } from "@blitz/gen-server";
import {
  BanInfo,
  ChannelInfo,
  MemberCard,
  MemberCardRequest,
  MemberSearchRequest,
  MemberSearchResponse,
  MenuOverview,
  MenuRequest,
  RunRequest,
  RunResponse,
} from "@blitz/gen-shared";
import { read } from "../core/api";
import { allCommands, runFromMenu } from "../core/commands";
import { allMembers as memberList, textChannels } from "../core/community";
import { errMessage, log } from "../core/log";
import { accessLevel, atLeast, communityRoles, isPerson, knownPeople, nickname } from "../core/members";
import { settings } from "../core/settings";
import { activeWarnings } from "../logic/moderation";
import { rankByName } from "../logic/text";
import { birthdaysFor } from "../features/birthdays";
import { customCommands } from "../features/custom";
import { levelRules, levelsFor, xpOf } from "../features/levels";
import { actorName, casesOf, mutedUntil } from "../features/moderation";
import { remindersOf } from "../features/reminders";
import { roleChoices } from "../features/selfroles";
import { recentSuggestions } from "../features/suggestions";

/** Runs `get`; if it fails, logs it and gives `fallback`, so one missing piece doesn't empty the whole menu. */
async function piece<T>(what: string, get: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await get();
  } catch (err) {
    log("warn", `the menu couldn't load ${what}`, { error: errMessage(err) });
    return fallback;
  }
}

async function bans(): Promise<BanInfo[]> {
  const list = await read("communityMemberBans.list", () => rootServer.community.communityMemberBans.list());
  return Promise.all(
    list.slice(0, 50).map(async (b) => ({
      userId: b.userId,
      name: await nickname(b.userId),
      reason: b.reason ?? "",
      until: b.expiresAt ? new Date(b.expiresAt).getTime() : 0,
    })),
  );
}

class BlitzMenuService extends BlitzMenuServiceBase {
  async overview(_request: MenuRequest, client: Client): Promise<MenuOverview> {
    const userId = client.userId;
    const access = await accessLevel(userId);
    const staff = atLeast(access, "mod");
    const [community, levels, roles, reminders, birthdays, suggestions, cases] = await Promise.all([
      piece("the community", () => read("communities.get", () => rootServer.community.communities.get()), undefined),
      piece("levels", () => levelsFor(userId, 10), undefined),
      piece("roles", () => roleChoices(userId), []),
      piece("reminders", () => remindersOf(userId), []),
      piece("birthdays", () => birthdaysFor(userId, 8), { upcoming: [] }),
      piece("suggestions", () => recentSuggestions(8), []),
      piece("warnings", () => casesOf(userId), []),
    ]);
    return {
      userId,
      name: await nickname(userId),
      access,
      community: community?.name ?? "",
      about: settings.text("about") ?? community?.description ?? "",
      members: knownPeople().length,
      levels: {
        on: settings.on("levels"),
        level: levels?.level ?? 0,
        xp: levels?.xp ?? 0,
        into: levels?.into ?? 0,
        needed: levels?.needed ?? 0,
        messages: levels?.messages ?? 0,
        place: levels?.place ?? 0,
        top: levels?.top ?? [],
        how: levelRules(),
      },
      roles,
      reminders,
      birthday: {
        on: settings.channel("birthdays") !== undefined,
        month: birthdays.mine?.month ?? 0,
        day: birthdays.mine?.day ?? 0,
        upcoming: birthdays.upcoming,
      },
      commands: allCommands()
        .filter((c) => atLeast(access, c.level))
        .map((c) => ({ name: c.name, aliases: c.aliases ?? [], usage: c.usage ?? "", summary: c.summary, level: c.level, category: c.category, menu: c.menu ?? "" })),
      customs: customCommands().map((c) => ({ name: c.name, response: c.response, uses: staff ? c.uses : 0 })),
      suggestionsOn: settings.channel("suggestions") !== undefined,
      reportsOn: settings.channel("log") !== undefined,
      suggestions,
      myWarnings: activeWarnings(cases),
      bans: staff ? await piece("bans", bans, []) : [],
      channels: staff ? await piece("channels", textChannels, []) : [],
    };
  }

  async run(request: RunRequest, client: Client): Promise<RunResponse> {
    const name = (request.command ?? "").trim().toLowerCase().slice(0, 32);
    const args = (request.args ?? "").slice(0, 4000);
    log("info", `menu: ${name}`);
    try {
      return await runFromMenu(client.userId, name, args, request.channelId ?? "", async (id) => (await textChannels()).some((c) => c.id === id));
    } catch (err) {
      log("error", "a menu action failed", { error: errMessage(err) });
      return { ok: false, replies: ["⚠️ Something went wrong there. Try again in a moment."] };
    }
  }

  async searchMembers(request: MemberSearchRequest): Promise<MemberSearchResponse> {
    const query = (request.query ?? "").trim().slice(0, 64);
    if (!query) return { members: [] };
    const list = await piece("members", memberList, []);
    return { members: rankByName(query, list, 12) };
  }

  async member(request: MemberCardRequest, client: Client): Promise<MemberCard> {
    const empty: MemberCard = { userId: "", name: "", roles: [], joinedAt: 0, level: 0, messages: 0, warnings: 0, cases: [], mutedUntil: 0, access: "everyone" };
    // Members' histories are for the team.
    if (!atLeast(await accessLevel(client.userId), "mod") || !request.userId) return empty;
    const userId = request.userId;
    const member = await read("communityMembers.get", () => rootServer.community.communityMembers.get({ userId: userId as UserGuid }));
    const roles = await piece("roles", communityRoles, []);
    const cases = await casesOf(userId);
    const xp = await xpOf(userId);
    const joined = member.joinedAt ?? member.subscribedAt;
    return {
      userId,
      name: member.nickname || "someone",
      roles: member.communityRoleIds.map((id) => roles.find((r) => r.id === id)?.name).filter((n): n is string => !!n),
      joinedAt: joined ? new Date(joined).getTime() : 0,
      level: xp.level,
      messages: xp.messages,
      warnings: activeWarnings(cases),
      cases: await Promise.all(
        cases.slice(-25).map(async (c) => ({
          id: c.id,
          kind: c.kind,
          reason: c.reason ?? "",
          by: await actorName(c.modId),
          at: c.at,
          durationMs: c.durationMs ?? 0,
          revoked: c.revoked ?? false,
        })),
      ),
      mutedUntil: mutedUntil(userId) ?? 0,
      access: await accessLevel(userId),
    };
  }
}

export const menuService = new BlitzMenuService();
