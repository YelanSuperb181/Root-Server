// Blitz: a lively little spirit for any Root community. It answers people
// who talk to it, keeps levels, a quote wall and birthdays, keeps spam out,
// and lives in its own domain (an App channel) where people can play with it.
// Each community decides on Blitz's App settings page which channels and
// roles it uses; anything left empty is simply off.

import "./polyfills"; // first: lets Root's SDK run on Node 20
import {
  rootServer,
  ChannelEvent,
  ChannelGroupEvent,
  ChannelMessageCreatedEvent,
  ChannelMessageEvent,
  ChannelMessageReactionCreatedEvent,
  ChannelMessageReactionDeletedEvent,
  GlobalSettingsEvent,
  MessageType,
  RootAppStartState,
} from "@rootsdk/server-app";
import { CommunityFacts } from "@blitz/shared";
import { config } from "./config";
import { errDetail, read } from "./core/api";
import { allCommands, handleCommand, register, setReplyFooter } from "./core/commands";
import { listChannels } from "./core/community";
import { ensureDailyJob, initJobs } from "./core/jobs";
import { errMessage, log } from "./core/log";
import { initMembers, isPerson, loadSelf } from "./core/members";
import { checkCanRead } from "./core/selfcheck";
import { settings } from "./core/settings";
import { truncate } from "./logic/text";
import { initAutomod, screenMessage } from "./features/automod";
import { customCommands, customCommandsAdmin, initCustom } from "./features/custom";
import { initMessageLog, rememberMessage } from "./features/messagelog";
import { holdIfMuted, initModeration, moderationCommands } from "./features/moderation";
import { guardianCommands, initGuardian, screenGuardian } from "./features/guardian";
import { countMessage, initPulse } from "./features/pulse";
import { inboxCommands } from "./features/inbox";
import { oracleCommands } from "./domain/oracle";
import { earnStardust, stardustCommands } from "./features/stardust";
import { giveawayCommands, initGiveaways, onGiveawayReaction } from "./features/giveaways";
import { initReminders, reminderCommands } from "./features/reminders";
import { reportCommands } from "./features/reports";
import { selfRoleCommands } from "./features/selfroles";
import { suggestionCommands } from "./features/suggestions";
import { birthdayCommands, celebrateBirthdays } from "./features/birthdays";
import { funCommands } from "./features/fun";
import { infoCommands } from "./features/info";
import { awardXp, levelCommands } from "./features/levels";
import { initPolls, pollCommands } from "./features/polls";
import { onStarReaction, starboardCommands } from "./features/starboard";
import { staffCommands } from "./features/staff";
import { initWelcome } from "./features/welcome";
import { initBrain, refreshFacts } from "./domain/brain";
import { hearChat } from "./domain/chat";
import { domainCommands, domainFooter } from "./domain/commands";
import { domainService, initDomain } from "./domain/domain";
import { menuService } from "./domain/menu";

/** The command a message starts with ("!help"), if it starts with the prefix. */
function commandWord(content: string | undefined): string | undefined {
  const text = (content ?? "").trimStart();
  return text.startsWith(config.prefix) ? text.split(/\s+/)[0].slice(0, 32) : undefined;
}

let heardChat = false;

async function onMessage(evt: ChannelMessageCreatedEvent): Promise<void> {
  if (evt.messageType === MessageType.System) return;
  if (!heardChat) {
    heardChat = true;
    log("info", "Blitz can hear chat (first message since it started)");
  }
  // Commands get a line in the log, so it's clear Blitz saw them.
  const word = commandWord(evt.messageContent);
  if (!isPerson(evt.userId)) {
    if (word) log("info", `ignored ${word}: it wasn't sent by a person`);
    return;
  }
  if (word) log("info", `heard ${word}`);
  rememberMessage(evt);
  countMessage(evt);
  try {
    if (await holdIfMuted(evt)) {
      if (word) log("info", `${word} came from a muted member`);
      return;
    }
    if (await screenGuardian(evt)) {
      if (word) log("info", `a shield held back ${word}`);
      return;
    }
    if (await screenMessage(evt)) {
      if (word) log("info", `auto-mod held back ${word}`);
      return;
    }
    if (await handleCommand(evt)) return;
    if (word) log("info", `${word} isn't one of ${config.botName}'s commands`);
    // Runs alongside: Blitz may take a few seconds to think, and XP shouldn't wait for it.
    void hearChat(evt);
    await awardXp(evt);
    await earnStardust(evt);
  } catch (err) {
    log("error", "message handling failed", { error: errDetail(err) });
  }
}

async function onReaction(evt: ChannelMessageReactionCreatedEvent | ChannelMessageReactionDeletedEvent, added: boolean): Promise<void> {
  if (!isPerson(evt.userId)) return;
  try {
    await onStarReaction(evt);
    await onGiveawayReaction(evt, added);
  } catch (err) {
    log("error", "reaction handling failed", { error: errMessage(err) });
  }
}

