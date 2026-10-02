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
import { allCommands, handleCommand, register } from "./core/commands";
import { listChannels } from "./core/community";
import { ensureDailyJob, initJobs } from "./core/jobs";
import { errMessage, log } from "./core/log";
import { initMembers, isPerson, loadSelf } from "./core/members";
import { checkCanRead } from "./core/selfcheck";
import { settings } from "./core/settings";
import { initAutomod, screenMessage } from "./features/automod";
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
import { domainCommands } from "./domain/commands";
import { domainService, initDomain } from "./domain/domain";

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
  try {
    if (await screenMessage(evt)) {
      if (word) log("info", `auto-mod held back ${word}`);
      return;
    }
    if (await handleCommand(evt)) return;
    if (word) log("info", `${word} isn't one of ${config.botName}'s commands`);
    // Runs alongside: Blitz may take a few seconds to think, and XP shouldn't wait for it.
    void hearChat(evt);
    await awardXp(evt);
  } catch (err) {
    log("error", "message handling failed", { error: errDetail(err) });
  }
}

async function onReaction(evt: ChannelMessageReactionCreatedEvent | ChannelMessageReactionDeletedEvent): Promise<void> {
  if (!isPerson(evt.userId)) return;
  try {
    await onStarReaction(evt);
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
    commands: allCommands()
      .filter((c) => c.level === "everyone")
      .map((c) => ({ name: c.name, summary: c.summary })),
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

async function onStarting(state: RootAppStartState): Promise<void> {
  initMembers(state);
  await loadSelf();
  initJobs();
  initPolls();
  initWelcome();
  initAutomod();

  register(...infoCommands, ...levelCommands, ...starboardCommands, ...birthdayCommands, ...pollCommands, ...funCommands, ...staffCommands, ...domainCommands);

  const messages = rootServer.community.channelMessages;
  messages.on(ChannelMessageEvent.ChannelMessageCreated, (evt: ChannelMessageCreatedEvent) => void onMessage(evt));
  messages.on(ChannelMessageEvent.ChannelMessageReactionCreated, (evt: ChannelMessageReactionCreatedEvent) => void onReaction(evt));
  messages.on(ChannelMessageEvent.ChannelMessageReactionDeleted, (evt: ChannelMessageReactionDeletedEvent) => void onReaction(evt));

  await ensureDailyJob(config.daily.hourUtc, () => celebrateBirthdays().catch((err) => log("error", "birthdays failed", { error: errMessage(err) })));

  // The domain: the App's own channel, where Blitz floats around.
  rootServer.lifecycle.addService(domainService);
  await initDomain(state.channelId);
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

(async () => {
  await rootServer.lifecycle.start(onStarting);
})();
