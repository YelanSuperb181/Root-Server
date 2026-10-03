// Where the menu gets what it shows, and runs what people pick: Blitz's
// server inside Root, or (in the browser preview, outside any community) a
// small made-up community, so the menu can be tried out.

import { blitzMenuServiceClient } from "@blitz/gen-client";
import type { CommandInfo, MemberCard, MemberLine, MenuOverview, RunResponse } from "@blitz/gen-shared";

export type { CommandInfo, MemberCard, MemberLine, MenuOverview, RunResponse };

export interface MenuApi {
  /** Made-up data (the browser preview), not a real community. */
  readonly demo: boolean;
  overview(): Promise<MenuOverview>;
  /** One of Blitz's commands, as if typed (`command` without the "!"). */
  run(command: string, args?: string, channelId?: string): Promise<RunResponse>;
  searchMembers(query: string): Promise<MemberLine[]>;
  member(userId: string): Promise<MemberCard>;
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
    overview: () => withTimeout(svc.overview({}), 15_000),
    run: (command, args = "", channelId = "") => withTimeout(svc.run({ command, args, channelId }), 25_000),
    searchMembers: async (query) => (await withTimeout(svc.searchMembers({ query }), 10_000)).members,
    member: (userId) => withTimeout(svc.member({ userId }), 10_000),
  };
}

// ---- The preview's made-up community ---------------------------------------------

const ME = "demo-me";
const PEOPLE: MemberLine[] = [
  ["demo-luna", "Luna"],
  ["demo-kai", "Kai"],
  ["demo-mira", "Mira"],
  ["demo-theo", "Theo"],
  ["demo-ivy", "Ivy"],
  ["demo-oscar", "Oscar"],
  ["demo-nova", "Nova"],
  ["demo-jun", "Jun"],
  ["demo-sage", "Sage"],
  ["demo-rook", "Rook"],
  ["demo-pip", "Pip"],
  [ME, "You"],
].map(([userId, name]) => ({ userId, name }));

const nameOf = (id: string) => PEOPLE.find((p) => p.userId === id)?.name ?? "someone";

