import { test } from "node:test";
import assert from "node:assert/strict";
import { blueprint } from "../src/blueprint/layout";
import { mailboxes } from "../src/blueprint/mailboxes";
import { channelPermission, communityPermission, mergeRules } from "../src/blueprint/permissions";
import { GATE_RULES, channelRules, groupRules } from "../src/blueprint/rules";
import type { Blueprint, GroupSpec } from "../src/blueprint/types";
import { validateAll, validateBlueprint } from "../src/blueprint/validate";
import { renderPanel, starterPosts } from "../src/blueprint/content";
import { config } from "../src/config";
import { questions } from "../src/content/questions";
import { E } from "../src/logic/emoji";

const group = (key: string) => blueprint.groups.find((g) => g.key === key)!;
const channel = (key: string) => blueprint.groups.flatMap((g) => g.channels).find((c) => c.key === key)!;
const overlayFor = (rules: ReturnType<typeof groupRules>, subject: string) => rules.find((r) => r.subject === subject)?.overlay;

test("the shipped blueprint, config and content are valid", () => {
  assert.deepEqual(validateAll(blueprint), []);
});

test("the template keeps the Discord server's categories in order", () => {
  assert.deepEqual(
    blueprint.groups.map((g) => g.name),
    ["Important!!!", "Ze Social Place", "Bitch Mailing Service", "Bitches Playing Minecraft", "Bitches Playing Terraria", "Yap... With Your Voices", "Other"],
  );
  assert.equal(group("mailing").channels.length, 1 + mailboxes.length, "to-all-bitches plus the local mailboxes");
  assert.ok(mailboxes.every((m) => m.key.startsWith("mail-")));
  assert.equal(channel("voice-chat").type, "voice");
  assert.equal(channel("music").type, "text", "#music is a text channel in the Discord server too");
});

test("roles keep their Discord names behind the keys the bot relies on", () => {
  const byKey = Object.fromEntries(blueprint.roles.map((r) => [r.key, r.name]));
  assert.equal(byKey.moderator, "Bitchiest Bitch");
  assert.equal(byKey.member, "Bitches");
  assert.equal(config.onboarding.autoRole, "member");
});

