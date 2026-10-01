import { test } from "node:test";
import assert from "node:assert/strict";
import { blueprint } from "../src/blueprint/layout";
import { ExistingState, countPlan, planSetup, savedKey } from "../src/blueprint/plan";

const allChannels = blueprint.groups.flatMap((g) => g.channels);

/** What a brand-new Root community looks like: Admin + EVERYONE, a default group with #general. */
function freshCommunity(): ExistingState {
  return {
    roles: [
      { id: "r-everyone", name: "EVERYONE" },
      { id: "r-admin", name: "Admin" },
    ],
    groups: [
      { id: "g-default", name: "Text Channels", channels: [{ id: "c-general", name: "general", type: "text" }] },
      { id: "g-voice", name: "Voice Channels", channels: [{ id: "c-voice", name: "General", type: "voice" }] },
    ],
    saved: {},
  };
}

test("a fresh community: everything is created except Admin and #general", () => {
  const plan = planSetup(blueprint, freshCommunity());
  const counts = countPlan(plan);
  assert.equal(counts.create.roles, blueprint.roles.length - 1);
  assert.equal(counts.keep.roles, 1);
  assert.equal(counts.create.groups, blueprint.groups.length);
  assert.equal(counts.create.channels, allChannels.length - 1);
  assert.equal(counts.moves, 1);
  assert.deepEqual(counts.missing, []);

  const general = plan.groups.flatMap((g) => g.channels).find((c) => c.spec.key === "general")!;
  assert.equal(general.action, "keep");
  assert.equal(general.currentGroupId, "g-default");
  assert.equal(general.needsMove, true);

  // The default voice channel is called "General" too, but it's voice: left alone.
  assert.deepEqual(
    plan.leftovers.channels.map((c) => c.id),
    ["c-voice"],
  );
  assert.deepEqual(
    plan.leftovers.groups.map((g) => g.id),
    ["g-default", "g-voice"],
  );
});

test("a finished community: nothing left to create or move", () => {
  const groups = blueprint.groups.map((g) => ({
    id: `g-${g.key}`,
    name: g.name,
    channels: g.channels.map((c) => ({ id: `c-${c.key}`, name: c.name, type: c.type })),
  }));
  const roles = blueprint.roles.map((r) => ({ id: `r-${r.key}`, name: r.name }));
  const counts = countPlan(planSetup(blueprint, { roles, groups, saved: {} }));
  assert.deepEqual(counts.create, { roles: 0, groups: 0, channels: 0 });
  assert.equal(counts.moves, 0);
});

test("saved IDs win over names, so renamed things are still found", () => {
  const state: ExistingState = {
    roles: [{ id: "r1", name: "Mods 🛡️" }],
    groups: [{ id: "g1", name: "Chat", channels: [{ id: "c1", name: "lobby", type: "text" }] }],
    saved: {
      [savedKey("role", "moderator")]: "r1",
      [savedKey("group", "community")]: "g1",
      [savedKey("channel", "general")]: "c1",
    },
  };
  const plan = planSetup(blueprint, state);
  const mod = plan.roles.find((s) => s.spec.key === "moderator")!;
  assert.deepEqual(mod.action === "keep" && [mod.id, mod.matchedBy], ["r1", "saved"]);
  const community = plan.groups.find((g) => g.group.spec.key === "community")!;
  assert.equal(community.group.action, "keep");
  const general = community.channels.find((c) => c.spec.key === "general")!;
  assert.equal(general.action === "keep" && general.id, "c1");
  assert.equal(general.needsMove, false);
});

test("a saved ID that no longer exists falls back to name matching", () => {
  const state: ExistingState = {
    roles: [{ id: "new-mod", name: "moderator" }],
    groups: [],
    saved: { [savedKey("role", "moderator")]: "deleted-id" },
  };
  const mod = planSetup(blueprint, state).roles.find((s) => s.spec.key === "moderator")!;
  assert.deepEqual(mod.action === "keep" && [mod.id, mod.matchedBy], ["new-mod", "name"]);
});

test("a missing built-in role is reported, never created", () => {
  const plan = planSetup(blueprint, { roles: [], groups: [], saved: {} });
  const admin = plan.roles.find((s) => s.spec.key === "admin")!;
  assert.equal(admin.action, "missing");
  assert.deepEqual(countPlan(plan).missing, ["Admin"]);
});

test("a saved ID beats an earlier spec's name match", () => {
  // #memes was renamed to "general" in Root. It must stay #memes, and the
  // blueprint's #general gets created instead of stealing it by name.
  const state: ExistingState = {
    roles: [],
    groups: [{ id: "g", name: "Stuff", channels: [{ id: "c", name: "general", type: "text" }] }],
    saved: { [savedKey("channel", "memes")]: "c" },
  };
  const channels = planSetup(blueprint, state).groups.flatMap((g) => g.channels);
  const claimedC = channels.filter((s) => s.action === "keep" && s.id === "c");
  assert.equal(claimedC.length, 1);
  assert.equal(claimedC[0].spec.key, "memes");
  assert.equal(channels.find((s) => s.spec.key === "general")?.action, "create");
});

test("a channel is matched in its own group before anywhere else", () => {
  const state: ExistingState = {
    roles: [],
    groups: [
      { id: "g-other", name: "Archive", channels: [{ id: "c-old", name: "general", type: "text" }] },
      { id: "g-com", name: "Community", channels: [{ id: "c-new", name: "general", type: "text" }] },
    ],
    saved: {},
  };
  const general = planSetup(blueprint, state).groups.flatMap((g) => g.channels).find((c) => c.spec.key === "general")!;
  assert.equal(general.action === "keep" && general.id, "c-new");
  assert.equal(general.needsMove, false);
});
