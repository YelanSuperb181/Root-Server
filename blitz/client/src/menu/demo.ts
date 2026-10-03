// The browser preview's made-up community, "Stardust Café": everything the
// menu can show, with a little life in it (a busy month of chat, a few
// shield catches, conversations with the team, giveaways running), and
// every action answered the way Blitz would. Nothing here is real.

import { findCosmetic } from "@blitz/shared";
import type { MemberLine, MenuApi, MenuOverview, RunResponse, TicketInfo, TicketThread } from "./api";

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
const HOUR = 3_600_000;
const DAY = 86_400_000;

type Cmd = [name: string, category: string, level: string, summary: string, usage?: string, menu?: string];
const COMMANDS: Cmd[] = [
  ["help", "Community", "everyone", "This list, the commands in one category, or details about one command.", "[command | category]"],
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
  ["ticket", "Community", "everyone", "Talk privately with the team. Replies come to the Inbox in Blitz's menu.", "<what's up>"],
  ["appeal", "Community", "everyone", "Ask the team to look again at a warning, mute or kick on your record.", "<case number> <why>"],
  ["tldr", "Community", "everyone", "Blitz sums up what you missed in this channel.", "[how many messages]", "no"],
  ["poll", "Community", "everyone", "Start a reaction poll. Add a time like 30m or 2d to auto-close.", "[1h] Question? | Option | Option …", "channel"],
  ["cmds", "Community", "everyone", "This community's own commands."],
  ["blitz", "Community", "everyone", "A link into Blitz's domain."],
  ["rank", "Levels", "everyone", "Your level, XP and leaderboard spot (or someone else's).", "[@member]"],
  ["top", "Levels", "everyone", "The 10 most active members."],
  ["levels", "Levels", "everyone", "How levels work."],
  ["levelroles", "Levels", "everyone", "The roles you unlock by levelling up."],
  ["levelrole", "Levels", "mod", "Give a role to everyone who reaches a level.", "<level> @role | remove <level> | sync"],
  ["stardust", "Fun", "everyone", "Your Stardust, streak and Blitz's outfit.", "[@member | top]"],
  ["daily", "Fun", "everyone", "Collect today's Stardust gift (bigger every day in a row)."],
  ["shop", "Fun", "everyone", "Looks for your own Blitz, bought with Stardust."],
  ["buy", "Fun", "everyone", "Buy a look for your Blitz from the shop.", "<item>"],
  ["wear", "Fun", "everyone", "Change what your Blitz wears.", "<item> | none [hat | trail | glow]"],
  ["gift", "Fun", "everyone", "Give some of your Stardust to someone.", "@member <amount>"],
  ["giveaways", "Fun", "everyone", "Giveaways running now."],
  ["enter", "Fun", "everyone", "Enter a giveaway (same as reacting 🎉).", "<giveaway number>"],
  ["quote", "Fun", "everyone", "A random saved quote from the quote wall."],
  ["8ball", "Fun", "everyone", "Ask the magic 8-ball.", "<question>"],
  ["roll", "Fun", "everyone", "Roll dice.", "[d20 | 2d6+1 | 100]"],
  ["flip", "Fun", "everyone", "Flip a coin."],
  ["choose", "Fun", "everyone", "Can't decide? Let Blitz pick.", "<a | b | c>"],
  ["ping", "Fun", "everyone", "Check that Blitz is awake."],
  ["warnings", "Moderation", "everyone", "Your warnings (staff can check anyone's).", "[@member]"],
  ["warn", "Moderation", "mod", "Give someone a warning; the warning ladder may follow.", "@member <reason>"],
  ["unwarn", "Moderation", "mod", "Take back a case: a warning comes off their record, a mute ends, a ban is lifted.", "<case number> [why]"],
  ["note", "Moderation", "mod", "Add a private staff note to someone's history.", "@member <note>"],
  ["history", "Moderation", "mod", "Someone's full moderation history.", "@member"],
  ["mute", "Moderation", "mod", "Hide someone's messages for a while (1 hour unless you say).", "@member [1h] [reason]"],
  ["unmute", "Moderation", "mod", "End someone's mute early.", "@member"],
  ["kick", "Moderation", "mod", "Remove someone from the community (they can rejoin).", "@member [reason]"],
  ["ban", "Moderation", "mod", "Ban someone, for good or for a while (like 7d).", "@member [7d] [reason]"],
  ["unban", "Moderation", "mod", "Lift a ban.", "<@member or user ID>"],
  ["bans", "Moderation", "mod", "Who's banned, and why."],
  ["userinfo", "Moderation", "mod", "Who someone is here: roles, joined, level, warnings.", "[@member]"],
  ["lockdown", "Moderation", "mod", "Lock a channel (or every channel) so only the team can talk.", "[#channel | all] [30m] [reason]"],
  ["unlock", "Moderation", "mod", "Open a locked channel again.", "[#channel | all]"],
  ["slowmode", "Moderation", "mod", "Make people wait between messages in a channel.", "[#channel] <30s | 5m | off>"],
  ["raid", "Moderation", "mod", "The raid shield: see if it's up, raise it yourself, or end it.", "[on | off]"],
  ["guardian", "Moderation", "mod", "What Blitz's shields are doing."],
  ["inbox", "Moderation", "mod", "Open conversations with members.", "[number]"],
  ["reply", "Moderation", "mod", "Answer a member's conversation.", "<number> <message>"],
  ["close", "Moderation", "mod", "Close a conversation, with a note.", "<number> [note]"],
  ["accept", "Moderation", "mod", "Accept an appeal: the case is taken back.", "<appeal number> [note]"],
  ["reject", "Moderation", "mod", "Turn down an appeal, with a note.", "<appeal number> [note]"],
  ["ask", "Moderation", "mod", "Ask Blitz about the community.", "<question>"],
  ["settings", "Staff", "mod", "What Blitz is set up to do here."],
  ["announce", "Staff", "mod", "Post an announcement here or in another channel.", "[#channel] <message>", "channel"],
  ["event", "Staff", "mod", "Post an event here or in another channel.", "[#channel] <details>", "channel"],
  ["say", "Staff", "mod", "Post a message as Blitz.", "[#channel] <message>", "channel"],
  ["giveaway", "Staff", "mod", "Start a giveaway: members react 🎉 to enter.", "<how long> [N winners] <prize>", "channel"],
  ["gend", "Staff", "mod", "End a giveaway now and draw the winners.", "<giveaway number>"],
  ["reroll", "Staff", "mod", "Draw new winners for a finished giveaway.", "<giveaway number> [how many]"],
  ["clear", "Staff", "mod", "Delete the last messages in this channel.", "<1-49>", "no"],
  ["setxp", "Staff", "mod", "Set someone's XP.", "@member <xp> | @member level <n>"],
  ["addcmd", "Staff", "mod", "Make (or change) a command anyone can use.", "<name> <response>"],
  ["delcmd", "Staff", "mod", "Remove one of the community's commands.", "<name>"],
  ["approve", "Staff", "mod", "Approve a suggestion, with an optional note.", "<number> [note]"],
  ["deny", "Staff", "mod", "Turn down a suggestion, with an optional note.", "<number> [note]"],
];