test("validation catches the usual mistakes", () => {
  const broken: Blueprint = structuredClone(blueprint);
  broken.groups[0].channels.push({ key: "bad", name: "Bad Name!", type: "text", topic: "x" });
  broken.groups[0].channels.push({ key: "polls", name: "polls2", type: "text", topic: "x" });
  broken.groups[1].access = [{ subject: "ghost-role", overlay: { channelView: false } }];
  broken.roles.push({ ...broken.roles[1], key: "mod2" });
  broken.roles[2].color = "pink";
  const problems = validateBlueprint(broken).join("\n");
  assert.match(problems, /"Bad Name!" isn't allowed/);
  assert.match(problems, /Channel key "polls" is used twice/);
  assert.match(problems, /unknown role "ghost-role"/);
  assert.match(problems, /Two roles are named "Bitchiest Bitch"/);
  assert.match(problems, /must look like #RRGGBB/);
});

test("validation requires the roles the bot depends on", () => {
  const noMember: Blueprint = { ...blueprint, roles: blueprint.roles.filter((r) => r.key !== "member") };
  assert.match(validateBlueprint(noMember).join("\n"), /needs a role with key "member"/);
});

test("permission helpers fill every field", () => {
  const c = communityPermission({ communityKick: true });
  assert.equal(c.communityKick, true);
  assert.equal(c.communityFullControl, false);
  assert.ok(Object.keys(c).length >= 14);
  assert.equal(channelPermission().channelView, false);
});

test("mergeRules merges per subject, later lists win", () => {
  const merged = mergeRules(
    [{ subject: "@everyone", overlay: { channelView: false, channelCreateMessage: true } }],
    [{ subject: "@everyone", overlay: { channelCreateMessage: false } }, { subject: "member", overlay: { channelView: true } }],
  );
  assert.deepEqual(merged, [
    { subject: "@everyone", overlay: { channelView: false, channelCreateMessage: false } },
    { subject: "member", overlay: { channelView: true } },
  ]);
});

test("announcements and the log are read-only except for the Bitchiest Bitch and Wisp", () => {
  for (const key of ["announcements", "dyno-status"]) {
    const rules = channelRules(group("important"), channel(key), config.onboarding.gate);
    assert.equal(rules.inherit, false);
    assert.equal(overlayFor(rules.rules, "@everyone")?.channelCreateMessage, false);
    assert.equal(overlayFor(rules.rules, "moderator")?.channelCreateMessage, true);
    assert.equal(overlayFor(rules.rules, "@self")?.channelCreateMessage, true);
  }
});

test("everything else is open to everyone, like on Discord", () => {
  assert.deepEqual(channelRules(group("social"), channel("bitches-yapping"), false), { inherit: true, rules: [] });
  assert.deepEqual(groupRules(group("mailing"), false), []);
});

test("the vent never feeds the quote board or XP", () => {
  assert.ok((config.starboard.ignore as readonly string[]).includes("the-vent-aka-hell"));
  assert.ok((config.levels.noXpIn as readonly string[]).includes("the-vent-aka-hell"));
});

// The gate isn't used in this server, but the logic stays tested for anyone who turns it on.
const gated: GroupSpec = {
  key: "g",
  name: "Gated",
  description: "",
  membersOnly: true,
  channels: [
    { key: "open", name: "open", type: "text", topic: "" },
    { key: "readonly", name: "readonly", type: "text", topic: "", access: [{ subject: "@everyone", overlay: { channelCreateMessage: false } }] },
  ],
};

test("the gate hides members-only groups from everyone but members, staff and the bot", () => {
  assert.deepEqual(groupRules(gated, true), GATE_RULES);
  assert.deepEqual(groupRules(gated, false), [], "gate off: no rules at all");
});

test("channels with their own rules restate the group's rules first", () => {
  assert.deepEqual(channelRules(gated, gated.channels[0], true), { inherit: true, rules: [] });
  const own = channelRules(gated, gated.channels[1], true);
  assert.equal(own.inherit, false);
  assert.equal(overlayFor(own.rules, "@everyone")?.channelView, false, "still members-only");
  assert.equal(overlayFor(own.rules, "@everyone")?.channelCreateMessage, false, "and read-only");
  assert.equal(overlayFor(own.rules, "member")?.channelView, true);
});

test("a members-only channel inside a public group gets the gate on its own", () => {
  const publicGroup: GroupSpec = { ...gated, membersOnly: false, channels: [{ key: "x", name: "x", type: "text", topic: "", membersOnly: true }] };
  const rules = channelRules(publicGroup, publicGroup.channels[0], true);
  assert.equal(rules.inherit, false);
  assert.equal(overlayFor(rules.rules, "@everyone")?.channelView, false);
  assert.deepEqual(channelRules(publicGroup, publicGroup.channels[0], false), { inherit: true, rules: [] });
});

test("starter posts render with the server's role names and settings", () => {
  const ctx = {
    community: "Bich ass bitchess",
    prefix: "!",
    botName: "Wisp",
    gate: false,
    channel: (key: string) => `#${key}`,
    role: (key: string) => `**${blueprint.roles.find((r) => r.key === key)?.name}**`,
  };
  const text = Object.fromEntries(starterPosts.map((p) => [p.key, p.render(ctx)]));
  assert.match(text.birthdays, /\*\*Birthday Bitch\*\*/);
  assert.match(text.quotes, new RegExp(`Once ${config.starboard.threshold} people`));
  assert.match(text.quotes, /#the-vent-aka-hell/);
  assert.match(text["bot-commands"], /Wisp has drifted in/);
});

test("role pickers render every option", () => {
  const text = renderPanel({ key: "t", title: "Test", blurb: "b", exclusive: false, options: [{ emoji: E.star, role: "birthday" }] });
  assert.ok(text.includes("⭐"));
  assert.ok(text.includes("Birthday Bitch"));
});

test("the question pool is big and has no duplicates", () => {
  assert.ok(questions.length >= 100);
  assert.equal(new Set(questions.map((q) => q.toLowerCase())).size, questions.length);
});
