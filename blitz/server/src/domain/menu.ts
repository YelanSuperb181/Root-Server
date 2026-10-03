// Blitz's menu, server side: what a domain window shows in its menu, and the
// actions taken from it. Actions run Blitz's own commands (core/commands'
// runFromMenu), so the menu can do everything chat can, with the same checks,
// and its replies come back to the window instead of being posted.

import { rootServer, Client, UserGuid } from "@rootsdk/server-app";
import { BlitzMenuServiceBase } from "@blitz/gen-server";
import {
  AskRequest,
  AskResponse,
  BanInfo,
  GiveawayInfo,
  GuardianInfo,
  InboxInfo,
  MemberCard,
  MemberCardRequest,
  MemberSearchRequest,
  MemberSearchResponse,
  MenuOverview,
  MenuRequest,
  PulseInfo,
  RunRequest,
  RunResponse,
  StardustInfo,
  TicketInfo,
  TicketReplyRequest,
  TicketRequest,
  TicketThread,
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
import { locksAndSlows, raidStatus, recentCatches } from "../features/guardian";
import { Ticket, addMessage, getTicket, markRead, openTickets, recentTickets, ticketsOf } from "../features/inbox";
import { activeGiveaways, recentGiveaways } from "../features/giveaways";
import { pulseDays } from "../features/pulse";
import { dailyReady, stardustTop, walletOf } from "../features/stardust";
import { levelRewards } from "../features/levels";
import { getCase, ladderText } from "../features/moderation";
import { channelLink } from "../core/settings";
import { CASE_LABEL } from "../logic/moderation";
import { summarize } from "../logic/pulse";
import { nextDailyAt } from "../logic/stardust";
import { brainReady } from "./brain";
import { askBlitz } from "./oracle";
import { UsageError } from "../core/commands";

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

/** A conversation as the menu lists it. The team also sees what Blitz's brain made of a report. */
async function ticketInfo(t: Ticket, staff: boolean): Promise<TicketInfo> {
  return {
    id: t.id,
    kind: t.kind,
    subject: t.subject,
    status: t.status,
    userId: t.userId,
    name: await nickname(t.userId),
    claimedBy: t.claimedBy ? await nickname(t.claimedBy) : "",
    updatedAt: t.updatedAt,
    unread: t.unread ?? "",
    resolution: t.resolution ?? "",
    caseId: t.caseId ?? 0,
    messages: t.messages.length,
    triageSeverity: staff ? (t.triage?.severity ?? "") : "",
    triageSummary: staff ? (t.triage?.summary ?? "") : "",
    triageSuggestion: staff ? (t.triage?.suggestion ?? "") : "",
  };
}

async function inboxFor(userId: string, staff: boolean): Promise<InboxInfo> {
  const mine = await Promise.all((await ticketsOf(userId, 10)).map((t) => ticketInfo(t, staff)));
  if (!staff) return { on: settings.on("inbox"), mine, team: [] };
  const open = await openTickets();
  const closed = (await recentTickets(30)).filter((t) => t.status === "closed").slice(0, 8);
  return { on: settings.on("inbox"), mine, team: await Promise.all([...open, ...closed].map((t) => ticketInfo(t, true))) };
}

async function stardustFor(userId: string): Promise<StardustInfo> {
  const w = await walletOf(userId);
  const top = await stardustTop(5);
  return {
    on: settings.on("stardust"),
    balance: w.balance,
    earned: w.earned,
    streak: w.streak,
    dailyReady: dailyReady(w),
    nextDaily: nextDailyAt(Date.now()),
    owned: w.owned,
    hat: w.wearing.hat ?? "",
    trail: w.wearing.trail ?? "",
    glow: w.wearing.glow ?? "",
    top: await Promise.all(top.map(async (e) => ({ userId: e.userId, name: await nickname(e.userId), earned: e.earned }))),
  };
}

async function giveawaysFor(userId: string): Promise<GiveawayInfo[]> {
  const list = [...(await activeGiveaways()), ...(await recentGiveaways(3))];
  return Promise.all(
    list.map(async (g) => ({
      id: g.id,
      prize: g.prize,
      winners: g.winners,
      endsAt: g.endsAt,
      entrants: g.entrants.length,
      entered: g.entrants.includes(userId),
      channel: (await channelLink(g.channelId)).replace(/^\[#([^\]]*)\].*$/, "$1"),
      ended: g.ended,
      winnerNames: await Promise.all(g.winnerIds.map(nickname)),
    })),
  );
}

/** "#general" from a channel link, for plain labels. */
const channelName = async (id: string) => (id === "all" ? "every channel" : (await channelLink(id)).replace(/^\[#([^\]]*)\].*$/, "#$1"));

async function guardianInfo(): Promise<GuardianInfo> {
  const raid = raidStatus();
  const { locks, slows } = locksAndSlows();
  const catches = [...recentCatches()].reverse().slice(0, 30);
  const names = new Map<string, string>();
  for (const c of catches) if (c.userId && !names.has(c.userId)) names.set(c.userId, await nickname(c.userId));
  return {
    scamOn: settings.on("scamShield"),
    raidOn: settings.on("raidShield"),
    raidActive: raid.active,
    raidUntil: raid.until,
    raidManual: raid.manual,
    raidHeld: raid.joined,
    newcomerMinutes: settings.number("newcomerMinutes", 10, 0, 1440),
    locks: await Promise.all(locks.map(async (l) => ({ channelId: l.channelId, name: await channelName(l.channelId), until: l.until ?? 0, reason: l.reason ?? "" }))),
    slows: await Promise.all(slows.map(async (x) => ({ channelId: x.channelId, name: await channelName(x.channelId), seconds: Math.round(x.ms / 1000) }))),
    catches: await Promise.all(catches.map(async (c) => ({ kind: c.kind, userId: c.userId, name: names.get(c.userId) ?? "", channel: c.channelId ? await channelName(c.channelId) : "", at: c.at, detail: c.detail }))),
    ladder: ladderText(),
    strict: settings.ticked("strictFilters"),
    coolOff: settings.on("coolOff"),
    automodOn: settings.on("automod"),
    raidJoins: settings.number("raidJoins", 8, 3, 100),
  };
}

async function pulseInfo(): Promise<PulseInfo> {
  const s = summarize(await pulseDays(28));
  const counts = (r: Record<string, number>) => Object.entries(r).map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count);
  return {
    days: s.series,
    weekMessages: s.week.messages,
    weekPeople: s.week.people,
    weekJoins: s.week.joins,
    weekLeaves: s.week.leaves,
    weekMod: s.week.mod,
    weekCaught: s.week.caught,
    hasChange: s.change.messages !== undefined,
    changeMessages: s.change.messages ?? 0,
    changePeople: s.change.people ?? 0,
    topChannels: await Promise.all(s.topChannels.map(async (c) => ({ name: await channelName(c.channelId), messages: c.messages }))),
    hours: s.hours,
    health: s.health,
    modKinds: counts(s.modKinds),
    caughtKinds: counts(s.caughtKinds),
  };
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
      stardust: await piece("stardust", () => stardustFor(userId), undefined),
      inbox: await piece("the inbox", () => inboxFor(userId, staff), undefined),
      giveaways: await piece("giveaways", () => giveawaysFor(userId), []),
      guardian: staff ? await piece("the shields", guardianInfo, undefined) : undefined,
      pulse: staff ? await piece("the pulse", pulseInfo, undefined) : undefined,
      myCases: cases
        .filter((c) => c.kind !== "note")
        .slice(-15)
        .map((c) => ({ id: c.id, kind: c.kind, reason: c.reason ?? "", by: "", at: c.at, durationMs: c.durationMs ?? 0, revoked: c.revoked ?? false })),
      levelRewards: await piece(
        "level rewards",
        async () => {
          const roles = await communityRoles();
          return (await levelRewards()).map((r) => ({ level: r.level, roleId: r.roleId, roleName: roles.find((x) => x.id === r.roleId)?.name ?? "a role that's gone" }));
        },
        [],
      ),
      brain: settings.ticked("brainModeration") && brainReady(),
      shieldUp: raidStatus().active || locksAndSlows().locks.some((l) => l.channelId === "all"),
    };
  }

  async ticket(request: TicketRequest, client: Client): Promise<TicketThread> {
    const staff = atLeast(await accessLevel(client.userId), "mod");
    const t = await getTicket(request.id);
    if (!t || (t.userId !== client.userId && !staff)) return { ticket: undefined, messages: [], about: "" };
    // Reading it clears the unread mark for that side.
    if (t.userId === client.userId && t.unread === "member") await markRead(t.id, "member");
    else if (staff && t.userId !== client.userId && t.unread === "team") await markRead(t.id, "team");
    return threadOf((await getTicket(t.id)) ?? t, staff && t.userId !== client.userId);
  }

  async ticketReply(request: TicketReplyRequest, client: Client): Promise<TicketThread> {
    const staff = atLeast(await accessLevel(client.userId), "mod");
    const t = await getTicket(request.id);
    if (!t) return { ticket: undefined, messages: [], about: "" };
    const asMember = t.userId === client.userId;
    if (!asMember && !staff) return { ticket: undefined, messages: [], about: "" };
    try {
      const updated = await addMessage(t.id, client.userId, asMember ? "member" : "team", (request.text ?? "").slice(0, 2000));
      return threadOf(updated, !asMember);
    } catch (err) {
      if (!(err instanceof UsageError)) log("warn", "couldn't add to a conversation", { error: errMessage(err) });
      return threadOf(t, !asMember);
    }
  }

  async ask(request: AskRequest, client: Client): Promise<AskResponse> {
    if (!atLeast(await accessLevel(client.userId), "mod")) return { ok: false, answer: "🔒 Ask Blitz is for the team." };
    try {
      return { ok: true, answer: await askBlitz(request.question ?? "") };
    } catch (err) {
      return { ok: false, answer: err instanceof UsageError ? err.message : "⚠️ Blitz's brain couldn't answer just now." };
    }
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

/** A conversation in full; the team sees names, members see "the team". */
async function threadOf(t: Ticket, staff: boolean): Promise<TicketThread> {
  const names = new Map<string, string>();
  for (const id of new Set(t.messages.map((m) => m.userId))) names.set(id, await nickname(id));
  let about = "";
  if (t.caseId) {
    const c = await getCase(t.caseId);
    if (c) about = `${CASE_LABEL[c.kind]} #${c.id}${c.reason ? `: ${c.reason}` : ""}`;
  }
  return {
    ticket: await ticketInfo(t, staff),
    messages: t.messages.map((m) => ({ from: m.from, name: m.from === "team" && !staff ? "The team" : names.get(m.userId) ?? "", text: m.text, at: m.at })),
    about,
  };
}

export const menuService = new BlitzMenuService();
