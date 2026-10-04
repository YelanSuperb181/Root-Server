import { test } from "node:test";
import assert from "node:assert/strict";
import { WitsKnowledge, parseReminder, solveSum, wits } from "@blitz/shared";

const ch = (name: string, topic?: string) => ({ name, topic, mention: `<#${name}>` });

function community(over: Partial<WitsKnowledge> = {}): WitsKnowledge {
  return {
    botName: "Blitz",
    prefix: "!",
    community: "Stardust Café",
    about: "A cozy corner for night owls, gamers and artists.",
    members: 248,
    channels: [ch("general", "Chat about anything"), ch("🎨・art-showcase", "Share your drawings"), ch("gaming", "Games, LFG and clips"), ch("music"), ch("memes"), ch("rules"), ch("announcements"), ch("introductions"), ch("pets")],
    commands: [
      { name: "poll", aliases: [], summary: "Start a poll people vote on with reactions.", usage: "<time> <question> | <option>" },
      { name: "suggest", aliases: ["idea"], summary: "Suggest an idea for the community to vote on.", usage: "<idea>" },
    ],
    customs: [
      { name: "rules", response: "1. Be kind\n2. No spam" },
      { name: "socials", response: "Find us at stardust.cafe" },
      { name: "movienight", response: "Movie nights are Fridays at 8pm UTC!" },
    ],
    selfRoles: ["Gamer", "Artist", "Night Owl"],
    levelRewards: [{ level: 10, role: "Veteran" }],
    levels: { level: 7, xp: 2140, into: 310, needed: 655, place: 6, how: "You earn XP for chatting." },
    top: ["Luna", "Kai", "Mira"],
    stardust: { balance: 640, streak: 4, dailyReady: true },
    on: { inbox: true, birthdays: true, suggestions: true },
    asker: "Ana",
    where: "chat",
    now: Date.UTC(2026, 9, 4, 21, 4),
    ...over,
  };
}

const ask = (text: string, over: Partial<WitsKnowledge> = {}) => wits(text, community(over), undefined, () => 0);

