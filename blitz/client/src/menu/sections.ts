// What's in the menu: a section for each thing Blitz does, drawn the same
// way in the panel beside the bubble and in the dream pages out in open
// space. Everything a section does runs one of Blitz's own commands through
// the menu (so the server checks it like in chat), then the menu refreshes.

import type { MemberCard, MemberLine } from "./api";
import { Menu } from "./menu";
import { MEDALS, Section, SectionContext, bar, busy, button, card, cardTitle, empty, input, memberPicker, note, segmented, select, textarea } from "./pieces";
import { MONTHS, avatar, dateLabel, fromNow, h, rich } from "./ui";
import { constellation } from "./constellation";
import { MORE, startAppeal } from "./sections-plus";

export type { Section, SectionContext } from "./pieces";

// ---- The sections --------------------------------------------------------------------

const you: Section = {
  id: "you",
  icon: "✦",
  title: "You",
  blurb: "Your level, and this community",
  render({ data, menu, go }) {
    const lv = data.levels;
    const root = h("div.msection");
    root.append(
      card(
        h(
          "div.mprofile",
          {},
          avatar(data.userId, data.name || "You", 60),
          h(
            "div.mprofile-text",
            {},
            h("p.mprofile-name", { text: data.name || "You" }),
            lv?.on ? h("p.mprofile-sub", { text: `Level ${lv.level}${lv.place ? ` · #${lv.place} on the leaderboard` : ""}` }) : h("p.mprofile-sub", { text: data.community }),
          ),
        ),
        lv?.on && h("div.mlevel", {}, bar(lv.needed ? lv.into / lv.needed : 0), h("p.mnote", { text: `${lv.into.toLocaleString()} / ${lv.needed.toLocaleString()} XP to level ${lv.level + 1} · ${lv.messages.toLocaleString()} messages` })),
      ),
    );
    const dust = data.stardust;
    if (dust?.on) {
      root.append(
        card(
          h(
            "div.mrow.between",
            {},
            h("div", {}, h("p.mwallet-balance", {}, h("strong", { text: dust.balance.toLocaleString() }), " Stardust"), h("p.mnote", { text: dust.streak > 0 ? `🔥 ${dust.streak}-day streak` : "Start a streak with your daily gift" })),
            dust.dailyReady ? button("✨ Daily gift", (b) => void busy(b, () => menu.run("daily")), "primary") : button("Shop", () => go("stardust"), "ghost"),
          ),
        ),
      );
    }
    const record = data.myCases.filter((c) => !c.revoked);
    if (record.length) {
      const list = h("div.mlist");
      for (const c of record.slice(-5).reverse()) {
        list.append(
          h(
            "div.mlist-row",
            {},
            h("span.mcase-icon", { "aria-hidden": "true" }, KIND_ICON[c.kind] ?? "•"),
            h("div.mlist-main", {}, h("p", { text: `${KIND_WORD[c.kind] ?? c.kind}${c.reason ? `: ${c.reason}` : ""}` }), h("p.mnote", { text: `#${c.id} · ${dateLabel(c.at)}` })),
            ["warn", "mute", "kick"].includes(c.kind) && data.inbox?.on ? button("Appeal", () => (startAppeal(c.id), go("inbox")), "ghost.small") : undefined,
          ),
        );
      }
      root.append(card(cardTitle("Your record"), note("Think one of these was a mistake? Appeal it and the team will take another look."), list));
    }
    if (data.community) {
      root.append(
        card(
          cardTitle(data.community),
          data.about && h("p.mabout", { text: data.about }),
          h("p.mnote", { text: `👥 ${data.members.toLocaleString()} members` }),
        ),
      );
    }
    const shortcuts = h("div.mshortcuts");
    for (const [id, label] of [
      ["stardust", "💫 Dress up Blitz"],
      ["roles", "🎭 Pick roles"],
      ["giveaways", "🎉 Giveaways"],
      ["inbox", "📬 Talk to the team"],
      ["reminders", "⏰ Set a reminder"],
      ["ideas", "💡 Share an idea"],
    ]) {
      shortcuts.append(button(label, () => go(id), "ghost"));
    }
    root.append(card(cardTitle("Shortcuts"), shortcuts));
    return root;
  },
};

const levels: Section = {
  id: "levels",
  icon: "🌿",
  title: "Levels",
  blurb: "The leaderboard",
  render({ data }) {
    const lv = data.levels;
    if (!lv?.on) return h("div.msection", {}, empty("🌿", "Levels are switched off in this community."));
    const list = h("ol.mboard");
    lv.top.forEach((row, i) => {
      list.append(
        h(
          `li.mboard-row${row.userId === data.userId ? ".me" : ""}`,
          {},
          h("span.mboard-place", { text: MEDALS[i] ?? `#${i + 1}` }),
          avatar(row.userId, row.name, 30),
          h("span.mboard-name", { text: row.name }),
          h("span.mboard-level", { text: `Lv ${row.level}` }),
          h("span.mboard-xp", { text: `${row.xp.toLocaleString()} XP` }),
        ),
      );
    });
    const rewards = h("div.mrewards");
    for (const r of data.levelRewards) rewards.append(h(`div.mreward${lv.level >= r.level ? ".got" : ""}`, {}, h("span.mreward-level", { text: `Lv ${r.level}` }), h("span", { text: r.roleName }), h("span.mreward-state", { text: lv.level >= r.level ? "✓ yours" : `${r.level - lv.level} to go` })));
    return h(
      "div.msection",
      {},
      lv.top.length > 1 && card(cardTitle("✨ The constellation"), note("The ten brightest stars of the community. Yours has a golden ring."), constellation(lv.top, data.userId)),
      card(cardTitle("🏆 Leaderboard"), lv.top.length ? list : empty("🏆", "Nobody's on the leaderboard yet. Start chatting!"), lv.place > 10 && note(`You're #${lv.place} with ${lv.xp.toLocaleString()} XP. Keep it up!`)),
      data.levelRewards.length > 0 && card(cardTitle("🎁 Level rewards"), note("Roles you unlock by levelling up."), rewards),
      card(cardTitle("How levels work"), h("p.mabout", { text: lv.how })),
    );
  },
};

const roles: Section = {
  id: "roles",
  icon: "🎭",
  title: "Roles",
  blurb: "Roles you can give yourself",
  render({ data, menu }) {
    if (!data.roles.length) return h("div.msection", {}, empty("🎭", "This community hasn't picked any roles for people to choose yet. An admin can add some in Blitz's App settings."));
    const grid = h("div.mroles");
    for (const role of data.roles) {
      const chip = h(
        `button.mrole${role.mine ? ".on" : ""}`,
        { type: "button", "aria-pressed": String(role.mine), title: role.mine ? `Take off ${role.name}` : `Become ${role.name}` },
        h("span.mrole-dot", { style: role.color ? `background:${role.color};box-shadow:0 0 10px ${role.color}` : "" }),
        h("span", { text: role.name }),
        h("span.mrole-check", { "aria-hidden": "true" }, role.mine ? "✓" : "+"),
      );
      chip.addEventListener("click", () => void busy(chip, () => menu.run("role", role.name)));
      grid.append(chip);
    }
    return h("div.msection", {}, card(cardTitle("Tap one to put it on or take it off"), grid));
  },
};

let remindWhen = "1h";
const reminders: Section = {
  id: "reminders",
  icon: "⏰",
  title: "Reminders",
  blurb: "Blitz reminds you later",
  render({ data, menu }) {
    const list = h("div.mlist");
    for (const r of data.reminders) {
      list.append(
        h(
          "div.mlist-row",
          {},
          h("div.mlist-main", {}, h("p", { text: r.text }), h("p.mnote", { text: `${fromNow(r.at)} · #${r.id}` })),
          button("Cancel", (b) => void busy(b, () => menu.run("forget", String(r.id))), "ghost.small"),
        ),
      );
    }
    const what = input("What should I remind you about?", "", 500);
    const custom = input("or like 45m, 2d", "", 12);
    custom.classList.add("short");
    const go = button("Remind me", (b) => {
      const when = custom.value.trim() || remindWhen;
      if (!what.value.trim()) return what.focus();
      void busy(b, () => menu.run("remind", `${when} ${what.value.trim()}`));
    }, "primary");
    what.addEventListener("keydown", (e) => e.key === "Enter" && go.click());
    return h(
      "div.msection",
      {},
      card(
        cardTitle("New reminder"),
        segmented(
          [
            ["10m", "10 min"],
            ["30m", "30 min"],
            ["1h", "1 hour"],
            ["3h", "3 hours"],
            ["1d", "Tomorrow"],
            ["1w", "1 week"],
          ],
          remindWhen,
          (v) => ((remindWhen = v), (custom.value = "")),
        ),
        h("div.mrow", {}, what, custom),
        h("div.mrow.end", {}, note("You'll get a notification."), go),
      ),
      card(cardTitle("Coming up"), data.reminders.length ? list : empty("⏰", "No reminders yet.")),
    );
  },
};

const birthday: Section = {
  id: "birthday",
  icon: "🎂",
  title: "Birthday",
  blurb: "A shout-out on your day",
  render({ data, menu }) {
    const b = data.birthday ?? { on: false, month: 0, day: 0, upcoming: [] };
    const month = select(MONTHS.map((m, i) => [String(i + 1), m]), String(b.month || 1));
    const day = select(Array.from({ length: 31 }, (_, i) => [String(i + 1), String(i + 1)]), String(b.day || 1));
    const upcoming = h("div.mlist");
    for (const e of b.upcoming) {
      const when = e.inDays === 0 ? "today! 🎉" : e.inDays === 1 ? "tomorrow" : `in ${e.inDays} days`;
      upcoming.append(h("div.mlist-row", {}, avatar(e.userId, e.name, 28), h("div.mlist-main", {}, h("p", { text: e.name }), h("p.mnote", { text: `${MONTHS[e.month - 1]} ${e.day} · ${when}` }))));
    }
    return h(
      "div.msection",
      {},
      card(
        cardTitle(b.month ? `Your birthday: ${MONTHS[b.month - 1]} ${b.day}` : "When's your birthday?"),
        note("Just the day, no year. Blitz celebrates you on it."),
        h("div.mrow", {}, month, day, button("Save", (btn) => void busy(btn, () => menu.run("birthday", `${month.value}-${day.value}`)), "primary")),
        b.month > 0 && h("div.mrow.end", {}, button("Forget my birthday", (btn) => void busy(btn, () => menu.run("birthday", "remove")), "ghost.small")),
        !b.on && note("Shout-outs start once an admin picks a birthday channel in Blitz's settings."),
      ),
      card(cardTitle("Coming up"), b.upcoming.length ? upcoming : empty("🎂", "No birthdays saved yet.")),
    );
  },
};

const STATUS: Record<string, string> = { open: "🗳️ Open for votes", approved: "✅ Approved", denied: "❌ Not this time" };

const ideas: Section = {
  id: "ideas",
  icon: "💡",
  title: "Ideas",
  blurb: "Suggest things, see what's coming",
  render({ data, menu }) {
    const idea = textarea("A weekly movie night…", "", 1500);
    const list = h("div.mlist");
    for (const s of data.suggestions) {
      const actions =
        menu.team && s.status === "open"
          ? h(
              "div.mrow",
              {},
              (() => {
                const why = input("Note (optional)", "", 300);
                return h(
                  "div.mrow.grow",
                  {},
                  why,
                  button("Approve", (b) => void busy(b, () => menu.run("approve", `${s.id} ${why.value.trim()}`)), "small"),
                  button("Deny", (b) => void busy(b, () => menu.run("deny", `${s.id} ${why.value.trim()}`)), "ghost.small"),
                );
              })(),
            )
          : undefined;
      list.append(
        h(
          "div.mlist-row.col",
          {},
          h("div.mrow", {}, h(`span.mpill.${s.status}`, { text: STATUS[s.status] ?? s.status }), h("span.mnote", { text: `#${s.id} from ${s.name}` })),
          h("p", { text: s.text }),
          s.note ? note(`“${s.note}”`) : undefined,
          actions,
        ),
      );
    }
    return h(
      "div.msection",
      {},
      data.suggestionsOn
        ? card(cardTitle("Share an idea"), note("It's posted for everyone to vote on."), idea, h("div.mrow.end", {}, button("Post idea", (b) => {
            if (idea.value.trim().length < 3) return idea.focus();
            void busy(b, () => menu.run("suggest", idea.value.trim()));
          }, "primary")))
        : card(empty("💡", "This community hasn't picked a suggestions channel yet (it's in Blitz's App settings).")),
      card(cardTitle("Latest ideas"), data.suggestions.length ? list : empty("💡", "No ideas yet. Be the first!")),
    );
  },
};

const fun: Section = {
  id: "fun",
  icon: "🎲",
  title: "Fun",
  blurb: "Coins, dice and the 8-ball",
  render({ menu }) {
    const question = input("Will it snow tomorrow?", "", 200);
    const options = input("pizza | tacos | sushi", "", 300);
    const dice = input("2d6+1", "", 20);
    dice.classList.add("short");
    return h(
      "div.msection.mfun",
      {},
      card(h("p.mfun-icon", { text: "🪙" }), cardTitle("Flip a coin"), button("Flip", (b) => void busy(b, () => menu.run("flip")), "primary")),
      card(
        h("p.mfun-icon", { text: "🎲" }),
        cardTitle("Roll dice"),
        h("div.mrow", {}, button("d6", (b) => void busy(b, () => menu.run("roll", "d6"))), button("d20", (b) => void busy(b, () => menu.run("roll", "d20"))), dice, button("Roll", (b) => void busy(b, () => menu.run("roll", dice.value.trim() || "d20")), "primary")),
      ),
      card(h("p.mfun-icon", { text: "🎱" }), cardTitle("Ask the 8-ball"), h("div.mrow", {}, question, button("Ask", (b) => {
        if (question.value.trim().length < 3) return question.focus();
        void busy(b, () => menu.run("8ball", question.value.trim()));
      }, "primary"))),
      card(h("p.mfun-icon", { text: "🤔" }), cardTitle("Can't decide?"), h("div.mrow", {}, options, button("Pick", (b) => void busy(b, () => menu.run("choose", options.value.trim())), "primary"))),
      card(h("p.mfun-icon", { text: "🗣️" }), cardTitle("A saved quote"), button("Show one", (b) => void busy(b, () => menu.run("quote")), "primary")),
    );
  },
};

const CATEGORY_ICON: Record<string, string> = { Community: "💬", Levels: "🌿", Fun: "🎲", Moderation: "🔨", Staff: "🛡️" };
let commandFilter = "";
let openCommand = "";

const commands: Section = {
  id: "commands",
  icon: "📜",
  title: "Commands",
  blurb: "Everything Blitz can do",
  render({ data, menu }) {
    const search = input("Search commands…", commandFilter, 40);
    const root = h("div.msection");
    const lists = h("div");
    const draw = () => {
      const q = commandFilter.trim().toLowerCase().replace(/^!/, "");
      lists.replaceChildren();
      const matches = data.commands.filter((c) => !q || c.name.includes(q) || c.summary.toLowerCase().includes(q));
      for (const category of ["Community", "Levels", "Fun", "Moderation", "Staff"]) {
        const inCat = matches.filter((c) => c.category === category);
        if (!inCat.length) continue;
        const group = h("div.mcmds");
        for (const c of inCat) {
          const open = openCommand === c.name;
          const row = h(`div.mcmd${open ? ".open" : ""}`);
          const head = h("button.mcmd-head", { type: "button", "aria-expanded": String(open) }, h("code", { text: `!${c.name}` }), h("span.mcmd-sum", { text: c.summary }));
          head.addEventListener("click", () => ((openCommand = open ? "" : c.name), draw()));
          row.append(head);
          if (open) {
            const body = h("div.mcmd-body");
            if (c.usage) body.append(note(`Usage: !${c.name} ${c.usage}`));
            if (c.aliases.length) body.append(note(`Also: ${c.aliases.map((a) => `!${a}`).join(", ")}`));
            if (c.menu === "no") body.append(note("This one works in a channel: type it there."));
            else if (c.menu === "channel" && !menu.team) body.append(note("Type this one in the channel you want it in."));
            else {
              const args = input(c.usage || "(nothing needed)", "", 1000);
              const where = c.menu === "channel" ? select(data.channels.map((ch) => [ch.id, `#${ch.name}`])) : undefined;
              const go = button("Try it", (b) => void busy(b, () => menu.run(c.name, args.value.trim(), where?.value ?? "")), "primary.small");
              args.addEventListener("keydown", (e) => e.key === "Enter" && go.click());
              body.append(h("div.mrow", {}, where, args, go));
            }
            row.append(body);
          }
          group.append(row);
        }
        lists.append(card(cardTitle(`${CATEGORY_ICON[category] ?? "✨"} ${category}`), group));
      }
      if (data.customs.length && (!q || data.customs.some((c) => c.name.includes(q)))) {
        const group = h("div.mcmds");
        for (const c of data.customs.filter((c) => !q || c.name.includes(q))) {
          group.append(h("div.mcmd", {}, h("div.mcmd-head.static", {}, h("code", { text: `!${c.name}` }), h("span.mcmd-sum", { text: c.response.replace(/\s+/g, " ").slice(0, 90) })), h("div.mrow.end", {}, button("Show", (b) => void busy(b, () => menu.run(c.name)), "ghost.small"))));
        }
        lists.append(card(cardTitle("📌 This community's own"), group));
      }
      if (!lists.children.length) lists.append(empty("🔍", "No command like that."));
    };
    search.addEventListener("input", () => ((commandFilter = search.value), draw()));
    draw();
    root.append(card(search, note("Pick one to see how it works, and try it right here.")), lists);
    return root;
  },
};

// ---- The team's sections ---------------------------------------------------------------

const KIND_ICON: Record<string, string> = { warn: "⚠️", mute: "🔇", unmute: "🔊", kick: "👢", ban: "🔨", unban: "🕊️", note: "📝" };
const KIND_WORD: Record<string, string> = { warn: "Warning", mute: "Mute", unmute: "Unmute", kick: "Kick", ban: "Ban", unban: "Ban lifted", note: "Note" };
const mod: { picked?: MemberLine; card?: MemberCard; loading?: boolean; confirm?: string; reason: string; muteFor: string; banFor: string } = { reason: "", muteFor: "1h", banFor: "" };

async function loadCard(ctx: SectionContext): Promise<void> {
  if (!mod.picked) return;
  mod.loading = true;
  ctx.redraw();
  mod.card = await ctx.menu.api.member(mod.picked.userId).catch(() => undefined);
  mod.loading = false;
  ctx.redraw();
}

const moderation: Section = {
  id: "moderation",
  icon: "🔨",
  title: "Moderation",
  blurb: "Warnings, mutes, kicks and bans",
  team: true,
  render(ctx) {
    const { data, menu, redraw } = ctx;
    const root = h("div.msection");
    const picker = memberPicker(
      ctx,
      (m) => {
        mod.picked = m;
        mod.card = undefined;
        mod.confirm = undefined;
        if (m) void loadCard(ctx);
        else redraw();
      },
      mod.picked,
    );
    root.append(card(cardTitle("Find a member"), picker));

    const c = mod.card;
    if (mod.picked && (mod.loading || !c)) root.append(card(h("p.mnote.loading", { text: mod.loading ? "Looking them up…" : "Couldn't look them up." })));
    if (mod.picked && c && c.userId) {
      const act = async (b: HTMLButtonElement, command: string, extra = "") => {
        await busy(b, async () => {
          await menu.run(command, `${c.userId} ${extra}${mod.reason.trim()}`.trim());
          mod.reason = "";
          mod.confirm = undefined;
          await loadCard(ctx);
        });
      };
      const reason = input("Reason (optional, they don't see it here)", mod.reason, 300);
      reason.addEventListener("input", () => (mod.reason = reason.value));
      const sure = (command: string, label: string, run: (b: HTMLButtonElement) => void) =>
        mod.confirm === command
          ? button(`Really ${label.toLowerCase()}?`, run, "danger")
          : button(label, () => ((mod.confirm = command), redraw()), "ghost");
      const onTeam = c.access !== "everyone";
      const history = h("div.mlist");
      for (const k of [...c.cases].reverse()) {
        history.append(
          h(
            `div.mlist-row${k.revoked ? ".faded" : ""}`,
            {},
            h("span.mcase-icon", { "aria-hidden": "true" }, KIND_ICON[k.kind] ?? "•"),
            h("div.mlist-main", {}, h("p", { text: `${KIND_WORD[k.kind] ?? k.kind}${k.reason ? `: ${k.reason}` : ""}` }), h("p.mnote", { text: `#${k.id} · by ${k.by} · ${dateLabel(k.at)}${k.revoked ? " · taken back" : ""}` })),
            ["warn", "mute", "ban", "kick", "note"].includes(k.kind) && !k.revoked
              ? button("Take back", (b) =>
                  void busy(b, async () => {
                    await menu.run("unwarn", String(k.id));
                    await loadCard(ctx);
                  }), "ghost.small")
              : undefined,
          ),
        );
      }
      const muteFor = select(
        [
          ["10m", "10 minutes"],
          ["1h", "1 hour"],
          ["1d", "1 day"],
          ["1w", "1 week"],
        ],
        mod.muteFor,
      );
      muteFor.addEventListener("change", () => (mod.muteFor = muteFor.value));
      const banFor = select(
        [
          ["", "For good"],
          ["1d", "1 day"],
          ["7d", "7 days"],
          ["30d", "30 days"],
        ],
        mod.banFor,
      );
      banFor.addEventListener("change", () => (mod.banFor = banFor.value));
      root.append(
        card(
          h(
            "div.mprofile",
            {},
            avatar(c.userId, c.name, 52),
            h(
              "div.mprofile-text",
              {},
              h("p.mprofile-name", { text: c.name }),
              h("p.mprofile-sub", { text: [`Level ${c.level}`, `${c.messages.toLocaleString()} messages`, c.joinedAt ? `joined ${dateLabel(c.joinedAt)}` : ""].filter(Boolean).join(" · ") }),
            ),
          ),
          h("div.mtags", {}, ...c.roles.map((r) => h("span.mtag", { text: r })), c.warnings > 0 && h("span.mtag.warn", { text: `⚠️ ${c.warnings} warning${c.warnings === 1 ? "" : "s"}` }), c.mutedUntil > 0 && h("span.mtag.warn", { text: `🔇 muted, ends ${fromNow(c.mutedUntil)}` }), onTeam && h("span.mtag", { text: "🛡️ on the team" })),
          onTeam
            ? note("They're on the team, so Blitz won't act on them from here.")
            : h(
                "div.mactions",
                {},
                reason,
                h("div.mrow", {}, button("⚠️ Warn", (b) => void act(b, "warn")), button("📝 Note", (b) => void act(b, "note"))),
                h("div.mrow", {}, c.mutedUntil > 0 ? button("🔊 Unmute", (b) => void act(b, "unmute")) : muteFor, c.mutedUntil > 0 ? undefined : button("🔇 Mute", (b) => void act(b, "mute", `${mod.muteFor} `))),
                h("div.mrow", {}, sure("kick", "👢 Kick", (b) => void act(b, "kick"))),
                h("div.mrow", {}, banFor, sure("ban", "🔨 Ban", (b) => void act(b, "ban", mod.banFor ? `${mod.banFor} ` : ""))),
              ),
        ),
        card(cardTitle("History"), c.cases.length ? history : empty("✨", "A clean history.")),
      );
    }

    const bans = h("div.mlist");
    for (const b of data.bans) {
      bans.append(
        h(
          "div.mlist-row",
          {},
          h("span.mcase-icon", { "aria-hidden": "true" }, "🔨"),
          h("div.mlist-main", {}, h("p", { text: b.name }), h("p.mnote", { text: `${b.reason || "No reason given"}${b.until ? ` · ends ${fromNow(b.until)}` : " · for good"}` })),
          button("Lift ban", (btn) => void busy(btn, () => menu.run("unban", b.userId)), "ghost.small"),
        ),
      );
    }
    root.append(card(cardTitle("Banned"), data.bans.length ? bans : empty("🕊️", "Nobody is banned.")));
    return root;
  },
};

let customEdit = { name: "", response: "" };
const customs: Section = {
  id: "customs",
  icon: "📌",
  title: "Our commands",
  blurb: "Your own !rules, !faq and more",
  team: true,
  render({ data, menu, redraw }) {
    const name = input("name (like rules)", customEdit.name, 32);
    const response = textarea("What Blitz answers. {user} becomes whoever uses it.", customEdit.response, 4000);
    const list = h("div.mlist");
    for (const c of data.customs) {
      list.append(
        h(
          "div.mlist-row.col",
          {},
          h("div.mrow", {}, h("code", { text: `!${c.name}` }), h("span.mnote", { text: `used ${c.uses} time${c.uses === 1 ? "" : "s"}` })),
          rich(c.response),
          h("div.mrow.end", {}, button("Edit", () => ((customEdit = { name: c.name, response: c.response }), redraw()), "ghost.small"), button("Remove", (b) => void busy(b, () => menu.run("delcmd", c.name)), "ghost.small")),
        ),
      );
    }
    return h(
      "div.msection",
      {},
      card(
        cardTitle(customEdit.name ? `Edit !${customEdit.name}` : "Make a command"),
        note("Anyone can then type it, or find it in the menu. Handy for rules, FAQs and links."),
        name,
        response,
        h("div.mrow.end", {}, customEdit.name ? button("Cancel", () => ((customEdit = { name: "", response: "" }), redraw()), "ghost") : undefined, button("Save", (b) => {
          const n = name.value.trim().replace(/^!/, "");
          if (!n) return name.focus();
          if (!response.value.trim()) return response.focus();
          void busy(b, async () => {
            await menu.run("addcmd", `${n} ${response.value.trim()}`);
            customEdit = { name: "", response: "" };
          });
        }, "primary")),
      ),
      card(cardTitle("Your commands"), data.customs.length ? list : empty("📌", "None yet.")),
    );
  },
};

let postKind = "announce";
const post: Section = {
  id: "post",
  icon: "📣",
  title: "Post",
  blurb: "Announcements, events and polls",
  team: true,
  render({ data, menu }) {
    if (!data.channels.length) return h("div.msection", {}, empty("📣", "Blitz can't see any text channels to post in."));
    const channel = select(data.channels.map((c) => [c.id, `#${c.name}${c.group ? ` · ${c.group}` : ""}`]));
    const hints: Record<string, string> = {
      announce: "We hit 100 members! 🎉",
      event: "Game night Friday 8pm UTC 🎮",
      say: "Hello everyone!",
      poll: "Best snack? | Chips | Cookies | Fruit  (start with 1h to close it after an hour)",
    };
    const text = textarea(hints[postKind], "", 3000);
    return h(
      "div.msection",
      {},
      card(
        cardTitle("Post in a channel"),
        segmented(
          [
            ["announce", "📣 Announcement"],
            ["event", "📅 Event"],
            ["poll", "📊 Poll"],
            ["say", "✨ As Blitz"],
          ],
          postKind,
          (v) => ((postKind = v), (text.placeholder = hints[v])),
        ),
        h("p.mlabel", { text: "Where" }),
        channel,
        h("p.mlabel", { text: "What" }),
        text,
        h("div.mrow.end", {}, button("Post", (b) => {
          if (!text.value.trim()) return text.focus();
          void busy(b, () => menu.run(postKind, text.value.trim(), channel.value));
        }, "primary")),
      ),
    );
  },
};

let setupText: string | undefined;
const setup: Section = {
  id: "setup",
  icon: "🛠️",
  title: "Setup",
  blurb: "What Blitz is set up to do here",
  team: true,
  render({ menu, redraw, data }) {
    const fetch = async () => {
      const res = await menu.api.run("settings").catch(() => ({ ok: false, replies: ["⚠️ I couldn't reach my server."] }));
      setupText = res.replies.join("\n\n");
      redraw();
    };
    if (setupText === undefined) void fetch();
    return h(
      "div.msection",
      {},
      card(setupText === undefined ? h("p.mnote.loading", { text: "Checking…" }) : rich(setupText), h("div.mrow.end", {}, button("Refresh", (b) => void busy(b, fetch), "ghost.small"))),
      levelRewardsCard(menu, data.levelRewards),
      card(cardTitle("Changing these"), note("In Root, open Community settings, then Apps, then Blitz. Channels, roles, the shields and the warning ladder are all there.")),
    );
  },
};

function levelRewardsCard(menu: Menu, rewards: SectionContext["data"]["levelRewards"]): HTMLElement {
  const level = input("Level", "", 3);
  level.classList.add("short");
  level.inputMode = "numeric";
  const role = input("Role name, like Regular", "", 80);
  const list = h("div.mlist");
  for (const r of rewards) list.append(h("div.mlist-row", {}, h("span.mreward-level", { text: `Lv ${r.level}` }), h("div.mlist-main", {}, h("p", { text: r.roleName })), button("Remove", (b) => void busy(b, () => menu.run("levelrole", `remove ${r.level}`)), "ghost.small")));
  return card(
    cardTitle("🎁 Level rewards"),
    note("Give a role to everyone who reaches a level. Free, however many you add. Blitz's role must be above them."),
    rewards.length > 0 && list,
    h("div.mrow", {}, level, role, button("Add", (b) => {
      if (!Number(level.value)) return level.focus();
      if (!role.value.trim()) return role.focus();
      void busy(b, () => menu.run("levelrole", `${Number(level.value)} ${role.value.trim()}`));
    }, "primary")),
    rewards.length > 0 && h("div.mrow.end", {}, button("Give them to everyone already past", (b) => void busy(b, () => menu.run("levelrole", "sync")), "ghost.small")),
  );
}

export const SECTIONS: Section[] = [you, levels, MORE.stardust, roles, MORE.giveaways, reminders, birthday, ideas, MORE.inbox, fun, commands, MORE.guardian, moderation, MORE.pulse, MORE.ask, post, customs, setup];

/** The sections someone sees. */
export function sectionsFor(menu: Menu): Section[] {
  return SECTIONS.filter((s) => !s.team || menu.team);
}