type Cmd = [name: string, category: string, level: string, summary: string, usage?: string, menu?: string];
const COMMANDS: Cmd[] = [
  ["help", "Community", "everyone", "This list, or details about one command.", "[command]"],
  ["server", "Community", "everyone", "A quick look at the community."],
  ["roles", "Community", "everyone", "Roles you can give yourself."],
  ["role", "Community", "everyone", "Give yourself one of the pickable roles, or take it off.", "<role name>"],
  ["remind", "Community", "everyone", "A reminder, like `2h stretch` or `in 30 minutes check the oven`.", "<when> <what>"],
  ["reminders", "Community", "everyone", "Your upcoming reminders."],
  ["forget", "Community", "everyone", "Cancel one of your reminders.", "<reminder number>"],
  ["birthday", "Community", "everyone", "Save your birthday for a shout-out on the day (no year needed).", "[July 14 | 07-14 | remove]"],
  ["birthdays", "Community", "everyone", "Upcoming birthdays."],
  ["suggest", "Community", "everyone", "Suggest something for the community; everyone can vote on it.", "<your idea>"],
  ["report", "Community", "everyone", "Quietly tell the team about a problem.", "[@member] <what happened>"],
  ["poll", "Community", "everyone", "Start a reaction poll. Add a time like 30m or 2d to auto-close.", "[1h] Question? | Option | Option …", "channel"],
  ["cmds", "Community", "everyone", "This community's own commands."],
  ["blitz", "Community", "everyone", "A link into Blitz's domain."],
  ["rank", "Levels", "everyone", "Your level, XP and leaderboard spot (or someone else's).", "[@member]"],
  ["top", "Levels", "everyone", "The 10 most active members."],
  ["levels", "Levels", "everyone", "How levels work."],
  ["quote", "Fun", "everyone", "A random saved quote from the quote wall."],
  ["8ball", "Fun", "everyone", "Ask the magic 8-ball.", "<question>"],
  ["roll", "Fun", "everyone", "Roll dice.", "[d20 | 2d6+1 | 100]"],
  ["flip", "Fun", "everyone", "Flip a coin."],
  ["choose", "Fun", "everyone", "Can't decide? Let Blitz pick.", "<a | b | c>"],
  ["ping", "Fun", "everyone", "Check that Blitz is awake."],
  ["warnings", "Moderation", "everyone", "Your warnings (staff can check anyone's).", "[@member]"],
  ["warn", "Moderation", "mod", "Give someone a warning; it's kept in their history.", "@member <reason>"],
  ["unwarn", "Moderation", "mod", "Take back a warning.", "<case number>"],
  ["note", "Moderation", "mod", "Add a private staff note to someone's history.", "@member <note>"],
  ["history", "Moderation", "mod", "Someone's full moderation history.", "@member"],
  ["mute", "Moderation", "mod", "Hide someone's messages for a while (1 hour unless you say).", "@member [1h] [reason]"],
  ["unmute", "Moderation", "mod", "End someone's mute early.", "@member"],
  ["kick", "Moderation", "mod", "Remove someone from the community (they can rejoin).", "@member [reason]"],
  ["ban", "Moderation", "mod", "Ban someone, for good or for a while (like 7d).", "@member [7d] [reason]"],
  ["unban", "Moderation", "mod", "Lift a ban.", "<@member or user ID>"],
  ["bans", "Moderation", "mod", "Who's banned, and why."],
  ["userinfo", "Moderation", "mod", "Who someone is here: roles, joined, level, warnings.", "[@member]"],
  ["settings", "Staff", "mod", "What Blitz is set up to do here."],
  ["announce", "Staff", "mod", "Post an announcement here or in another channel.", "[#channel] <message>", "channel"],
  ["event", "Staff", "mod", "Post an event here or in another channel.", "[#channel] <details>", "channel"],
  ["say", "Staff", "mod", "Post a message as Blitz.", "[#channel] <message>", "channel"],
  ["clear", "Staff", "mod", "Delete the last messages in this channel.", "<1-49>", "no"],
  ["setxp", "Staff", "mod", "Set someone's XP.", "@member <xp> | @member level <n>"],
  ["addcmd", "Staff", "mod", "Make (or change) a command anyone can use.", "<name> <response>"],
  ["delcmd", "Staff", "mod", "Remove one of the community's commands.", "<name>"],
  ["approve", "Staff", "mod", "Approve a suggestion, with an optional note.", "<number> [note]"],
  ["deny", "Staff", "mod", "Turn down a suggestion, with an optional note.", "<number> [note]"],
];