test("where to post: the channel whose name (or topic) fits, even through other words for it", () => {
  assert.equal(ask("blitz where do i post my art?").reply.includes("<#🎨・art-showcase>"), true);
  assert.equal(ask("where can I share my drawings").reply.includes("<#🎨・art-showcase>"), true);
  assert.equal(ask("which channel is for memes?").reply.includes("<#memes>"), true);
  assert.equal(ask("where do i introduce myself").reply.includes("<#introductions>"), true);
  assert.equal(ask("where do i post clips").reply.includes("<#gaming>"), true, "a channel's topic counts too");
  const none = ask("where do i post knitting");
  assert.equal(none.intent, "where");
  assert.match(none.reply, /<#general>/, "nothing fits: the general channel is a safe bet");
  // In the speech bubble, a channel reads as "#name".
  assert.match(wits("where do i post memes", community({ where: "domain" }), undefined, () => 0).say, /#memes/);
});

test("a follow-up asks the same thing about something else", () => {
  const first = ask("where do i post my art?");
  const next = wits("and music?", community(), { intent: first.intent, topic: first.topic, at: community().now }, () => 0);
  assert.match(next.reply, /<#music>/);
  const stale = wits("and music?", community(), { intent: "where", at: community().now - 600_000 }, () => 0);
  assert.notEqual(stale.intent, "where", "too long ago to be a follow-up");
});

test("the community's own commands answer questions that name them", () => {
  assert.match(ask("what are the rules?").reply, /Be kind/);
  assert.match(ask("blitz where are your socials").reply, /stardust\.cafe/);
  assert.match(ask("when is movie night?").reply, /Fridays/, "\"movie night\" names !movienight");
  assert.match(ask("what are the rules?", { customs: [] }).reply, /<#rules>/, "no rules command: the rules channel");
});

test("levels, the leaderboard and Stardust come from the asker's own numbers", () => {
  assert.match(ask("what level am i").reply, /level 7 with 2,140 XP, 345 more to level 8/);
  assert.match(ask("who's at the top of the leaderboard?").reply, /Luna, Kai and Mira/);
  assert.match(ask("how much stardust do i have?").reply, /640 ✨/);
  assert.match(ask("what level am i", { levels: undefined }).reply, /aren't switched on/);
  assert.match(ask("where can i buy hats").intent, /shop/);
});

test("plain requests run the real command, as the person asking", () => {
  assert.deepEqual(ask("remind me in 2 hours to take the pizza out").run, { command: "remind", args: "2h take the pizza out" });
  assert.deepEqual(ask("blitz remind me to stretch in 10 min").run, { command: "remind", args: "10m stretch" });
  assert.equal(ask("remind me to stretch").run, undefined, "no time given: Blitz asks when instead");
  assert.deepEqual(ask("my birthday is July 14").run, { command: "birthday", args: "july 14" });
  assert.deepEqual(ask("claim my daily").run, { command: "daily", args: "" });
  assert.deepEqual(ask("give me the gamer role").run, { command: "role", args: "Gamer" });
  assert.deepEqual(ask("i want the night owl role").run, { command: "role", args: "Night Owl" });
  assert.equal(ask("give me the admin role").run, undefined, "only roles people can pick");
  assert.equal(ask("claim my daily", { stardust: undefined }).run, undefined);
});

test("roles: what you can pick, and what levels unlock", () => {
  assert.match(ask("what roles can i get?").reply, /Gamer, Artist and Night Owl/);
  assert.match(ask("how do i get the veteran role?").reply, /level 10 \(you're level 7\)/);
});

test("help, the team, the community, and how-do-I questions", () => {
  assert.equal(ask("what can you do?").intent, "help");
  assert.match(ask("someone is spamming, i need a mod").reply, /!ticket/);
  assert.equal(ask("i'll report back later").intent, "chatter", "\"report\" alone isn't a report");
  assert.match(ask("how many members are there?").reply, /248/);
  assert.match(ask("how do i make a poll?").reply, /!poll/);
  assert.match(ask("how can i suggest something?").reply, /!suggest/);
});

test("maths, dice, coins, choices and the 8-ball", () => {
  assert.equal(solveSum("12*7"), 84);
  assert.equal(solveSum("what's 15% of 80"), 12);
  assert.equal(solveSum("2 to the power of 10"), 1024);
  assert.equal(solveSum("(1+2)*3 - 4/2"), 7);
  assert.equal(solveSum("is open 24/7"), undefined, "words mean it isn't a sum");
  assert.equal(solveSum("5"), undefined, "a number on its own isn't a sum");
  assert.match(ask("whats 12*7").reply, /84/);
  assert.equal(ask("roll 2d6").intent, "dice");
  assert.equal(ask("flip a coin").intent, "coin");
  assert.equal(ask("should i get pizza or tacos?").intent, "choose");
  assert.equal(ask("is it true or false?").intent, "8ball", "a yes/no question isn't a choice");
  assert.equal(ask("will i pass my exam?").intent, "8ball");
});

test("about Blitz, and chatter", () => {
  assert.equal(ask("how are you blitz?").intent, "how-are-you");
  assert.match(ask("are you an ai?").reply, /no AI brain/);
  assert.match(ask("do you like my hat?").reply, /your hat/, "\"my\" becomes \"your\"");
  const hi = ask("hi blitz");
  assert.equal(hi.intent, "chatter");
  assert.equal(hi.answer, false, "chatter isn't an answer");
  assert.equal(ask("why is the sky blue?").intent, "unknown", "an honest don't-know");
});

test("someone in a dark place gets care, not a bit", () => {
  const a = ask("i want to die");
  assert.equal(a.intent, "care");
  assert.match(a.reply, /988/);
  assert.equal(a.mood, "comfort");
});

test("reminder times in everyday words", () => {
  assert.deepEqual(parseReminder("in half an hour to check the oven"), { when: "30m", what: "check the oven" });
  assert.deepEqual(parseReminder("tomorrow to call mum"), { when: "1d", what: "call mum" });
  assert.deepEqual(parseReminder("to drink water in an hour"), { when: "1h", what: "drink water" });
  assert.equal(parseReminder("to drink water"), undefined);
});