/** What Blitz's brain knows about the community: its name, what its admins say about it, its channels and public commands. */
async function communityFacts(): Promise<CommunityFacts> {
  let name = "this community";
  try {
    name = (await read("communities.get", () => rootServer.community.communities.get())).name || name;
  } catch (err) {
    log("warn", "couldn't read the community's name", { error: errMessage(err) });
  }
  const groups = new Map<string, Array<{ name: string; topic?: string }>>();
  try {
    for (const c of await listChannels()) {
      if (c.type !== "text" || settings.isPrivate(c.id) || settings.isLog(c.id)) continue;
      const list = groups.get(c.group) ?? [];
      list.push({ name: c.name, topic: c.description });
      groups.set(c.group, list);
    }
  } catch (err) {
    log("warn", "couldn't list the channels", { error: errMessage(err) });
  }
  return {
    name,
    about: settings.text("about"),
    prefix: config.prefix,
    groups: [...groups].slice(0, 20).map(([group, channels]) => ({ name: group, channels: channels.slice(0, 15) })),
    commands: [
      ...allCommands()
        .filter((c) => c.level === "everyone")
        .map((c) => ({ name: c.name, summary: c.summary })),
      // The community's own commands: their answers are things like rules and FAQs, which Blitz can point people to.
      ...customCommands()
        .slice(0, 40)
        .map((c) => ({ name: c.name, summary: `(this community's own) ${truncate(c.response.replace(/\s+/g, " "), 160)}` })),
    ],
  };
}

/** Channels or settings changed: tell the brain, a little later (changes tend to come in bursts). */
let factsTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleFacts(): void {
  if (factsTimer) clearTimeout(factsTimer);
  factsTimer = setTimeout(() => {
    factsTimer = undefined;
    communityFacts()
      .then(refreshFacts)
      .catch((err) => log("warn", "couldn't refresh what Blitz knows", { error: errMessage(err) }));
  }, 5000);
}

/** Starts one part of Blitz; if it fails, says so and carries on, so one broken part can't stop the rest (or the menu). */
async function safely(what: string, start: () => void | Promise<void>): Promise<void> {
  try {
    await start();
  } catch (err) {
    log("error", `couldn't start ${what}; the rest of Blitz carries on without it`, { error: errMessage(err) });
  }
}

async function onStarting(state: RootAppStartState): Promise<void> {
  initMembers(state);
  // The domain and its menu first: whatever happens below, the domain window can reach Blitz.
  rootServer.lifecycle.addService(domainService);
  rootServer.lifecycle.addService(menuService);
  await safely("its memory of itself", loadSelf);
  initJobs();
  await safely("polls", initPolls);
  await safely("welcomes", initWelcome);
  await safely("auto-mod", initAutomod);

  await safely("reminders", initReminders);
  await safely("the message log", initMessageLog);
  await safely("moderation", initModeration);
  await safely("the shields", initGuardian);
  await safely("the pulse", initPulse);
  await safely("giveaways", initGiveaways);

  register(
    ...infoCommands,
    ...levelCommands,
    ...starboardCommands,
    ...birthdayCommands,
    ...pollCommands,
    ...reminderCommands,
    ...selfRoleCommands,
    ...suggestionCommands,
    ...reportCommands,
    ...funCommands,
    ...moderationCommands,
    ...guardianCommands,
    ...inboxCommands,
    ...oracleCommands,
    ...stardustCommands,
    ...giveawayCommands,
    ...staffCommands,
    ...customCommandsAdmin,
    ...domainCommands,
  );
  setReplyFooter(domainFooter);
  // After the built-in commands, so a community command can never shadow one.
  await safely("community commands", () => initCustom(scheduleFacts));

  const messages = rootServer.community.channelMessages;
  messages.on(ChannelMessageEvent.ChannelMessageCreated, (evt: ChannelMessageCreatedEvent) => void onMessage(evt));
  messages.on(ChannelMessageEvent.ChannelMessageReactionCreated, (evt: ChannelMessageReactionCreatedEvent) => void onReaction(evt, true));
  messages.on(ChannelMessageEvent.ChannelMessageReactionDeleted, (evt: ChannelMessageReactionDeletedEvent) => void onReaction(evt, false));

  await safely("the daily job", () => ensureDailyJob(config.daily.hourUtc, () => celebrateBirthdays().catch((err) => log("error", "birthdays failed", { error: errMessage(err) }))));

  // The domain: the App's own channel, where Blitz floats around.
  await safely("the domain", () => initDomain(state.channelId));
  const facts = await communityFacts();
  initBrain(facts, state.globalSettings);
  rootServer.community.channels.on(ChannelEvent.ChannelCreated, scheduleFacts);
  rootServer.community.channels.on(ChannelEvent.ChannelEdited, scheduleFacts);
  rootServer.community.channels.on(ChannelEvent.ChannelDeleted, scheduleFacts);
  rootServer.community.channelGroups.on(ChannelGroupEvent.ChannelGroupEdited, scheduleFacts);
  rootServer.globalSettings?.on(GlobalSettingsEvent.Update, scheduleFacts);

  log("info", `${config.botName} is up in the community "${facts.name}"`, {
    community: state.communityId,
    members: state.communityMembers.size,
    hint: `type ${config.prefix}help in any channel of "${facts.name}"; set Blitz up on its App settings page in Root`,
  });
  await checkCanRead();
}

// A promise that fails with nobody waiting on it would otherwise stop the whole server (Node's default):
// one slip in one feature mustn't take Blitz offline for everyone. Say what it was and carry on.
process.on("unhandledRejection", (reason) => {
  log("error", "something went wrong that nothing was waiting for; Blitz carries on", { error: errMessage(reason) });
});

(async () => {
  await rootServer.lifecycle.start(onStarting);
})();
