// `!setup`: turns blueprint/layout.ts into the real community.
//
//   !setup              preview what will be created (changes nothing)
//   !setup confirm      build it: roles, groups, channels, permissions, posts
//   !setup content      post any starter messages that are missing
//   !setup refresh      re-render starter messages after editing content.ts
//   !setup permissions  re-apply the blueprint's access rules to what exists
//   !setup status       what's mapped and what's missing
//
// Setup only ever creates and moves things. It never deletes or renames
// anything, and it leaves the settings of existing roles alone.

import {
  rootServer,
  AccessRuleCreateRoleOrMemberRequest,
  AccessRuleCreateRequest,
  AccessRuleEditRequest,
  ChannelGroupGuid,
  ChannelGuid,
  ChannelOrChannelGroupGuid,
  ChannelType,
  ErrorCodeType,
  RoleOrMemberGuid,
  UserGuid,
} from "@rootsdk/server-bot";
import { blueprint } from "../blueprint/layout";
import { channelPermission, communityPermission, hasElevatedPermissions, SELF } from "../blueprint/permissions";
import { ChannelStep, countPlan, planSetup, savedKey, SetupPlan } from "../blueprint/plan";
import { channelRules, groupRules } from "../blueprint/rules";
import type { AccessRuleSpec, ChannelSpec, GroupSpec, RoleSpec } from "../blueprint/types";
import { validateAll } from "../blueprint/validate";
import { config } from "../config";
import { describeError, errorCode, isPermissionError, read, write } from "../core/api";
import { Command, CommandContext, UsageError } from "../core/commands";
import { directory, fetchExistingState } from "../core/directory";
import { errMessage, log } from "../core/log";
import { botUserId, hasRole, isPerson, noteRoleChange } from "../core/members";
import { edit, modLog, send } from "../core/messaging";
import { plural, sanitizeChannelName, truncate } from "../logic/text";
import { publishContent, PostResult } from "./posts";

let running = false;

export const setupCommands: Command[] = [
  {
    name: "setup",
    usage: "[confirm | content | refresh | permissions | status]",
    summary: "Build or repair the community from the blueprint.",
    level: "admin",
    category: "Setup",
    async run(ctx) {
      const problems = validateAll(blueprint);
      if (problems.length > 0) {
        await ctx.reply(["⚠️ **The blueprint has problems. Fix these in `blueprint/layout.ts` first:**", ...problems.slice(0, 15).map((p) => `• ${p}`)].join("\n"));
        return;
      }
      const sub = (ctx.args[0] ?? "").toLowerCase();
      if (running && sub !== "" && sub !== "status") {
        await ctx.reply("⏳ Setup is already running. Give it a minute!");
        return;
      }
      switch (sub) {
        case "":
          return preview(ctx);
        case "confirm":
          return exclusive(() => build(ctx));
        case "content":
        case "refresh":
          return exclusive(() => content(ctx, sub === "refresh"));
        case "permissions":
          return exclusive(() => permissions(ctx));
        case "status":
          return status(ctx);
        default:
          throw new UsageError(`Try \`${config.prefix}setup\` to preview, then \`${config.prefix}setup confirm\` to build.`);
      }
    },
  },
];

async function exclusive(work: () => Promise<void>): Promise<void> {
  running = true;
  try {
    await work();
  } finally {
    running = false;
  }
}

// --- Preview ----------------------------------------------------------------

