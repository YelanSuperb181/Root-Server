import { test } from "node:test";
import assert from "node:assert/strict";
import { blueprint } from "../src/blueprint/layout";
import { channelPermission, communityPermission, mergeRules } from "../src/blueprint/permissions";
import { GATE_RULES, channelRules, groupRules } from "../src/blueprint/rules";
import type { Blueprint } from "../src/blueprint/types";
import { validateAll, validateBlueprint } from "../src/blueprint/validate";
import { renderPanel, rolePanels, starterPosts } from "../src/blueprint/content";
import { questions } from "../src/content/questions";

const group = (key: string) => blueprint.groups.find((g) => g.key === key)!;
const channel = (key: string) => blueprint.groups.flatMap((g) => g.channels).find((c) => c.key === key)!;
const overlayFor = (rules: ReturnType<typeof groupRules>, subject: string) => rules.find((r) => r.subject === subject)?.overlay;

test("the shipped blueprint, config and content are valid", () => {
  assert.deepEqual(validateAll(blueprint), []);
});

test("validation catches the usual mistakes", () => {
  const broken: Blueprint = structuredClone(blueprint);
  broken.groups[0].channels.push({ key: "bad", name: "Bad Name!", type: "text", topic: "x" });
  broken.groups[0].channels.push({ key: "welcome", name: "welcome2", type: "text", topic: "x" });
  broken.groups[1].access = [{ subject: "ghost-role", overlay: { channelView: false } }];
  broken.roles.push({ ...broken.roles[1], key: "mod2" });
  broken.roles[2].color = "pink";
  const problems = validateBlueprint(broken).join("\n");
  assert.match(problems, /"Bad Name!" isn't allowed/);
  assert.match(problems, /Channel key "welcome" is used twice/);
  assert.match(problems, /unknown role "ghost-role"/);
  assert.match(problems, /Two roles are named "Moderator"/);
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

test("the gate hides members-only groups from everyone but members, staff and the bot", () => {
  const rules = groupRules(group("community"), true);
  assert.deepEqual(rules, GATE_RULES);
  assert.equal(overlayFor(rules, "@everyone")?.channelView, false);
  assert.equal(overlayFor(rules, "member")?.channelView, true);
  assert.equal(overlayFor(rules, "@self")?.channelView, true);
  assert.deepEqual(groupRules(group("community"), false), [], "gate off: no rules at all");
});

test("Start Here is readable by all but only the team posts", () => {
  const rules = groupRules(group("start-here"), true);
  assert.equal(overlayFor(rules, "@everyone")?.channelView, undefined, "visible before accepting the rules");
  assert.equal(overlayFor(rules, "@everyone")?.channelCreateMessage, false);
  assert.equal(overlayFor(rules, "moderator")?.channelCreateMessage, true);
});

test("Staff is hidden from everyone, gate or not", () => {
  for (const gate of [true, false]) {
    const rules = groupRules(group("staff"), gate);
    assert.equal(overlayFor(rules, "@everyone")?.channelView, false);
    assert.equal(overlayFor(rules, "moderator")?.channelView, true);
  }
});

test("plain channels share their group's permissions", () => {
  assert.deepEqual(channelRules(group("community"), channel("general"), true), { inherit: true, rules: [] });
});

test("channels with their own rules restate the group's rules first", () => {
  const hof = channelRules(group("community"), channel("hall-of-fame"), true);
  assert.equal(hof.inherit, false);
  const everyone = overlayFor(hof.rules, "@everyone");
  assert.equal(everyone?.channelView, false, "still members-only");
  assert.equal(everyone?.channelCreateMessage, false, "and read-only");
  assert.equal(overlayFor(hof.rules, "member")?.channelView, true);
});

test("#roles is members-only inside the public Start Here group", () => {
  const gated = channelRules(group("start-here"), channel("roles"), true);
  assert.equal(gated.inherit, false);
  assert.equal(overlayFor(gated.rules, "@everyone")?.channelView, false);
  assert.equal(overlayFor(gated.rules, "@everyone")?.channelCreateMessage, false, "keeps the group's read-only rule");
  assert.deepEqual(channelRules(group("start-here"), channel("roles"), false), { inherit: true, rules: [] });
});

test("the stage lets hosts talk and everyone else listen", () => {
  const stage = channelRules(group("voice"), channel("stage"), true);
  assert.equal(overlayFor(stage.rules, "@everyone")?.channelVoiceTalk, false);
  assert.equal(overlayFor(stage.rules, "event-host")?.channelVoiceTalk, true);
});

test("role panels only offer self-service roles and render every option", () => {
  for (const panel of rolePanels) {
    const text = renderPanel(panel);
    for (const option of panel.options) {
      const role = blueprint.roles.find((r) => r.key === option.role)!;
      assert.ok(role.selfAssignable, `${role.key} should be self-assignable`);
      assert.ok(text.includes(option.emoji.glyph));
      assert.ok(text.includes(role.name));
    }
  }
  assert.equal(rolePanels.find((p) => p.key === "colors")?.exclusive, true);
});

test("starter posts mention the gate only when it's on", () => {
  const ctx = (gate: boolean) => ({
    community: "Test Town",
    prefix: "!",
    botName: "Sprout",
    gate,
    channel: (key: string) => `#${key}`,
    role: (key: string) => `**${key}**`,
  });
  const rules = starterPosts.find((p) => p.key === "rules")!;
  assert.match(rules.render(ctx(true)), /unlock the rest of the community/);
  assert.doesNotMatch(rules.render(ctx(false)), /unlock/);
  assert.match(starterPosts.find((p) => p.key === "welcome")!.render(ctx(true)), /Welcome to Test Town/);
});

test("the question pool is big and has no duplicates", () => {
  assert.ok(questions.length >= 100);
  assert.equal(new Set(questions.map((q) => q.toLowerCase())).size, questions.length);
});