/** A steady pseudo-random sequence, so the made-up month looks the same every time. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function demoPulse(now: number): NonNullable<MenuOverview["pulse"]> {
  const r = seeded(42);
  const days = Array.from({ length: 28 }, (_, i) => {
    const date = new Date(now - (27 - i) * DAY).toISOString().slice(0, 10);
    const weekday = new Date(now - (27 - i) * DAY).getUTCDay();
    const weekend = weekday === 5 || weekday === 6 ? 1.35 : 1;
    const growth = 1 + i * 0.012;
    const messages = Math.round((300 + r() * 140) * weekend * growth);
    return { date, messages, people: Math.round(36 + r() * 22 * growth), joins: Math.round(r() * 5 + (i > 20 ? 2 : 0)), leaves: Math.round(r() * 2.4), mod: Math.round(r() * 2.2), caught: Math.round(1 + r() * 6) };
  });
  const last = days.slice(-7);
  const before = days.slice(-14, -7);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const fromPeak = (hr: number) => Math.min(Math.abs(hr - 21), 24 - Math.abs(hr - 21));
  const hours = Array.from({ length: 24 }, (_, hr) => Math.round(120 + 900 * Math.exp(-(fromPeak(hr) ** 2) / 18) + 300 * Math.exp(-((hr - 15) ** 2) / 10) + r() * 60));
  return {
    days,
    weekMessages: sum(last.map((d) => d.messages)),
    weekPeople: 71,
    weekJoins: sum(last.map((d) => d.joins)),
    weekLeaves: sum(last.map((d) => d.leaves)),
    weekMod: sum(last.map((d) => d.mod)),
    weekCaught: sum(last.map((d) => d.caught)),
    hasChange: true,
    changeMessages: sum(last.map((d) => d.messages)) / sum(before.map((d) => d.messages)) - 1,
    changePeople: 0.09,
    topChannels: [
      ["#general", 4210],
      ["#gaming", 2140],
      ["#art", 1320],
      ["#events", 310],
      ["#announcements", 84],
    ].map(([name, messages]) => ({ name: name as string, messages: messages as number })),
    hours,
    health: 78,
    modKinds: [
      ["warn", 9],
      ["mute", 4],
      ["note", 3],
      ["kick", 1],
      ["ban", 1],
    ].map(([kind, count]) => ({ kind: kind as string, count: count as number })),
    caughtKinds: [
      ["spam", 12],
      ["newcomer", 7],
      ["duplicate", 6],
      ["scam", 5],
      ["caps", 3],
    ].map(([kind, count]) => ({ kind: kind as string, count: count as number })),
  };
}

interface DemoTicket {
  info: TicketInfo;
  thread: Array<{ from: string; name: string; text: string; at: number }>;
  about: string;
}

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
    reminders: [{ id: 3, text: "join the movie night 🍿", at: now + 2 * HOUR + 14 * 60_000 }],
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
        const d = new Date(now + (inDays as number) * DAY);
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
    myWarnings: 1,
    bans: [{ userId: "demo-spam", name: "FreeNitroBot", reason: "Scam links", until: 0 }],
    channels: [
      ["general", "Café"],
      ["art", "Café"],
      ["gaming", "Café"],
      ["announcements", "Info"],
      ["events", "Info"],
    ].map(([name, group], i) => ({ id: `demo-ch-${i}`, name, group })),
    stardust: {
      on: true,
      balance: 640,
      earned: 2310,
      streak: 4,
      dailyReady: true,
      nextDaily: now + 9 * HOUR,
      owned: ["partyhat", "frost"],
      hat: "partyhat",
      trail: "frost",
      glow: "",
      // The preview's visitor runs the made-up community, so every look is theirs to try.
      wardrobe: true,
      top: [
        ["demo-luna", 8120],
        ["demo-mira", 5430],
        ["demo-kai", 4980],
        [ME, 2310],
        ["demo-ivy", 1990],
      ].map(([userId, earned]) => ({ userId: userId as string, name: nameOf(userId as string), earned: earned as number })),
    },
    inbox: { on: true, mine: [], team: [] },
    giveaways: [
      { id: 4, prize: "500 stardust", winners: 3, endsAt: now + 2 * DAY + 3 * HOUR, entrants: 41, entered: true, channel: "general", ended: false, winnerNames: [] },
      { id: 3, prize: "Nitro Classic (1 month)", winners: 1, endsAt: now + 5 * HOUR + 20 * 60_000, entrants: 23, entered: false, channel: "events", ended: false, winnerNames: [] },
      { id: 2, prize: "A custom art commission by Mira", winners: 1, endsAt: now - 3 * DAY, entrants: 57, entered: true, channel: "art", ended: true, winnerNames: ["Oscar"] },
    ],
    guardian: {
      scamOn: true,
      raidOn: true,
      raidActive: false,
      raidUntil: 0,
      raidManual: false,
      raidHeld: 0,
      newcomerMinutes: 10,
      locks: [],
      slows: [{ channelId: "demo-ch-2", name: "#gaming", seconds: 15 }],
      catches: [
        ["scam", "demo-spam", "FreeNitroBot", "#general", 22, "lookalike of discord: dlscord-gift.com"],
        ["newcomer", "demo-x1", "pixelpal", "#art", 95, "link from a brand-new member"],
        ["spam", "demo-rook", "Rook", "#gaming", 180, "you're sending messages very quickly"],
        ["duplicate", "demo-rook", "Rook", "#gaming", 181, "you've posted the same message several times"],
        ["caps", "demo-jun", "Jun", "#general", 420, "that was a lot of capital letters"],
        ["word", "demo-x2", "edgelord99", "#general", 900, "that message contains a blocked word"],
        ["scam", "demo-x3", "steamgifts", "#events", 1600, "steam name on steam-rewards.ru with gift words (.ru)"],
      ].map(([kind, userId, name, channel, minsAgo, detail]) => ({ kind: kind as string, userId: userId as string, name: name as string, channel: channel as string, at: now - (minsAgo as number) * 60_000, detail: detail as string })),
      ladder: "3 warnings → mute (1h, growing) · 6 → kick · 8 → ban",
      strict: false,
      coolOff: true,
      automodOn: true,
      raidJoins: 8,
    },
    pulse: demoPulse(now),
    myCases: [{ id: 6, kind: "warn", reason: "Spoilers for the new movie in #general", by: "", at: now - 12 * DAY, durationMs: 0, revoked: false }],
    levelRewards: [
      { level: 5, roleName: "Regular", roleId: "demo-r5" },
      { level: 10, roleName: "Veteran", roleId: "demo-r10" },
      { level: 20, roleName: "Legend", roleId: "demo-r20" },
    ],
    brain: true,
    shieldUp: false,
  };
}

function demoTickets(now: number): DemoTicket[] {
  const t = (info: Partial<TicketInfo> & Pick<TicketInfo, "id" | "kind" | "subject" | "userId">, thread: DemoTicket["thread"], about = ""): DemoTicket => ({
    info: { status: "open", name: nameOf(info.userId), claimedBy: "", updatedAt: thread[thread.length - 1].at, unread: "", resolution: "", caseId: 0, messages: thread.length, triageSeverity: "", triageSummary: "", triageSuggestion: "", ...info },
    thread,
    about,
  });
  return [
    t(
      { id: 9, kind: "report", subject: "Rook keeps sending weird links to people", userId: "demo-kai", unread: "team", triageSeverity: "high", triageSummary: "Kai reports Rook sending people a 'free nitro' link in DMs and #gaming; the link in the reported message goes to a lookalike site.", triageSuggestion: "remove the link, mute 1h, and ask Rook to change their password (their account may be hacked)" },
      [{ from: "member", name: "Kai", text: "Rook keeps sending weird links to people, says it's free nitro. I think his account got hacked?\nReported message: \"free nitro for everyone 🎁 dlscord-gift.com/claim\"", at: now - 35 * 60_000 }],
    ),
    t(
      { id: 8, kind: "appeal", subject: "⚠️ Warning #14: Arguing in #general", userId: "demo-theo", caseId: 14, unread: "team" },
      [{ from: "member", name: "Theo", text: "I was quoting the rules back to someone who asked about them, not arguing. Could you take another look?", at: now - 3 * HOUR }],
      "⚠️ Warning #14: Arguing in #general",
    ),
    t(
      { id: 7, kind: "question", subject: "How do I get the Artist role?", userId: ME, claimedBy: "Luna", unread: "member" },
      [
        { from: "member", name: "You", text: "How do I get the Artist role? I can't find it anywhere.", at: now - 26 * HOUR },
        { from: "team", name: "Luna", text: "Hi! It's in the Roles part of Blitz's menu, or type !role artist anywhere 🎨", at: now - 25 * HOUR },
      ],
    ),
    t(
      { id: 5, kind: "question", subject: "Can we have a channel for music?", userId: "demo-ivy", status: "closed", resolution: "Made #music, enjoy!", claimedBy: "You" },
      [
        { from: "member", name: "Ivy", text: "Can we have a channel for music recs?", at: now - 4 * DAY },
        { from: "team", name: "You", text: "📪 The team closed this: Made #music, enjoy!", at: now - 3 * DAY },
      ],
    ),
  ];
}

const DEMO_ANSWERS: Array<[RegExp, string]> = [
  [/doing|health|week|how.?s/i, "**This week at Stardust Café** ✨\n- **2,940 messages**, up **18%** on last week, from **71 people**\n- **19 joined**, 6 left; the health score is **78** (thriving)\n- The shields caught **31** things: mostly spam in #gaming and **2 scam links** (both from hacked accounts)\n- Busiest time: around **9pm UTC**, Fridays and Saturdays"],
  [/warn|trouble|who.*most/i, "**Most warned this month**\n- **Rook**: 3 warnings (spam ×2, a scam link while hacked), muted once by the ladder\n- **Jun**: 1 warning (shouting in #general)\n- **Theo**: 1 warning (arguing), and he's appealed it (#8 in the inbox)\nNobody else has a standing warning."],
  [/inbox|waiting|ticket|appeal/i, "**Waiting on the team** 📬\n- **#9 Report** from **Kai** about Rook: 🔴 high · looks like Rook's account is hacked and sending fake Nitro links. Suggests a mute and a password reset.\n- **#8 Appeal** from **Theo** on warning #14: he says he was quoting the rules. The messages back him up; consider `!accept 8`."],
  [/general|happened|channel|today|catch/i, "**#general today** 📜\n- Mira shared her new comic page and everyone hyped it up\n- Plans for **Friday's movie night**: the vote is between *Spirited Away* and *Paprika*\n- Jun got a little shouty about a game patch (auto-mod caught it), all good since\n- Open question: will the art challenge theme be **'space'**? Ivy asked, nobody answered yet"],
];

/** The menu backed by a made-up community, for trying it out in the browser. */
export function demoMenu(): MenuApi {
  const state = demoState();
  const tickets = demoTickets(Date.now());
  let nextReminder = 4;
  let nextCase = 20;
  let nextTicket = 10;
  let nextGiveaway = 5;
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
  const channelFromArgs = (args: string) => {
    const m = /\[#([^\]]*)\]\(root:\/\/channel\/([^)\s]+)\)/.exec(args);
    return m ? { id: m[2], name: `#${m[1]}`, rest: args.replace(m[0], "").trim() } : undefined;
  };
  const durationMs = (text: string) => {
    const m = /^(\d+)\s*([smhdw])/i.exec(text.trim());
    return m ? Number(m[1]) * { s: 1000, m: 60_000, h: HOUR, d: DAY, w: 7 * DAY }[m[2].toLowerCase() as "m"] : 0;
  };
  const syncInbox = () => {
    state.inbox!.mine = tickets.filter((t) => t.info.userId === ME).map((t) => ({ ...t.info }));
    state.inbox!.team = tickets.filter((t) => t.info.status === "open" || t.info.status === "closed").map((t) => ({ ...t.info }));
  };
  syncInbox();
  const thread = (t: DemoTicket): TicketThread => ({ ticket: { ...t.info, messages: t.thread.length }, messages: t.thread.map((m) => ({ ...m, name: m.from === "team" && t.info.userId === ME ? m.name : m.name })), about: t.about });
  const openTicket = (kind: string, text: string, extra: Partial<TicketInfo> = {}, about = "") => {
    const id = nextTicket++;
    tickets.unshift({ info: { id, kind, subject: text.split("\n")[0].slice(0, 90), status: "open", userId: ME, name: "You", claimedBy: "", updatedAt: Date.now(), unread: "team", resolution: "", caseId: 0, messages: 1, triageSeverity: "", triageSummary: "", triageSuggestion: "", ...extra }, thread: [{ from: "member", name: "You", text, at: Date.now() }], about });
    syncInbox();
    return id;
  };
  const closeTicket = (idText: string, note: string, decision?: "accept" | "reject") => {
    const t = tickets.find((x) => x.info.id === Number(idText));
    if (!t) return no(`💡 There's no conversation #${idText}.`);
    if (decision && t.info.kind !== "appeal") return no(`💡 #${idText} isn't an appeal.`);
    const text = decision ? `${decision === "accept" ? "✅ Your appeal was accepted. The warning is off your record." : "❌ Your appeal was turned down."}${note ? ` ${note}` : ""}` : `📪 The team closed this${note ? `: ${note}` : "."}`;
    t.thread.push({ from: "team", name: "You", text, at: Date.now() });
    t.info.status = "closed";
    t.info.resolution = decision ? (decision === "accept" ? "accepted" : "turned down") : note || "closed";
    t.info.unread = "member";
    t.info.updatedAt = Date.now();
    if (decision === "accept" && t.info.caseId === 6) state.myCases[0].revoked = true;
    syncInbox();
    return say(decision ? `${decision === "accept" ? "✅ Accepted" : "❌ Turned down"} appeal #${t.info.id} from **${t.info.name}**.` : `📪 Closed #${t.info.id} with **${t.info.name}**.`);
  };

  const run = (command: string, args: string, channelId: string): RunResponse => {
    const pickRandom = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
    const channel = state.channels.find((c) => c.id === channelId);
    const dust = state.stardust!;
    const guard = state.guardian!;
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
        const id = nextReminder++;
        state.reminders.push({ id, text: m[3], at: Date.now() + durationMs(`${m[1]}${m[2]}`) });
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
      case "report": {
        const t = target(args);
        const id = openTicket("report", t ? t.rest : args, { userId: ME });
        return say(`🚩 Thanks [@You](root://user/demo-me), the team has been told. If they need more, they'll write to you in the Inbox (#${id}).`);
      }
      case "ticket": {
        if (args.length < 3) return no("💡 Write a little about what's up, so the team knows how to help.");
        const id = openTicket("question", args);
        return say(`📬 Sent privately to the team as #${id}. You'll get a notification when they answer.`);
      }
      case "appeal": {
        const [idText, ...why] = args.split(" ");
        const c = state.myCases.find((x) => x.id === Number(idText));
        if (!c) return no(`💡 Case #${idText} isn't one of yours.`);
        if (tickets.some((t) => t.info.caseId === c.id && t.info.status === "open")) return no(`💡 You've already appealed case #${c.id}; the team will get back to you.`);
        if (why.join(" ").length < 10) return no("💡 Say a little about why it should be taken back; it helps the team decide.");
        const id = openTicket("appeal", why.join(" "), { caseId: c.id, subject: `⚠️ Warning #${c.id}: ${c.reason}` }, `⚠️ Warning #${c.id}: ${c.reason}`);
        return say(`⚖️ Appeal sent as #${id}. The team will look at it and you'll get a notification with their answer.`);
      }
      case "close":
      case "accept":
      case "reject": {
        const [idText, ...note] = args.split(" ");
        return closeTicket(idText, note.join(" "), command === "close" ? undefined : command);
      }
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
      case "daily": {
        if (!dust.dailyReady) return say("🌙 You've had today's gift. The next one is ready in 9h.");
        dust.streak += 1;
        const amount = 50 + 10 * Math.min(dust.streak - 1, 10);
        dust.balance += amount;
        dust.earned += amount;
        dust.dailyReady = false;
        return say(`✨ +${amount} Stardust · 🔥 ${dust.streak}-day streak · you have ${dust.balance.toLocaleString()}.`);
      }
      case "buy": {
        const item = findCosmetic(args);
        if (!item) return no(`💡 There's nothing called "${args}" in the shop.`);
        if (dust.owned.includes(item.id)) return no(`💡 You already have the ${item.name}.`);
        if (dust.balance < item.price) return no(`💡 The ${item.name} costs ${item.price} ✨ and you have ${dust.balance}. Keep chatting, and grab your daily gift!`);
        dust.balance -= item.price;
        dust.owned.push(item.id);
        dust[item.slot] = item.id;
        return say(`🛍️ Your Blitz is now wearing the **${item.icon} ${item.name}**! (${dust.balance} ✨ left)`);
      }
      case "wear": {
        const [first, second] = args.split(" ");
        if (/^none$/i.test(first)) {
          const slot = (["hat", "trail", "glow"] as const).find((s) => s === second);
          if (slot) dust[slot] = "";
          else dust.hat = dust.trail = dust.glow = "";
          return say(slot ? `🪄 Took off the ${slot}.` : "🪄 Your Blitz is back to its plain glowing self.");
        }
        const items = args.split(",").map((name) => findCosmetic(name.trim()));
        if (items.length === 0 || items.some((item) => !item)) return no("💡 There's nothing like that in the shop.");
        const looks = items as NonNullable<(typeof items)[number]>[];
        if (!state.stardust!.wardrobe && looks.some((item) => !dust.owned.includes(item.id))) return no("💡 You don't have that one yet.");
        for (const item of looks) dust[item.slot] = item.id;
        return say(`🪄 Your Blitz put on the ${looks.map((item) => `**${item.icon} ${item.name}**`).join(", ")}.`);
      }
      case "enter": {
        const g = state.giveaways.find((x) => x.id === Number(args));
        if (!g || g.ended) return no("💡 That giveaway isn't running.");
        if (!g.entered) {
          g.entered = true;
          g.entrants++;
        }
        return say(`🎉 You're in giveaway #${g.id} for **${g.prize}**! Good luck. (${g.entrants} entries so far)`);
      }
      case "giveaway": {
        if (!channel) return no("📍 Pick a channel for it first.");
        const ms = durationMs(args);
        const rest = args.replace(/^\d+\s*[smhdw]\w*\s*/i, "");
        const w = /^(\d+)\s*winners?\s*/i.exec(rest);
        const prize = w ? rest.slice(w[0].length) : rest;
        if (!ms || !prize) return no("💡 Usage: `!giveaway 1d 2 winners Nitro` (from 1 minute to 30 days).");
        const id = nextGiveaway++;
        state.giveaways.unshift({ id, prize, winners: w ? Number(w[1]) : 1, endsAt: Date.now() + ms, entrants: 0, entered: false, channel: channel.name, ended: false, winnerNames: [] });
        return say(`🎉 Giveaway #${id} is up in [#${channel.name}](root://channel/${channel.id})!`);
      }
      case "gend": {
        const g = state.giveaways.find((x) => x.id === Number(args));
        if (!g || g.ended) return no("💡 That giveaway isn't running.");
        g.ended = true;
        g.endsAt = Date.now();
        g.winnerNames = PEOPLE.filter((p) => p.userId !== ME).sort(() => Math.random() - 0.5).slice(0, g.winners).map((p) => p.name);
        return say(`🎉 Giveaway #${g.id} is over: ${g.winnerNames.join(", ")} won!`);
      }
      case "lockdown": {
        const ch = channelFromArgs(args);
        const all = /^all\b/i.test(args);
        if (!ch && !all) return no("💡 Say which channel, or `all`.");
        const rest = ch ? ch.rest : args.replace(/^all\s*/i, "");
        const ms = durationMs(rest);
        guard.locks = guard.locks.filter((l) => l.channelId !== (all ? "all" : ch!.id));
        guard.locks.push({ channelId: all ? "all" : ch!.id, name: all ? "every channel" : ch!.name, until: ms ? Date.now() + ms : 0, reason: rest.replace(/^\d+\s*[smhdw]\w*\s*/i, "") });
        state.shieldUp = guard.raidActive || guard.locks.some((l) => l.channelId === "all");
        return say(`🔒 Locked ${all ? "every channel" : ch!.name}${ms ? ` for ${rest.split(" ")[0]}` : ""}. \`!unlock\` opens it again.`);
      }
      case "unlock": {
        const ch = channelFromArgs(args);
        const all = /^all\b/i.test(args) || !ch;
        guard.locks = all ? [] : guard.locks.filter((l) => l.channelId !== ch!.id);
        state.shieldUp = guard.raidActive;
        return say(`🔓 Opened ${all ? "everything" : ch!.name}.`);
      }
      case "slowmode": {
        const ch = channelFromArgs(args);
        if (!ch) return no("💡 Say which channel.");
        guard.slows = guard.slows.filter((x) => x.channelId !== ch.id);
        if (/^off/i.test(ch.rest)) return say(`🐇 Slowmode is off in ${ch.name}.`);
        const ms = durationMs(ch.rest);
        if (ms < 2000) return no("💡 Give a wait between 2 seconds and 6 hours, like `30s`.");
        guard.slows.push({ channelId: ch.id, name: ch.name, seconds: ms / 1000 });
        return say(`🐢 Slowmode in ${ch.name}: one message every ${ch.rest.split(" ")[0]}.`);
      }
      case "raid": {
        if (/^on/i.test(args)) {
          guard.raidActive = guard.raidManual = true;
          guard.raidHeld = 0;
          state.shieldUp = true;
          return say("🚨 Raid shield up. Anyone who joins now can't post links or mentions, and posts slowly. `!raid off` ends it.");
        }
        if (/^off/i.test(args)) {
          guard.raidActive = guard.raidManual = false;
          state.shieldUp = guard.locks.some((l) => l.channelId === "all");
          return say("🛡️ Raid shield down.");
        }
        return say(guard.raidActive ? "🚨 The raid shield is up." : "🛡️ All calm: the raid shield is watching.");
      }
      case "levelrole": {
        const [first, ...rest] = args.split(" ");
        if (/^remove$/i.test(first)) {
          state.levelRewards = state.levelRewards.filter((r) => r.level !== Number(rest[0]));
          return say(`🗑️ Removed the level ${rest[0]} reward.`);
        }
        const level = Number(first);
        const role = rest.join(" ").replace(/^@/, "");
        if (!level || !role) return no("💡 Usage: `!levelrole 10 @Regular`.");
        state.levelRewards = [...state.levelRewards.filter((r) => r.level !== level), { level, roleName: role, roleId: `demo-r${level}` }].sort((a, b) => a.level - b.level);
        return say(`🎁 Reaching level **${level}** now unlocks **${role}**.`);
      }
      case "warn":
      case "mute":
      case "kick":
      case "ban":
      case "note": {
        const t = target(args);
        if (!t) return no("💡 Mention who it's for.");
        const ms = durationMs(t.rest) || (command === "mute" ? HOUR : 0);
        const reason = t.rest.replace(/^\d+\s*[smhdw]\w*\s*/i, "");
        const c = addCase(t.userId, command, reason, ms);
        if (command === "mute") muted.set(t.userId, Date.now() + ms);
        const verb = { warn: "⚠️ has been warned", mute: "🔇 is muted", kick: "👢 was kicked", ban: "🔨 was banned", note: "📝 has a new note" }[command];
        const warns = (cases.get(t.userId) ?? []).filter((x) => x.kind === "warn" && !x.revoked).length;
        const ladder = command === "warn" && warns === 3 ? "\n🔇 That's 3 warnings, so Blitz muted them for 1h." : "";
        if (ladder) {
          addCase(t.userId, "mute", "automatic: 3 standing warnings", HOUR);
          muted.set(t.userId, Date.now() + HOUR);
        }
        return say(`${who(t.userId)} ${verb}${reason ? `: ${reason}` : ""} _(case #${c.id})_${ladder}`);
      }
      case "unmute": {
        const t = target(args);
        if (t) muted.delete(t.userId);
        return say(`🔊 ${who(t?.userId ?? "")} can talk again.`);
      }
      case "unwarn":
        for (const list of cases.values()) for (const c of list) if (c.id === Number(args.split(" ")[0])) c.revoked = true;
        return say(`↩️ Took back case #${args.split(" ")[0]}.`);
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
        return say("⚠️ **You** · 1 warning\n**#6** ⚠️ Warning · 12d ago · by Luna: Spoilers for the new movie in #general");
      case "settings":
        return say(
          "🛠️ **Blitz's settings here**\n\nWelcomes: [#general](root://channel/demo-ch-0)\nLevel-ups: where they happen\nQuote wall: [#quotes](root://channel/demo-q)\nBirthdays: [#general](root://channel/demo-ch-0)\nSuggestions: [#ideas](root://channel/demo-ideas)\nStaff log: [#mod-log](root://channel/demo-log)\nRoles people can pick: Gamer, Artist, Night Owl, Movie Nights, Event Pings\nLevels: on · Quote wall needs 3 🗣️\nAuto-mod: on · Blocked words: 4 · Invite links: blocked · Stricter filters: off · Cool-offs: on\nScam shield: on · Raid shield: on (8 joins a minute) · Newcomer links after: 10 minutes\nWarning ladder: 3 warnings → mute (1h, growing) · 6 → kick · 8 → ban · Members told about moderation: yes\nInbox: on · Stardust: on · Brain helps moderate: yes\n\n_Change these in Blitz's App settings in Root._",
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
          joinedAt: Date.now() - (40 + userId.length * 9) * DAY,
          level,
          messages: level * 61,
          warnings: list.filter((c) => c.kind === "warn" && !c.revoked).length,
          cases: [...list],
          mutedUntil: (muted.get(userId) ?? 0) > Date.now() ? muted.get(userId)! : 0,
          access: "everyone",
        };
      }),
    ticket: (id) =>
      later(() => {
        const t = tickets.find((x) => x.info.id === id);
        if (!t) return { ticket: undefined, messages: [], about: "" };
        if ((t.info.userId === ME && t.info.unread === "member") || (t.info.userId !== ME && t.info.unread === "team")) t.info.unread = "";
        syncInbox();
        return thread(t);
      }, 180),
    ticketReply: (id, text) =>
      later(() => {
        const t = tickets.find((x) => x.info.id === id)!;
        const mine = t.info.userId === ME;
        t.thread.push({ from: mine ? "member" : "team", name: "You", text, at: Date.now() });
        t.info.status = "open";
        t.info.unread = mine ? "team" : "member";
        t.info.updatedAt = Date.now();
        if (!mine && !t.info.claimedBy) t.info.claimedBy = "You";
        syncInbox();
        return thread(t);
      }, 220),
    ask: (question) =>
      later(() => ({ ok: true, answer: DEMO_ANSWERS.find(([re]) => re.test(question))?.[1] ?? "🔮 In the preview I only know a few answers. Try asking **how the community's doing**, **who's been warned most**, **what's waiting in the inbox**, or **what happened in #general today**." }), 1600),
  };
}

