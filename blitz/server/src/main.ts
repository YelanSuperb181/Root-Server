// Blitz: builds this Root community from its blueprint, keeps it lively, and
// lives in its own domain (an App channel) where people can play with it.

import {
  rootServer,
  ChannelEvent,
  ChannelGroupEvent,
  ChannelMessageCreatedEvent,
  ChannelMessageEvent,
  ChannelMessageReactionCreatedEvent,
  ChannelMessageReactionDeletedEvent,
  CommunityRoleEvent,
  MessageType,
  RootAppStartState,
} from "@rootsdk/server-app";
import { CommunityFacts } from "@blitz/shared";
import { blueprint } from "./blueprint/layout";
import { validateAll } from "./blueprint/validate";
import { config } from "./config";
import { errDetail, read } from "./core/api";
import { allCommands, handleCommand, register } from "./core/commands";
import { directory } from "./core/directory";
import { ensureDailyJob, initJobs } from "./core/jobs";
import { errMessage, log } from "./core/log";
import { initMembers, isPerson, loadSelf } from "./core/members";
import { checkCanRead } from "./core/selfcheck";
import { initAutomod, screenMessage } from "./features/automod";
import { birthdayCommands, celebrateBirthdays } from "./features/birthdays";
import { funCommands } from "./features/fun";
import { infoCommands } from "./features/info";
import { awardXp, levelCommands } from "./features/levels";
import { initPolls, pollCommands } from "./features/polls";
import { postQuestion, qotdCommands } from "./features/qotd";
import { loadPanels, onPanelReaction } from "./features/roles";
import { setupCommands } from "./features/setup";
import { onStarReaction, starboardCommands } from "./features/starboard";
import { captureSuggestion, suggestionCommands } from "./features/suggestions";
import { staffCommands } from "./features/staff";
import { initWelcome } from "./features/welcome";
import { initBrain } from "./domain/brain";
import { hearChat } from "./domain/chat";
import { domainCommands } from "./domain/commands";
import { domainService, initDomain } from "./domain/domain";

/** The command a message starts with ("!setup"), if it starts with the prefix. */
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
  try {
    if (await screenMessage(evt)) {
      if (word) log("info", `auto-mod held back ${word}`);
      return;
    }
    if (await handleCommand(evt)) return;
    if (word) log("info", `${word} isn't one of ${config.botName}'s commands`);
    if (await captureSuggestion(evt)) return;
    // Runs alongside: Blitz may take a few seconds to think, and XP shouldn't wait for it.
    void hearChat(evt);
    await awardXp(evt);
  } catch (err) {
    log("error", "message handling failed", { error: errDetail(err) });
  }
}

async function onReaction(evt: ChannelMessageReactionCreatedEvent | ChannelMessageReactionDeletedEvent, added: boolean): Promise<void> {
  if (!isPerson(evt.userId)) return;
  try {
    await onPanelReaction(evt, added);
    await onStarReaction(evt);
  } catch (err) {
    log("error", "reaction handling failed", { error: errMessage(err) });
  }
}

/** What Blitz's brain knows about the community: its name, channels (not the personal mailboxes) and public commands. */
async function communityFacts(): Promise<CommunityFacts> {
  let name = "this community";
  try {
    name = (await read("communities.get", () => rootServer.community.communities.get())).name || name;
  } catch (err) {
    log("warn", "couldn't read the community's name", { error: errMessage(err) });
  }
  return {
    name,
    prefix: config.prefix,
    groups: blueprint.groups
      .map((g) => ({ name: g.name, channels: g.channels.filter((c) => !c.key.startsWith("mail-")).map((c) => ({ name: c.name, topic: c.topic })) }))
      .filter((g) => g.channels.length > 0),
    commands: allCommands()
      .filter((c) => c.level === "everyone")
      .map((c) => ({ name: c.name, summary: c.summary })),
  };
}

async function runDaily(): Promise<void> {
  await postQuestion(false).catch((err) => log("error", "question of the day failed", { error: errMessage(err) }));
  await celebrateBirthdays().catch((err) => log("error", "birthdays failed", { error: errMessage(err) }));
}

/** Channels and roles change (setup, or an admin by hand): re-match IDs shortly after. */
let resyncTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleResync(): void {
  if (resyncTimer) clearTimeout(resyncTimer);
  resyncTimer = setTimeout(() => {
    resyncTimer = undefined;
    directory.sync().catch((err) => log("warn", "resync failed", { error: errMessage(err) }));
  }, 5000);
}

async function onStarting(state: RootAppStartState): Promise<void> {
  const problems = validateAll(blueprint);
  for (const p of problems) log("warn", `blueprint: ${p}`);

  initMembers(state);
  await loadSelf();
  await directory.sync();
  await loadPanels();
  initJobs();
  initPolls();
  initWelcome();
  initAutomod();

  // Features switched off in config.ts don't get their commands at all.
  register(
    ...infoCommands,
    ...(config.levels.enabled ? levelCommands : []),
    ...(config.starboard.enabled ? starboardCommands : []),
    ...(config.questionOfTheDay.enabled ? qotdCommands : []),
    ...(config.birthdays.enabled ? birthdayCommands : []),
    ...pollCommands,
    ...(config.suggestions.enabled ? suggestionCommands : []),
    ...funCommands,
    ...staffCommands,
    ...setupCommands,
    ...domainCommands,
  );

  const messages = rootServer.community.channelMessages;
  messages.on(ChannelMessageEvent.ChannelMessageCreated, (evt: ChannelMessageCreatedEvent) => void onMessage(evt));
  messages.on(ChannelMessageEvent.ChannelMessageReactionCreated, (evt: ChannelMessageReactionCreatedEvent) => void onReaction(evt, true));
  messages.on(ChannelMessageEvent.ChannelMessageReactionDeleted, (evt: ChannelMessageReactionDeletedEvent) => void onReaction(evt, false));

  rootServer.community.channels.on(ChannelEvent.ChannelCreated, scheduleResync);
  rootServer.community.channels.on(ChannelEvent.ChannelDeleted, scheduleResync);
  rootServer.community.channelGroups.on(ChannelGroupEvent.ChannelGroupCreated, scheduleResync);
  rootServer.community.channelGroups.on(ChannelGroupEvent.ChannelGroupDeleted, scheduleResync);
  rootServer.community.communityRoles.on(CommunityRoleEvent.CommunityRoleCreated, scheduleResync);
  rootServer.community.communityRoles.on(CommunityRoleEvent.CommunityRoleDeleted, scheduleResync);

  await ensureDailyJob(config.daily.hourUtc, runDaily);

  // The domain: the App's own channel, where Blitz floats around.
  rootServer.lifecycle.addService(domainService);
  await initDomain(state.channelId);
  const facts = await communityFacts();
  initBrain(facts, state.globalSettings);

  const mapped = Object.keys(directory.saved()).length;
  log("info", `${config.botName} is up in the community "${facts.name}"`, {
    community: state.communityId,
    members: state.communityMembers.size,
    blueprintItemsFound: mapped,
    hint: mapped === 0 ? `type ${config.prefix}setup in any channel of "${facts.name}" to build it` : undefined,
  });
  await checkCanRead();
}

(async () => {
  await rootServer.lifecycle.start(onStarting);
})();
