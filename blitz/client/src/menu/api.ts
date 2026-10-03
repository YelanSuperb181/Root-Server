// Where the menu gets what it shows, and runs what people pick: Blitz's
// server inside Root, or (in the browser preview, outside any community) a
// small made-up community, so the menu can be tried out.

import { blitzMenuServiceClient } from "@blitz/gen-client";
import type { AskResponse, CommandInfo, MemberCard, MemberLine, MenuOverview, RunResponse, TicketInfo, TicketThread } from "@blitz/gen-shared";

export type { AskResponse, CommandInfo, MemberCard, MemberLine, MenuOverview, RunResponse, TicketInfo, TicketThread };

export interface MenuApi {
  /** Made-up data (the browser preview), not a real community. */
  readonly demo: boolean;
  overview(): Promise<MenuOverview>;
  /** One of Blitz's commands, as if typed (`command` without the "!"). */
  run(command: string, args?: string, channelId?: string): Promise<RunResponse>;
  searchMembers(query: string): Promise<MemberLine[]>;
  member(userId: string): Promise<MemberCard>;
  /** A conversation with the team, in full. */
  ticket(id: number): Promise<TicketThread>;
  /** Writes in a conversation (as its member, or as the team). */
  ticketReply(id: number, text: string): Promise<TicketThread>;
  /** Ask Blitz (the team): a question about the community. Can take a while: Blitz looks things up. */
  ask(question: string): Promise<AskResponse>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    );
  });
}

/** The menu backed by Blitz's server. */
export function serverMenu(): MenuApi {
  const svc = blitzMenuServiceClient;
  return {
    demo: false,
    overview: () => withTimeout(svc.overview({}), 20_000),
    run: (command, args = "", channelId = "") => withTimeout(svc.run({ command, args, channelId }), 25_000),
    searchMembers: async (query) => (await withTimeout(svc.searchMembers({ query }), 10_000)).members,
    member: (userId) => withTimeout(svc.member({ userId }), 10_000),
    ticket: (id) => withTimeout(svc.ticket({ id }), 10_000),
    ticketReply: (id, text) => withTimeout(svc.ticketReply({ id, text }), 15_000),
    ask: (question) => withTimeout(svc.ask({ question }), 90_000),
  };
}

/**
 * The made-up community the browser preview shows, fetched only when it's
 * used: inside Root it's never needed, so it isn't part of the main bundle.
 */
export function demoMenu(): MenuApi {
  let loaded: Promise<MenuApi> | undefined;
  const real = () => (loaded ??= import("./demo").then((m) => m.demoMenu()));
  return {
    demo: true,
    overview: async () => (await real()).overview(),
    run: async (command, args, channelId) => (await real()).run(command, args, channelId),
    searchMembers: async (query) => (await real()).searchMembers(query),
    member: async (userId) => (await real()).member(userId),
    ticket: async (id) => (await real()).ticket(id),
    ticketReply: async (id, text) => (await real()).ticketReply(id, text),
    ask: async (question) => (await real()).ask(question),
  };
}