async function preview(ctx: CommandContext): Promise<void> {
  const plan = planSetup(blueprint, await fetchExistingState());
  const counts = countPlan(plan);
  const lines = ["🌱 **Setup preview** (nothing has changed yet)", ""];

  lines.push(`**Roles:** create ${counts.create.roles}${counts.keep.roles ? `, keep ${counts.keep.roles} that already exist` : ""}`);
  lines.push(`**Channel groups:** create ${counts.create.groups}${counts.keep.groups ? `, keep ${counts.keep.groups}` : ""}`);
  lines.push(`**Channels:** create ${counts.create.channels}${counts.keep.channels ? `, keep ${counts.keep.channels}` : ""}`);
  for (const step of movesOf(plan)) {
    lines.push(`↪️ Move #${step.spec.name} into **${groupOfChannel(step.spec.key)?.name}**`);
  }
  lines.push("");
  lines.push(
    config.onboarding.gate
      ? "Then I'll post the welcome guide, the rules with the ✅ gate and the role pickers, and give **Member** to everyone already here so nobody gets locked out."
      : "Then I'll post the welcome guide, the rules and the role pickers.",
  );
  if (counts.missing.length > 0) {
    lines.push("", `⚠️ I couldn't find Root's built-in role(s): ${counts.missing.join(", ")}. If you renamed it, that's fine.`);
  }
  const strays = plan.leftovers.channels;
  if (strays.length > 0) {
    lines.push("", `ℹ️ Not in the blueprint, left untouched: ${strays.slice(0, 10).map((c) => `#${c.name}`).join(", ")}${strays.length > 10 ? "…" : ""}`);
  }
  const writes = counts.create.roles + counts.create.groups + counts.create.channels + 60;
  lines.push("", `Type \`${config.prefix}setup confirm\` to build it. It takes about ${Math.max(1, Math.ceil(writes / 5 / 60) + 1)} minute(s).`);
  await ctx.reply(lines.join("\n"));
}

function movesOf(plan: SetupPlan): ChannelStep[] {
  return plan.groups.flatMap((g) => g.channels).filter((c) => c.needsMove);
}

function groupOfChannel(channelKey: string): GroupSpec | undefined {
  return blueprint.groups.find((g) => g.channels.some((c) => c.key === channelKey));
}

// --- Build ------------------------------------------------------------------

interface Progress {
  update(text: string): Promise<void>;
}

async function progressMessage(channelId: string, first: string): Promise<Progress> {
  const msg = await send(channelId, first);
  return {
    update: (text) => edit(channelId, msg.id, text).catch((err) => log("warn", "progress edit failed", { error: errMessage(err) })),
  };
}

async function build(ctx: CommandContext): Promise<void> {
  // Posting first also teaches the bot its own member ID, used for "@self" rules.
  const progress = await progressMessage(ctx.channelId, "🌱 **Building your community…** reading what's already here");
  const notes: string[] = [];

  try {
    const state = await fetchExistingState();
    const plan = planSetup(blueprint, state);
    const counts = countPlan(plan);

    await progress.update(`🌱 **Building your community…** creating ${plural(counts.create.roles, "role")}`);
    await buildRoles(plan, notes);

    await progress.update("🌱 **Building your community…** channel groups and channels");
    const createdGroups = await buildGroupsAndChannels(plan, notes);
    await moveChannels(plan, notes);
    await orderNewGroups(plan, createdGroups, state.groups.length > 0 && counts.keep.groups === 0);

    let unlocked = 0;
    if (config.onboarding.gate) {
      await progress.update("🌱 **Building your community…** letting everyone who's already here in");
      unlocked = await giveExistingMembersAccess(notes);
    }

    await progress.update("🌱 **Building your community…** posting the welcome guide, rules and role pickers");
    const posts = await publishContent(false);
    await directory.sync();

    const report = buildReport(plan, counts, posts, unlocked, notes);
    await progress.update(report);
    await modLog(`🛠️ Setup run by an admin finished.\n${truncate(report, 3000)}`);
  } catch (err) {
    log("error", "setup failed", { error: errMessage(err) });
    await progress.update(
      `⚠️ **Setup stopped:** ${describeError(err)}\nEverything created so far is kept. Fix the problem and run \`${config.prefix}setup confirm\` again; it picks up where it left off.`,
    );
  }
}

/** `@self` -> the bot, `@everyone` -> Root's EVERYONE role, anything else -> a blueprint role. */
function resolveRules(rules: readonly AccessRuleSpec[], notes: string[]): AccessRuleCreateRoleOrMemberRequest[] {
  const out: AccessRuleCreateRoleOrMemberRequest[] = [];
  for (const r of rules) {
    const id = r.subject === SELF ? botUserId() : directory.roleId(r.subject);
    if (!id) {
      if (r.subject !== SELF) notes.push(`Skipped a permission rule for role "${r.subject}" (it doesn't exist yet).`);
      continue;
    }
    out.push({ roleOrMemberId: id as RoleOrMemberGuid, overlay: r.overlay });
  }
  return out;
}

async function buildRoles(plan: SetupPlan, notes: string[]): Promise<void> {
  for (const step of plan.roles) {
    if (step.action === "keep") {
      await directory.save(savedKey("role", step.spec.key), step.id);
    } else if (step.action === "create") {
      const id = await createRole(step.spec, notes);
      await directory.save(savedKey("role", step.spec.key), id);
    }
  }
}

async function createRole(spec: RoleSpec, notes: string[]): Promise<string> {
  let name = spec.name;
  let color = spec.color;
  let withPermissions = hasElevatedPermissions(spec.community, spec.channel);
  const compromises: string[] = [];

  // Retry with smaller asks: a permission error drops the special
  // permissions, a validation error tries another color format, no color,
  // then a plain name.
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const role = await write("communityRoles.create", () =>
        rootServer.community.communityRoles.create({
          name,
          colorHex: color,
          isMentionable: spec.mentionable,
          isSelfAssignable: spec.selfAssignable,
          communityPermission: withPermissions ? communityPermission(spec.community) : undefined,
          channelPermission: withPermissions ? channelPermission(spec.channel) : undefined,
        }),
      );
      if (compromises.length > 0) notes.push(`Role **${role.name}** was created ${compromises.join(" and ")}.`);
      return role.id;
    } catch (err) {
      if (withPermissions && isPermissionError(err)) {
        withPermissions = false;
        compromises.push("without its special permissions (add them in the role's settings)");
        continue;
      }
      if (errorCode(err) === ErrorCodeType.RequestValidationFailed) {
        if (color?.startsWith("#")) {
          color = color.slice(1);
          continue;
        }
        if (color) {
          color = undefined;
          compromises.push("without its color");
          continue;
        }
        const plain = sanitizeChannelName(name);
        if (plain && plain !== name) {
          name = plain;
          compromises.push(`as "${plain}"`);
          continue;
        }
      }
      throw err;
    }
  }
  throw new Error(`Couldn't create role ${spec.name}`);
}