function demoState(): MenuOverview {
  const now = Date.now();
  return {
    userId: ME,
    name: "You",
    access: "admin",
    community: "Stardust Café",
    about: "A cozy corner for night owls, gamers and artists. Be kind, share what you make, and say hi to Blitz!",
    members: 248,
    levels: {
      on: true,
      level: 7,
      xp: 2140,
      into: 310,
      needed: 655,
      messages: 412,
      place: 6,
      top: [
        ["demo-luna", 14, 9820],
        ["demo-kai", 12, 7410],
        ["demo-mira", 11, 6380],
        ["demo-theo", 9, 4120],
        ["demo-ivy", 8, 3010],
        [ME, 7, 2140],
        ["demo-oscar", 6, 1730],
        ["demo-nova", 5, 1290],
        ["demo-jun", 4, 960],
        ["demo-sage", 3, 610],
      ].map(([userId, level, xp]) => ({ userId: userId as string, name: nameOf(userId as string), level: level as number, xp: xp as number })),
      how: "You earn 15-25 XP for chatting, at most once every 60 seconds, so quality beats spam. Level 5 takes 1,000 XP, level 10 takes 4,000.",
    },
    roles: [
      ["Gamer", "#7C5CFF", true],
      ["Artist", "#FF7AB6", false],
      ["Night Owl", "#3FB8FF", true],
      ["Movie Nights", "#FFB84D", false],
      ["Event Pings", "#5EE0A0", false],
      ["she/her", "#C9A7FF", false],
      ["he/him", "#8FD3FF", false],
      ["they/them", "#FFD27A", false],
    ].map(([name, color, mine], i) => ({ id: `demo-role-${i}`, name: name as string, color: color as string, mine: mine as boolean })),
    reminders: [{ id: 3, text: "join the movie night 🍿", at: now + 2 * 3600_000 + 14 * 60_000 }],
    birthday: {
      on: true,
      month: 7,
      day: 14,
      upcoming: [
        ["demo-mira", 0],
        ["demo-pip", 3],
        ["demo-theo", 11],
        ["demo-luna", 26],
      ].map(([userId, inDays]) => {
        const d = new Date(now + (inDays as number) * 86_400_000);
        return { userId: userId as string, name: nameOf(userId as string), month: d.getUTCMonth() + 1, day: d.getUTCDate(), inDays: inDays as number };
      }),
    },
    commands: COMMANDS.map(([name, category, level, summary, usage = "", menu = ""]) => ({ name, aliases: [], usage, summary, level, category, menu })),
    customs: [
      { name: "rules", response: "1. Be kind 💛\n2. No spam or self-promo outside #showcase\n3. Keep it cozy", uses: 41 },
      { name: "faq", response: "Movie nights are Fridays at 8pm UTC in **#voice-lounge**. Art challenges drop every Monday!", uses: 17 },
      { name: "socials", response: "Find us at [stardust.cafe](https://example.com) ✨", uses: 6 },
    ],
    suggestionsOn: true,
    reportsOn: true,
    suggestions: [
      { id: 12, userId: "demo-kai", name: "Kai", text: "A weekly pixel art challenge with a themed prompt", status: "open", note: "" },
      { id: 11, userId: "demo-ivy", name: "Ivy", text: "Lo-fi listening party on Sundays", status: "approved", note: "Starting this week!" },
      { id: 10, userId: "demo-rook", name: "Rook", text: "A channel just for memes", status: "denied", note: "We'll keep memes in #off-topic for now." },
    ],
    myWarnings: 0,
    bans: [{ userId: "demo-spam", name: "FreeNitroBot", reason: "Scam links", until: 0 }],
    channels: [
      ["general", "Café"],
      ["art", "Café"],
      ["gaming", "Café"],
      ["announcements", "Info"],
      ["events", "Info"],
    ].map(([name, group], i) => ({ id: `demo-ch-${i}`, name, group })),
  };
}

