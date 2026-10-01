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

test("a fresh community: everything is created except Admin, and Root's defaults are left alone", () => {
  const plan = planSetup(blueprint, freshCommunity());
  const counts = countPlan(plan);
  assert.equal(counts.create.roles, blueprint.roles.length - 1);
  assert.equal(counts.keep.roles, 1);
  assert.equal(counts.create.groups, blueprint.groups.length);
  assert.equal(counts.create.channels, allChannels.length);
  assert.equal(counts.moves, 0);
  assert.deepEqual(counts.missing, []);
  assert.deepEqual(
    plan.leftovers.channels.map((c) => c.id),
    ["c-general", "c-voice"],
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

test("channels imported from the Discord template still match, emoji and all", () => {
  const state: ExistingState = {
    roles: [{ id: "r-bb", name: "Bitchiest Bitch" }],
    groups: [
      {
        id: "g-imp",
        name: "Important!!!",
        channels: [
          { id: "c-ann", name: "‼️announcements‼️", type: "text" },
          { id: "c-bday", name: "🎂birthdays🎂", type: "text" },
        ],
      },
    ],
    saved: {},
  };
  const plan = planSetup(blueprint, state);
  const important = plan.groups.find((g) => g.group.spec.key === "important")!;
  assert.equal(important.group.action, "keep");
  const ann = important.channels.find((c) => c.spec.key === "announcements")!;
  assert.equal(ann.action === "keep" && ann.id, "c-ann");
  assert.equal(ann.needsMove, false);
  const bday = important.channels.find((c) => c.spec.key === "birthdays")!;
  assert.equal(bday.action === "keep" && bday.id, "c-bday");
  const mod = plan.roles.find((r) => r.spec.key === "moderator")!;
  assert.equal(mod.action === "keep" && mod.id, "r-bb");
});

test("saved IDs win over names, so renamed things are still found", () => {
  const state: ExistingState = {
    roles: [{ id: "r1", name: "Supreme Leader" }],
    groups: [{ id: "g1", name: "Chat", channels: [{ id: "c1", name: "lobby", type: "text" }] }],
    saved: {
      [savedKey("role", "moderator")]: "r1",
      [savedKey("group", "social")]: "g1",
      [savedKey("channel", "bitches-yapping")]: "c1",
    },
  };
  const plan = planSetup(blueprint, state);
  const mod = plan.roles.find((s) => s.spec.key === "moderator")!;
  assert.deepEqual(mod.action === "keep" && [mod.id, mod.matchedBy], ["r1", "saved"]);
  const social = plan.groups.find((g) => g.group.spec.key === "social")!;
  assert.equal(social.group.action, "keep");
  const yapping = social.channels.find((c) => c.spec.key === "bitches-yapping")!;
  assert.equal(yapping.action === "keep" && yapping.id, "c1");
  assert.equal(yapping.needsMove, false);
});

test("a saved ID that no longer exists falls back to name matching", () => {
  const state: ExistingState = {
    roles: [{ id: "new-mod", name: "bitchiest bitch" }],
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
  // #games was renamed to "polls" in Root. It must stay #games, and the
  // blueprint's #polls gets created instead of stealing it by name.
  const state: ExistingState = {
    roles: [],
    groups: [{ id: "g", name: "Stuff", channels: [{ id: "c", name: "polls", type: "text" }] }],
    saved: { [savedKey("channel", "games")]: "c" },
  };
  const channels = planSetup(blueprint, state).groups.flatMap((g) => g.channels);
  const claimedC = channels.filter((s) => s.action === "keep" && s.id === "c");
  assert.equal(claimedC.length, 1);
  assert.equal(claimedC[0].spec.key, "games");
  assert.equal(channels.find((s) => s.spec.key === "polls")?.action, "create");
});

test("a channel is matched in its own group before anywhere else", () => {
  const state: ExistingState = {
    roles: [],
    groups: [
      { id: "g-other", name: "Archive", channels: [{ id: "c-old", name: "info", type: "text" }] },
      { id: "g-ter", name: "Bitches Playing Terraria", channels: [{ id: "c-new", name: "info", type: "text" }] },
    ],
    saved: {},
  };
  const info = planSetup(blueprint, state).groups.flatMap((g) => g.channels).find((c) => c.spec.key === "terraria-info")!;
  assert.equal(info.action === "keep" && info.id, "c-new");
  assert.equal(info.needsMove, false);
});