async function createGroup(spec: GroupSpec, notes: string[]): Promise<string> {
  let name = spec.name;
  let rules = resolveRules(groupRules(spec, config.onboarding.gate), notes);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const group = await write("channelGroups.create", () =>
        rootServer.community.channelGroups.create({ name, accessRuleCreates: rules.length > 0 ? rules : undefined }),
      );
      return group.id;
    } catch (err) {
      if (rules.length > 0 && isPermissionError(err)) {
        rules = [];
        notes.push(`Group **${name}** was created without its permissions. Run \`${config.prefix}setup permissions\` once I have full channel control.`);
        continue;
      }
      const plain = sanitizeChannelName(name);
      if (errorCode(err) === ErrorCodeType.RequestValidationFailed && plain && plain !== name) {
        name = plain;
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Couldn't create group ${spec.name}`);
}

async function createChannel(groupId: string, group: GroupSpec, spec: ChannelSpec, notes: string[]): Promise<string> {
  const computed = channelRules(group, spec, config.onboarding.gate);
  let inherit = computed.inherit;
  let rules = inherit ? [] : resolveRules(computed.rules, notes);
  let description: string | undefined = spec.topic;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const channel = await write("channels.create", () =>
        rootServer.community.channels.create({
          channelGroupId: groupId as ChannelGroupGuid,
          name: spec.name,
          description,
          channelType: spec.type === "voice" ? ChannelType.Voice : ChannelType.Text,
          useChannelGroupPermission: inherit,
          accessRuleCreates: inherit ? undefined : rules,
        }),
      );
      return channel.id;
    } catch (err) {
      if (!inherit && isPermissionError(err)) {
        inherit = true;
        rules = [];
        notes.push(`#${spec.name} was created with its group's permissions. Run \`${config.prefix}setup permissions\` to apply its own.`);
        continue;
      }
      if (errorCode(err) === ErrorCodeType.RequestValidationFailed && description) {
        description = description.length > 100 ? truncate(description, 100) : undefined;
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Couldn't create #${spec.name}`);
}

/** Creates missing groups and channels. Returns the blueprint keys of groups created. */
async function buildGroupsAndChannels(plan: SetupPlan, notes: string[]): Promise<Set<string>> {
  const created = new Set<string>();
  for (const { group, channels } of plan.groups) {
    let groupId: string;
    if (group.action === "keep") {
      groupId = group.id;
    } else {
      groupId = await createGroup(group.spec, notes);
      created.add(group.spec.key);
    }
    await directory.save(savedKey("group", group.spec.key), groupId);

    for (const step of channels) {
      if (step.action === "keep") {
        await directory.save(savedKey("channel", step.spec.key), step.id);
      } else {
        const id = await createChannel(groupId, group.spec, step.spec, notes);
        await directory.save(savedKey("channel", step.spec.key), id);
      }
    }
  }
  return created;
}

/** Moves matched channels (like a fresh community's #general) into their blueprint group, in blueprint order. */
async function moveChannels(plan: SetupPlan, notes: string[]): Promise<void> {
  for (const { group, channels } of plan.groups) {
    const groupId = directory.groupId(group.spec.key);
    if (!groupId) continue;
    for (let i = 0; i < channels.length; i++) {
      const step = channels[i];
      if (step.action !== "keep" || !step.needsMove || !step.currentGroupId) continue;
      const next = channels.slice(i + 1).map((c) => directory.channelId(c.spec.key)).find(Boolean);
      try {
        await write("channels.move", () =>
          rootServer.community.channels.move({
            id: step.id as ChannelGuid,
            oldChannelGroupId: step.currentGroupId as ChannelGroupGuid,
            newChannelGroupId: groupId,
            beforeChannelId: next,
          }),
        );
      } catch (err) {
        notes.push(`Couldn't move #${step.spec.name} into ${group.spec.name}: ${describeError(err)}`);
      }
    }
  }
}

/**
 * New groups are added at the bottom of the sidebar. Put each one above the
 * next blueprint group; on a fresh setup, put the whole set above whatever
 * the community started with.
 */
async function orderNewGroups(plan: SetupPlan, created: Set<string>, freshSetup: boolean): Promise<void> {
  const firstForeign = plan.leftovers.groups[0]?.id;
  const keys = blueprint.groups.map((g) => g.key);
  for (let i = keys.length - 1; i >= 0; i--) {
    if (!created.has(keys[i])) continue;
    const id = directory.groupId(keys[i]);
    const before = i + 1 < keys.length ? directory.groupId(keys[i + 1]) : freshSetup ? firstForeign : undefined;
    if (!id || !before) continue;
    try {
      await write("channelGroups.move", () =>
        rootServer.community.channelGroups.move({ id, beforeChannelGroupId: before as ChannelGroupGuid }),
      );
    } catch (err) {
      log("warn", "couldn't reorder a channel group", { error: errMessage(err) });
    }
  }
}

/** With the gate on, existing members get the Member role so nobody is locked out. */
async function giveExistingMembersAccess(notes: string[]): Promise<number> {
  const roleId = directory.roleId("member");
  if (!roleId) return 0;
  const members = await read("communityMembers.listAll", () => rootServer.community.communityMembers.listAll());
  const missing = members
    .filter((m) => isPerson(m.userId) && !m.communityRoleIds.includes(roleId) && !hasRole(m.userId, roleId))
    .map((m) => m.userId);
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    try {
      await write("communityMemberRoles.add", () =>
        rootServer.community.communityMemberRoles.add({ communityRoleId: roleId, userIds: batch as UserGuid[] }),
      );
      for (const id of batch) noteRoleChange(id, roleId, true);
    } catch (err) {
      notes.push(`Couldn't give Member to ${plural(batch.length, "existing member")}: ${describeError(err)}`);
    }
  }
  return missing.length;
}

function buildReport(plan: SetupPlan, counts: ReturnType<typeof countPlan>, posts: PostResult, unlocked: number, notes: string[]): string {
  const c = counts.create;
  const lines = [
    "✅ **Your community is ready!**",
    "",
    `Created ${plural(c.roles, "role")}, ${plural(c.groups, "channel group")} and ${plural(c.channels, "channel")} · posted ${plural(posts.posted.length, "message")}${
      unlocked > 0 ? ` · let ${plural(unlocked, "existing member")} in` : ""
    }.`,
  ];
  if (counts.moves > 0) lines.push(`Moved ${plural(counts.moves, "existing channel")} into place.`);

  lines.push("", "**A few finishing touches only you can do:**");
  lines.push(`1. Give your team their roles: **Moderator** for mods, **Event Host** for people who run events. Staff should have **Member** too.`);
  lines.push("2. In **Settings → Roles**, drag Moderator and Event Host up near Admin. Role order decides who can manage whom.");
  lines.push(`3. In community settings, set ${directory.channelMention("welcome")} as the default channel, so Root's join notices appear next to the welcome guide.`);
  lines.push("4. Add a community icon and banner, then post your first announcement!");
  const empty = plan.leftovers.groups.filter((g) => g.channels.every((ch) => plan.groups.some((s) => s.channels.some((c) => c.action === "keep" && c.id === ch.id))));
  if (empty.length > 0) lines.push(`5. These old groups are now empty and can be deleted: ${empty.map((g) => `**${g.name}**`).join(", ")}.`);

  const problems = [...new Set([...notes, ...posts.failed.map((key) => `Couldn't post "${key}".`)])];
  if (problems.length > 0) {
    lines.push("", "**Heads up:**", ...problems.slice(0, 12).map((n) => `• ${n}`));
    if (problems.length > 12) lines.push(`• …and ${problems.length - 12} more (see the developer log).`);
  }
  return lines.join("\n");
}

// --- Content, permissions, status -------------------------------------------

async function content(ctx: CommandContext, refresh: boolean): Promise<void> {
  const result = await publishContent(refresh);
  const parts = [
    result.posted.length ? `posted ${result.posted.length}` : "",
    result.refreshed.length ? `refreshed ${result.refreshed.length}` : "",
    result.skipped.length ? `${result.skipped.length} already there` : "",
    result.failed.length ? `⚠️ ${result.failed.length} failed (${result.failed.join(", ")}): is setup done?` : "",
  ].filter(Boolean);
  await ctx.reply(`📝 Starter posts: ${parts.join(" · ") || "nothing to do"}.`);
}

async function permissions(ctx: CommandContext): Promise<void> {
  const notes: string[] = [];
  let applied = 0;
  const gate = config.onboarding.gate;

  for (const group of blueprint.groups) {
    const groupId = directory.groupId(group.key);
    if (!groupId) continue;
    applied += await applyRules(groupId, resolveRules(groupRules(group, gate), notes), notes);

    for (const channel of group.channels) {
      const channelId = directory.channelId(channel.key);
      const wanted = channelRules(group, channel, gate);
      if (!channelId || wanted.inherit) continue;
      try {
        const current = await read("channels.get", () => rootServer.community.channels.get({ id: channelId }));
        if (current.useChannelGroupPermission) {
          await write("channels.edit", () =>
            rootServer.community.channels.edit({
              id: channelId,
              name: current.name,
              description: current.description,
              updateIcon: false,
              useChannelGroupPermission: false,
            }),
          );
        }
        applied += await applyRules(channelId, resolveRules(wanted.rules, notes), notes);
      } catch (err) {
        notes.push(`#${channel.name}: ${describeError(err)}`);
      }
    }
  }
  const unique = [...new Set(notes)];
  const tail = unique.length ? `\n${unique.slice(0, 10).map((n) => `• ${n}`).join("\n")}` : "";
  await ctx.reply(`🔐 Permissions checked: ${plural(applied, "rule")} added or updated.${tail}`);
}

/** Creates or updates the given rules on a group/channel. Rules for other roles are left alone. */
async function applyRules(targetId: string, wanted: AccessRuleCreateRoleOrMemberRequest[], notes: string[]): Promise<number> {
  const target = targetId as ChannelOrChannelGroupGuid;
  try {
    const existing = await read("accessRules.listByChannelOrChannelGroup", () =>
      rootServer.community.accessRules.listByChannelOrChannelGroup({ channelOrChannelGroupId: target }),
    );
    const creates: AccessRuleCreateRequest[] = [];
    const edits: AccessRuleEditRequest[] = [];
    for (const w of wanted) {
      const have = existing.find((r) => r.roleOrMemberId === w.roleOrMemberId);
      const overlay = { ...(have?.overlay ?? {}), ...(w.overlay ?? {}) };
      if (!have) creates.push({ channelOrChannelGroupId: target, roleOrMemberId: w.roleOrMemberId, overlay });
      else if (JSON.stringify(have.overlay) !== JSON.stringify(overlay)) {
        edits.push({ channelOrChannelGroupId: target, roleOrMemberId: w.roleOrMemberId, overlay });
      }
    }
    if (creates.length + edits.length > 0) {
      await write("accessRules.bulkCreateEditDelete", () => rootServer.community.accessRules.bulkCreateEditDelete({ creates, edits }));
    }
    return creates.length + edits.length;
  } catch (err) {
    notes.push(describeError(err));
    return 0;
  }
}

async function status(ctx: CommandContext): Promise<void> {
  await directory.sync();
  const missingRoles = blueprint.roles.filter((r) => !directory.roleId(r.key)).map((r) => r.name);
  const channels = blueprint.groups.flatMap((g) => g.channels);
  const missingChannels = channels.filter((c) => !directory.channelId(c.key)).map((c) => `#${c.name}`);
  const lines = [
    "📋 **Setup status**",
    `Roles: ${blueprint.roles.length - missingRoles.length}/${blueprint.roles.length}${missingRoles.length ? ` (missing: ${missingRoles.join(", ")})` : " ✅"}`,
    `Channels: ${channels.length - missingChannels.length}/${channels.length}${missingChannels.length ? ` (missing: ${missingChannels.join(", ")})` : " ✅"}`,
    `Onboarding gate: ${config.onboarding.gate ? "on" : "off"} · Bot ID known: ${botUserId() ? "yes" : "not yet"}`,
  ];
  if (running) lines.push("⏳ A setup run is in progress.");
  if (missingRoles.length + missingChannels.length > 0) lines.push(`Run \`${config.prefix}setup\` to preview a fix.`);
  await ctx.reply(lines.join("\n"));
}