/** The menu backed by a made-up community, for trying it out in the browser. */
export function demoMenu(): MenuApi {
  const state = demoState();
  let nextReminder = 4;
  let nextCase = 20;
  const cases = new Map<string, Array<{ id: number; kind: string; reason: string; by: string; at: number; durationMs: number; revoked: boolean }>>();
  const muted = new Map<string, number>();
  const say = (...replies: string[]): RunResponse => ({ ok: true, replies });
  const no = (reply: string): RunResponse => ({ ok: false, replies: [reply] });
  const target = (args: string) => {
    const m = /^(demo-[\w-]+)\s*/.exec(args);
    return m ? { userId: m[1], rest: args.slice(m[0].length) } : undefined;
  };
  const addCase = (userId: string, kind: string, reason: string, durationMs = 0) => {
    const list = cases.get(userId) ?? [];
    const c = { id: nextCase++, kind, reason, by: "You", at: Date.now(), durationMs, revoked: false };
    list.push(c);
    cases.set(userId, list);
    return c;
  };
  const who = (id: string) => `[@${nameOf(id)}](root://user/${id})`;

  const run = (command: string, args: string, channelId: string): RunResponse => {
    const pickRandom = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
    const channel = state.channels.find((c) => c.id === channelId);
    switch (command) {
      case "role": {
        const role = state.roles.find((r) => r.name.toLowerCase() === args.trim().toLowerCase());
        if (!role) return no("💡 That isn't one of the pickable roles.");
        role.mine = !role.mine;
        return say(role.mine ? `➕ You're now **${role.name}**!` : `➖ Took off **${role.name}**.`);
      }
      case "remind": {
        const m = /^(\d+)([mhdw])\s+(.+)$/i.exec(args.trim());
        if (!m) return no("💡 Usage: `!remind 2h take a break` (m, h, d or w).");
        const ms = Number(m[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[m[2].toLowerCase() as "m"];
        const id = nextReminder++;
        state.reminders.push({ id, text: m[3], at: Date.now() + ms });
        state.reminders.sort((a, b) => a.at - b.at);
        return say(`⏰ Got it! I'll remind you ${m[1]}${m[2]} from now with a notification. _(reminder ${id})_`);
      }
      case "forget": {
        const id = Number(args);
        state.reminders = state.reminders.filter((r) => r.id !== id);
        return say(`🗑️ Forgot reminder ${id}.`);
      }
      case "birthday": {
        if (/^remove$/i.test(args.trim())) {
          state.birthday!.month = state.birthday!.day = 0;
          return say("🗑️ Birthday forgotten.");
        }
        const m = /^(\d{1,2})-(\d{1,2})$/.exec(args.trim());
        if (!m) return no("💡 I couldn't read that date.");
        state.birthday!.month = Number(m[1]);
        state.birthday!.day = Number(m[2]);
        return say(`🎉 Got it! I'll celebrate you on **${new Date(2000, Number(m[1]) - 1, Number(m[2])).toLocaleDateString(undefined, { month: "long", day: "numeric" })}**.`);
      }
      case "suggest": {
        const id = Math.max(...state.suggestions.map((s) => s.id)) + 1;
        state.suggestions.unshift({ id, userId: ME, name: "You", text: args, status: "open", note: "" });
        return say(`💡 Thanks! Posted as suggestion #${id} in [#ideas](root://channel/demo-ideas).`);
      }
      case "approve":
      case "deny": {
        const [idText, ...note] = args.split(" ");
        const s = state.suggestions.find((x) => x.id === Number(idText));
        if (!s) return no(`💡 There's no suggestion #${idText}.`);
        s.status = command === "approve" ? "approved" : "denied";
        s.note = note.join(" ");
        return say(`Done: suggestion #${s.id} is ${command === "approve" ? "approved ✅" : "turned down ❌"}.`);
      }
      case "report":
        return say("🚩 Thanks [@You](root://user/demo-me), the team has been told.");
      case "flip":
        return say(`🪙 **${Math.random() < 0.5 ? "Heads" : "Tails"}!**`);
      case "roll": {
        const sides = Number(/d?(\d+)/.exec(args)?.[1] ?? 20) || 20;
        return say(`🎲 d${sides} → **${1 + Math.floor(Math.random() * sides)}**`);
      }
      case "8ball":
        return say(`🎱 _${args}_\n**${pickRandom(["It is certain.", "Ask again later.", "Signs point to yes.", "Don't count on it.", "The stars say… maybe ✨"])}**`);
      case "choose": {
        const options = args.split("|").map((s) => s.trim()).filter(Boolean);
        return options.length < 2 ? no("💡 Give me at least two options: `pizza | tacos`") : say(`🤔 I choose… **${pickRandom(options)}**!`);
      }
      case "ping":
        return say("🏓 Pong! ✨");
      case "quote":
        return say('🗣️ "the moon is just the sun\'s night light"\n— **Luna** · [Jump to message](https://example.com)');
      case "warn":
      case "mute":
      case "kick":
      case "ban":
      case "note": {
        const t = target(args);
        if (!t) return no("💡 Mention who it's for.");
        const dur = /^(\d+)([mhdw])\s*/.exec(t.rest);
        const ms = dur ? Number(dur[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[dur[2] as "m"] : command === "mute" ? 3_600_000 : 0;
        const reason = dur ? t.rest.slice(dur[0].length) : t.rest;
        const c = addCase(t.userId, command, reason, ms);
        if (command === "mute") muted.set(t.userId, Date.now() + ms);
        const verb = { warn: "⚠️ has been warned", mute: "🔇 is muted", kick: "👢 was kicked", ban: "🔨 was banned", note: "📝 has a new note" }[command];
        return say(`${who(t.userId)} ${verb}${reason ? `: ${reason}` : ""} _(case #${c.id})_`);
      }
      case "unmute": {
        const t = target(args);
        if (t) muted.delete(t.userId);
        return say(`🔊 ${who(t?.userId ?? "")} can talk again.`);
      }
      case "unwarn":
        for (const list of cases.values()) for (const c of list) if (c.id === Number(args)) c.revoked = true;
        return say(`↩️ Took back warning #${args}.`);
      case "unban":
        state.bans = state.bans.filter((b) => b.userId !== args.trim());
        return say("🕊️ Lifted the ban.");
      case "addcmd": {
        const [name, ...rest] = args.split(" ");
        const existing = state.customs.find((c) => c.name === name.toLowerCase());
        if (existing) existing.response = rest.join(" ");
        else state.customs.push({ name: name.toLowerCase(), response: rest.join(" "), uses: 0 });
        state.customs.sort((a, b) => a.name.localeCompare(b.name));
        return say(`${existing ? "✏️ Updated" : "✅ Made"} \`!${name.toLowerCase()}\`. Try it!`);
      }
      case "delcmd":
        state.customs = state.customs.filter((c) => c.name !== args.trim());
        return say(`🗑️ Removed \`!${args.trim()}\`.`);
      case "announce":
      case "event":
      case "say":
      case "poll":
        return channel ? say(`✅ Posted in [#${channel.name}](root://channel/${channel.id})!`) : no("📍 Pick a channel for it first.");
      case "warnings":
        return say("✨ You have no warnings.");
      case "settings":
        return say(
          "🛠️ **Blitz's settings here**",
          "",
          "Welcomes: [#general](root://channel/demo-ch-0)\nLevel-ups: where they happen\nQuote wall: [#quotes](root://channel/demo-q)\nBirthdays: [#general](root://channel/demo-ch-0)\nSuggestions: [#ideas](root://channel/demo-ideas)\nStaff log: [#mod-log](root://channel/demo-log)\nRoles people can pick: Gamer, Artist, Night Owl, Movie Nights, Event Pings\nLevels: on · Quote wall needs 3 🗣️\nAuto-mod: on · Blocked words: 4 · Invite links: blocked\n\n_Change these in Blitz's App settings in Root._",
        );
      default: {
        const custom = state.customs.find((c) => c.name === command);
        if (custom) {
          custom.uses++;
          return say(custom.response);
        }
        const known = COMMANDS.find((c) => c[0] === command);
        return known ? say(`✨ (In the preview, \`!${command}\` would answer here, just like in chat.)`) : no(`🤷 I don't know \`!${command}\`.`);
      }
    }
  };

  const later = <T>(value: () => T, ms = 260) => new Promise<T>((resolve) => setTimeout(() => resolve(value()), ms));
  return {
    demo: true,
    overview: () => later(() => structuredClone(state), 380),
    run: (command, args = "", channelId = "") => later(() => run(command, args.trim(), channelId)),
    searchMembers: (query) => later(() => PEOPLE.filter((p) => p.userId !== ME && p.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 12), 150),
    member: (userId) =>
      later(() => {
        const list = cases.get(userId) ?? [];
        const level = state.levels!.top.find((t) => t.userId === userId)?.level ?? 2;
        return {
          userId,
          name: nameOf(userId),
          roles: ["Gamer", "Night Owl"].slice(0, 1 + (userId.length % 2)),
          joinedAt: Date.now() - (40 + userId.length * 9) * 86_400_000,
          level,
          messages: level * 61,
          warnings: list.filter((c) => c.kind === "warn" && !c.revoked).length,
          cases: [...list],
          mutedUntil: (muted.get(userId) ?? 0) > Date.now() ? muted.get(userId)! : 0,
          access: "everyone",
        };
      }),
  };
}
