// Generates docs/SERVER-LAYOUT.md from the blueprint, so the docs never drift
// from what `!setup` actually builds. Run with `npm run docs`.

import { writeFileSync } from "node:fs";
import { rolePanels } from "../src/blueprint/content";
import { blueprint } from "../src/blueprint/layout";
import { EVERYONE, SELF } from "../src/blueprint/permissions";
import { channelRules, groupRules } from "../src/blueprint/rules";
import type { AccessRuleSpec, RoleCategory } from "../src/blueprint/types";
import { config } from "../src/config";

const gate = config.onboarding.gate;

function who(subject: string): string {
  if (subject === EVERYONE) return "everyone";
  if (subject === SELF) return config.botName;
  return blueprint.roles.find((r) => r.key === subject)?.name ?? subject;
}

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Plain-English summary of a rule set. */
function describe(rules: readonly AccessRuleSpec[]): string {
  const everyone = rules.find((r) => r.subject === EVERYONE)?.overlay ?? {};
  const granted = (field: keyof AccessRuleSpec["overlay"]) =>
    rules.filter((r) => r.subject !== EVERYONE && r.subject !== SELF && r.overlay[field] === true).map((r) => who(r.subject));
  const parts: string[] = [];
  if (everyone.channelView === false) {
    const viewers = granted("channelView");
    parts.push(viewers.length ? `visible to ${list(viewers)}` : "hidden");
  } else {
    parts.push("visible to everyone");
  }
  if (everyone.channelCreateMessage === false) {
    const posters = granted("channelCreateMessage");
    parts.push(posters.length ? `read-only except for ${list(posters)}` : "read-only");
  }
  if (everyone.channelVoiceTalk === false) {
    const speakers = granted("channelVoiceTalk");
    parts.push(speakers.length ? `listen-only except for ${list(speakers)}` : "listen-only");
  }
  return parts.join("; ");
}

const CATEGORY_TITLES: Record<RoleCategory, string> = {
  staff: "Staff",
  member: "Membership",
  level: "Level rewards",
  special: "Special",
  color: "Name colors",
  interest: "Interests",
  ping: "Notification pings",
  pronoun: "Pronouns",
};

function render(): string {
  const out: string[] = [];
  const channels = blueprint.groups.flatMap((g) => g.channels);
  out.push("# Server layout");
  out.push("");
  out.push("> Generated from [`bot/src/blueprint/layout.ts`](../bot/src/blueprint/layout.ts) by `npm run docs`. Edit the blueprint, not this file.");
  out.push("");
  out.push(
    `**${blueprint.groups.length} channel groups · ${channels.filter((c) => c.type === "text").length} text channels · ${
      channels.filter((c) => c.type === "voice").length
    } voice channels · ${blueprint.roles.length} roles**`,
  );
  out.push("");
  if (gate) {
    out.push(
      "The onboarding gate is **on**: newcomers see only **Start Here** until they react ✅ on the rules post, which gives them the **Member** role and unlocks everything else.",
    );
    out.push("");
  }

  out.push("## Channels");
  for (const group of blueprint.groups) {
    const gRules = groupRules(group, gate);
    out.push("");
    out.push(`### ${group.name}`);
    out.push("");
    out.push(`${group.description} _(${describe(gRules)})_`);
    out.push("");
    out.push("| Channel | Type | What it's for | Access |");
    out.push("| --- | --- | --- | --- |");
    for (const c of group.channels) {
      const cr = channelRules(group, c, gate);
      const access = cr.inherit ? "same as group" : describe(cr.rules);
      const type = c.type === "voice" ? "🔊 voice" : "💬 text";
      out.push(`| \`${c.name}\` | ${type} | ${c.topic.replace(/\|/g, "\\|")} | ${access} |`);
    }
  }

  out.push("");
  out.push("## Roles");
  const categories = [...new Set(blueprint.roles.map((r) => r.category))];
  for (const category of categories) {
    out.push("");
    out.push(`### ${CATEGORY_TITLES[category]}`);
    out.push("");
    out.push("| Role | Color | Pingable | Self-assignable | Notes |");
    out.push("| --- | --- | --- | --- | --- |");
    for (const r of blueprint.roles.filter((role) => role.category === category)) {
      const color = r.color ? `\`${r.color}\`` : "default";
      out.push(`| **${r.name}** | ${color} | ${r.mentionable ? "yes" : "no"} | ${r.selfAssignable ? "yes" : "no"} | ${r.description}${r.builtIn ? " _(built into Root)_" : ""} |`);
    }
  }

  out.push("");
  out.push("## Role pickers in `#roles`");
  for (const panel of rolePanels) {
    out.push("");
    out.push(`**${panel.title}**${panel.exclusive ? " (pick one)" : ""}: ${panel.options.map((o) => `${o.emoji.glyph} ${who(o.role)}`).join(" · ")}`);
  }

  out.push("");
  out.push("## Levels");
  out.push("");
  out.push(
    `${config.levels.minXp}-${config.levels.maxXp} XP per message, at most once every ${config.levels.cooldownSeconds} seconds. Rewards: ${config.levels.rewards
      .map((r) => `level ${r.level} → **${who(r.role)}**`)
      .join(", ")}${config.levels.stackRewards ? "" : " (members keep only their highest)"}.`,
  );
  out.push("");
  return out.join("\n");
}

const target = process.argv[2];
if (!target) {
  process.stdout.write(render());
} else {
  writeFileSync(target, render());
  console.log(`Wrote ${target}`);
}
