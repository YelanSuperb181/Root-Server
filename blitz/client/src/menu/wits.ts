// Blitz's wits in the window, for the browser preview: there's no server to
// ask, so the made-up community the menu shows is what Blitz knows. Inside
// Root, Blitz's server answers instead (with everything it knows).

import { WitsAnswer, WitsKnowledge, WitsMemory, wits } from "@blitz/shared";
import type { MenuOverview } from "./api";

export function knowledgeFrom(d: MenuOverview): WitsKnowledge {
  const can = (level: string) => level === "everyone" || d.access === "admin" || (d.access === "mod" && level === "mod");
  return {
    botName: "Blitz",
    prefix: "!",
    community: d.community || "this community",
    about: d.about || undefined,
    members: d.members,
    channels: d.channels.map((c) => ({ name: c.name, mention: `#${c.name}` })),
    commands: d.commands.filter((c) => can(c.level)).map((c) => ({ name: c.name, aliases: c.aliases, summary: c.summary, usage: c.usage })),
    customs: d.customs.map((c) => ({ name: c.name, response: c.response })),
    selfRoles: d.roles.map((r) => r.name),
    levelRewards: d.levelRewards.map((r) => ({ level: r.level, role: r.roleName })),
    levels: d.levels?.on ? { level: d.levels.level, xp: d.levels.xp, into: d.levels.into, needed: d.levels.needed, place: d.levels.place, how: d.levels.how } : undefined,
    top: d.levels?.top.map((t) => t.name),
    stardust: d.stardust?.on ? { balance: d.stardust.balance, streak: d.stardust.streak, dailyReady: d.stardust.dailyReady } : undefined,
    on: { inbox: d.inbox?.on ?? false, birthdays: d.birthday?.on ?? false, suggestions: d.suggestionsOn },
    asker: d.name || "you",
    where: "domain",
    now: Date.now(),
  };
}

/** Answers with the menu's data, remembering the last answer for follow-ups ("and music?"). */
export function windowWits(data: () => MenuOverview | undefined, run: (command: string, args: string) => void): (text: string) => WitsAnswer | undefined {
  let memory: WitsMemory | undefined;
  return (text) => {
    const d = data();
    if (!d) return undefined;
    const answer = wits(text, knowledgeFrom(d), memory);
    if (answer.intent !== "chatter") memory = { intent: answer.intent, topic: answer.topic, at: Date.now() };
    // A request runs the command through the menu, which shows its reply (and Blitz reacts to it).
    if (answer.run) run(answer.run.command, answer.run.args);
    return answer;
  };
}
