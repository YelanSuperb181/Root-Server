// The newer sections: Stardust and Blitz's looks, giveaways, the inbox
// (talking privately with the team, reports and appeals), and for the team,
// Guardian (the shields), Pulse (the community's vital signs) and Ask Blitz.
// Like every section, actions run Blitz's own commands through the menu.

import { COSMETICS, CosmeticSlot } from "@blitz/shared";
import type { MemberLine, MenuOverview, TicketInfo, TicketThread } from "./api";
import { barList, healthFigure, hoursChart, statTile, tableView, trendChart, upDownChart } from "./charts";
import { Section, SectionContext, busy, button, card, cardTitle, empty, input, memberPicker, note, segmented, select, textarea } from "./pieces";
import { Outfit, blitzPortrait } from "./preview";
import { avatar, fromNow, h, rich } from "./ui";

const ago = (at: number) => {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
};
const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

// ---- Stardust ------------------------------------------------------------------------

/** An outfit being tried on in the shop (not bought yet). */
let tryOn: Outfit | undefined;
const SLOT_TITLE: Record<CosmeticSlot, string> = { hat: "🎩 Hats", trail: "🌠 Trails", glow: "🔮 Glows" };

const stardust: Section = {
  id: "stardust",
  icon: "💫",
  title: "Stardust",
  blurb: "Your daily gift, and looks for your Blitz",
  render({ data, menu, redraw }) {
    const d = data.stardust;
    if (!d?.on) return h("div.msection", {}, empty("💫", "Stardust is switched off in this community."));
    const wearing: Outfit = { hat: d.hat, trail: d.trail, glow: d.glow };
    const shown = tryOn ?? wearing;
    const trying = tryOn !== undefined;
    const daily = d.dailyReady
      ? button("✨ Collect today's gift", (b) => void busy(b, () => menu.run("daily")), "primary")
      : h("p.mnote", { text: `🌙 Next gift ${fromNow(d.nextDaily)}` });
    const head = card(
      h(
        "div.mwallet",
        {},
        h("div.mportrait-wrap", {}, blitzPortrait(shown)),
        h(
          "div.mwallet-text",
          {},
          h("p.mwallet-balance", {}, h("strong", { text: d.balance.toLocaleString() }), " Stardust"),
          h("p.mnote", { text: d.streak > 0 ? `🔥 ${d.streak}-day streak · ${d.earned.toLocaleString()} collected in all` : `${d.earned.toLocaleString()} collected in all` }),
          daily,
          trying && h("div.mrow", {}, h("span.mtag", { text: "Trying on" }), button("Back to my outfit", () => ((tryOn = undefined), redraw()), "ghost.small")),
        ),
      ),
    );
    const shop = h("div.msection");
    for (const slot of ["hat", "trail", "glow"] as const) {
      const grid = h("div.mshop");
      for (const c of COSMETICS.filter((x) => x.slot === slot)) {
        const owned = d.owned.includes(c.id);
        const on = wearing[slot] === c.id;
        const tile = h(
          `div.mshop-item${on ? ".on" : ""}${shown[slot] === c.id && !on ? ".trying" : ""}`,
          {},
          h("span.mshop-icon", { "aria-hidden": "true", style: c.color ? `--c:${c.color}` : "" }, c.icon),
          h("p.mshop-name", { text: c.name }),
          h("p.mnote", { text: owned ? (on ? "Wearing ✓" : "Yours") : `${c.price.toLocaleString()} ✨` }),
        );
        const actions = h("div.mshop-actions");
        if (owned) {
          actions.append(on ? button("Take off", (b) => void busy(b, () => menu.run("wear", `none ${slot}`)), "ghost.small") : button("Wear", (b) => void busy(b, () => menu.run("wear", c.id)), "small"));
        } else {
          actions.append(
            button("Try on", () => ((tryOn = { ...(tryOn ?? wearing), [slot]: c.id }), redraw()), "ghost.small"),
            button(d.balance >= c.price ? "Buy" : `Need ${(c.price - d.balance).toLocaleString()}`, (b) => void busy(b, async () => {
              await menu.run("buy", c.id);
              tryOn = undefined;
            }), d.balance >= c.price ? "primary.small" : "ghost.small"),
          );
        }
        tile.append(actions);
        grid.append(tile);
      }
      shop.append(card(cardTitle(SLOT_TITLE[slot]), grid));
    }
    const top = h("ol.mboard");
    d.top.forEach((row, i) =>
      top.append(h(`li.mboard-row${row.userId === data.userId ? ".me" : ""}`, {}, h("span.mboard-place", { text: ["🥇", "🥈", "🥉"][i] ?? `#${i + 1}` }), avatar(row.userId, row.name, 28), h("span.mboard-name", { text: row.name }), h("span.mboard-xp", { text: `${row.earned.toLocaleString()} ✨` }))),
    );
    return h(
      "div.msection",
      {},
      head,
      card(cardTitle("How to earn it"), note("A little for chatting (once a minute), your daily gift (more each day in a row, with a bonus every 7th), level-ups, and giveaways. Spend it on looks your Blitz wears in its domain.")),
      shop,
      d.top.length > 0 && card(cardTitle("Top collectors"), top),
    );
  },
};

// ---- Giveaways -----------------------------------------------------------------------

const draftGiveaway = { length: "1d", winners: "1", prize: "" };

const giveaways: Section = {
  id: "giveaways",
  icon: "🎉",
  title: "Giveaways",
  blurb: "Enter for prizes",
  render({ data, menu }) {
    const running = data.giveaways.filter((g) => !g.ended);
    const ended = data.giveaways.filter((g) => g.ended);
    const list = h("div.mlist");
    for (const g of running) {
      list.append(
        h(
          "div.mlist-row.col.mgive",
          {},
          h("div.mrow", {}, h("span.mgive-icon", { "aria-hidden": "true" }, "🎁"), h("p.mgive-prize", { text: g.prize })),
          h("p.mnote", { text: `Ends ${fromNow(g.endsAt)} · ${g.entrants.toLocaleString()} ${g.entrants === 1 ? "entry" : "entries"} · ${g.winners} winner${g.winners === 1 ? "" : "s"} · #${g.channel}` }),
          h(
            "div.mrow.end",
            {},
            menu.team ? button("End now", (b) => void busy(b, () => menu.run("gend", String(g.id))), "ghost.small") : undefined,
            g.entered ? h("span.mtag.ok", { text: "🎉 You're in!" }) : button("Enter", (b) => void busy(b, () => menu.run("enter", String(g.id))), "primary.small"),
          ),
        ),
      );
    }
    const past = h("div.mlist");
    for (const g of ended) past.append(h("div.mlist-row", {}, h("span.mcase-icon", { "aria-hidden": "true" }, "🏆"), h("div.mlist-main", {}, h("p", { text: g.prize }), h("p.mnote", { text: g.winnerNames.length ? `Won by ${g.winnerNames.join(", ")}` : "Nobody entered" }))));
    const root = h("div.msection", {}, card(cardTitle("Running now"), running.length ? list : empty("🎉", "No giveaways right now. Keep an eye out!")));
    if (menu.team) {
      const channel = select(data.channels.map((c) => [c.id, `#${c.name}`]));
      const prize = input("Prize, like Nitro, or 500 stardust", draftGiveaway.prize, 200);
      prize.addEventListener("input", () => (draftGiveaway.prize = prize.value));
      const winners = select(["1", "2", "3", "5", "10"].map((n) => [n, `${n} winner${n === "1" ? "" : "s"}`]), draftGiveaway.winners);
      winners.addEventListener("change", () => (draftGiveaway.winners = winners.value));
      root.append(
        card(
          cardTitle("Start a giveaway"),
          note("Members enter by reacting 🎉 (or here). A prize like “500 stardust” is paid out automatically."),
          segmented(
            [
              ["1h", "1 hour"],
              ["1d", "1 day"],
              ["3d", "3 days"],
              ["7d", "1 week"],
            ],
            draftGiveaway.length,
            (v) => (draftGiveaway.length = v),
          ),
          h("div.mrow", {}, channel, winners),
          prize,
          h("div.mrow.end", {}, button("Start it", (b) => {
            if (!prize.value.trim()) return prize.focus();
            void busy(b, async () => {
              await menu.run("giveaway", `${draftGiveaway.length} ${draftGiveaway.winners} winners ${prize.value.trim()}`, channel.value);
              draftGiveaway.prize = "";
            });
          }, "primary")),
        ),
      );
    }
    if (ended.length) root.append(card(cardTitle("Recent winners"), past));
    return root;
  },
};

// ---- Inbox ---------------------------------------------------------------------------

const KIND: Record<string, { icon: string; label: string }> = { question: { icon: "💬", label: "Question" }, report: { icon: "🚩", label: "Report" }, appeal: { icon: "⚖️", label: "Appeal" } };
const SEVERITY: Record<string, { dot: string; label: string }> = { low: { dot: "🟢", label: "Low" }, medium: { dot: "🟠", label: "Medium" }, high: { dot: "🔴", label: "High" } };

const box: {
  view: "team" | "mine";
  openId?: number;
  thread?: TicketThread;
  loading?: boolean;
  kind: "question" | "report" | "appeal";
  about?: MemberLine;
  caseId?: number;
  closeNote: string;
} = { view: "team", kind: "question", closeNote: "" };

/** Opens the inbox ready to appeal a case (from the You page). */
export function startAppeal(caseId: number): void {
  box.view = "mine";
  box.openId = undefined;
  box.kind = "appeal";
  box.caseId = caseId;
}

async function openThread(ctx: SectionContext, id: number): Promise<void> {
  box.openId = id;
  box.loading = true;
  ctx.redraw();
  box.thread = await ctx.menu.api.ticket(id).catch(() => undefined);
  box.loading = false;
  ctx.redraw();
  void ctx.menu.load();
}

function ticketRow(ctx: SectionContext, t: TicketInfo, teamView: boolean): HTMLElement {
  const k = KIND[t.kind] ?? KIND.question;
  const waiting = teamView ? t.unread === "team" && t.status === "open" : t.unread === "member";
  const row = h(
    `button.mticket${waiting ? ".new" : ""}${t.status === "closed" ? ".closed" : ""}`,
    { type: "button" },
    h("span.mticket-icon", { "aria-hidden": "true" }, k.icon),
    h(
      "span.mticket-main",
      {},
      h("span.mticket-subject", { text: t.subject }),
      h("span.mnote", { text: [`#${t.id} ${k.label}`, teamView ? `from ${t.name}` : "", t.claimedBy ? `with ${t.claimedBy}` : "", ago(t.updatedAt)].filter(Boolean).join(" · ") }),
    ),
    h(
      "span.mticket-tags",
      {},
      teamView && t.triageSeverity ? h("span.mpill.sev", { text: `${SEVERITY[t.triageSeverity]?.dot ?? ""} ${SEVERITY[t.triageSeverity]?.label ?? t.triageSeverity}` }) : undefined,
      t.status === "closed" ? h("span.mpill", { text: t.resolution ? `Closed · ${t.resolution}` : "Closed" }) : waiting ? h("span.mpill.new", { text: teamView ? "Waiting" : "New reply" }) : undefined,
    ),
  );
  row.addEventListener("click", () => void openThread(ctx, t.id));
  return row;
}

function threadView(ctx: SectionContext): HTMLElement {
  const { menu, data, redraw } = ctx;
  const back = button("◂ All conversations", () => ((box.openId = undefined), (box.thread = undefined), redraw()), "ghost.small");
  if (box.loading || !box.thread?.ticket) return h("div.msection", {}, card(back, h("p.mnote.loading", { text: box.loading ? "Opening it…" : "Couldn't open that one." })));
  const t = box.thread.ticket;
  const mine = t.userId === data.userId;
  const teamView = menu.team && !mine;
  const k = KIND[t.kind] ?? KIND.question;
  const messages = h("div.mthread");
  for (const m of box.thread.messages) {
    const fromMe = (m.from === "member" && mine) || (m.from === "team" && !mine && m.name === data.name);
    messages.append(h(`div.mmsg.${m.from}${fromMe ? ".me" : ""}`, {}, h("p.mmsg-from", { text: `${m.from === "team" ? `${m.name}${teamView ? " (team)" : ""}` : m.name} · ${ago(m.at)}` }), rich(m.text)));
  }
  const reply = textarea(teamView ? `Reply to ${t.name}…` : "Write to the team…", "", 2000);
  const send = button(teamView ? "Send reply" : "Send", (b) => {
    if (!reply.value.trim()) return reply.focus();
    void busy(b, async () => {
      box.thread = await menu.api.ticketReply(t.id, reply.value.trim()).catch(() => box.thread);
      redraw();
      void menu.load();
    });
  }, "primary");
  const closeNote = input(t.kind === "appeal" ? "A note for them (optional)" : "Closing note for them (optional)", box.closeNote, 300);
  closeNote.addEventListener("input", () => (box.closeNote = closeNote.value));
  const decide = async (b: HTMLButtonElement, command: string) =>
    busy(b, async () => {
      await menu.run(command, `${t.id} ${box.closeNote.trim()}`.trim());
      box.closeNote = "";
      await openThread(ctx, t.id);
    });
  return h(
    "div.msection",
    {},
    card(
      h("div.mrow", {}, back),
      h("div.mthread-head", {}, h("span.mticket-icon", { "aria-hidden": "true" }, k.icon), h("div", {}, h("p.mthread-subject", { text: t.subject }), h("p.mnote", { text: [`#${t.id} ${k.label}`, teamView ? `from ${t.name}` : "", t.status === "closed" ? `closed${t.resolution ? ` · ${t.resolution}` : ""}` : "open"].filter(Boolean).join(" · ") }))),
      box.thread.about && h("p.mabout", { text: `About: ${box.thread.about}` }),
      teamView && t.triageSummary
        ? h("div.mtriage", {}, h("p.mtriage-head", { text: `🧠 Blitz's read · ${SEVERITY[t.triageSeverity]?.dot ?? ""} ${SEVERITY[t.triageSeverity]?.label ?? t.triageSeverity}` }), h("p", { text: t.triageSummary }), h("p.mnote", { text: `Suggests: ${t.triageSuggestion} (you decide)` }))
        : undefined,
      messages,
    ),
    card(
      cardTitle(t.status === "closed" ? (teamView ? "It's closed" : "Write again?") : teamView ? "Answer" : "Add to it"),
      t.status === "closed" && !teamView && note("Writing again opens it back up."),
      (!teamView || t.status === "open") && h("div", {}, reply, h("div.mrow.end", {}, send)),
      teamView && t.status === "open"
        ? h(
            "div.mactions",
            {},
            closeNote,
            h(
              "div.mrow.end",
              {},
              t.kind === "appeal" ? button("❌ Turn down", (b) => void decide(b, "reject"), "ghost") : undefined,
              t.kind === "appeal" ? button("✅ Accept (take the case back)", (b) => void decide(b, "accept"), "primary") : button("📪 Close", (b) => void decide(b, "close"), "ghost"),
            ),
          )
        : undefined,
    ),
  );
}

const inbox: Section = {
  id: "inbox",
  icon: "📬",
  title: "Inbox",
  blurb: "Talk privately with the team",
  badge: (data) => {
    const mine = data.inbox?.mine.filter((t) => t.unread === "member").length ?? 0;
    const team = data.access !== "everyone" ? (data.inbox?.team.filter((t) => t.unread === "team" && t.status === "open").length ?? 0) : 0;
    return mine + team || undefined;
  },
  render(ctx) {
    const { data, menu, redraw } = ctx;
    if (box.openId !== undefined) return threadView(ctx);
    const on = data.inbox?.on ?? false;
    const root = h("div.msection");
    const teamView = menu.team && box.view === "team";
    if (menu.team) {
      const waiting = data.inbox?.team.filter((t) => t.unread === "team" && t.status === "open").length ?? 0;
      root.append(
        segmented(
          [
            ["team", `🛡️ Team inbox${waiting ? ` (${waiting} waiting)` : ""}`],
            ["mine", "✉️ My own"],
          ],
          box.view,
          (v) => ((box.view = v as "team" | "mine"), redraw()),
        ),
      );
    }
    if (teamView) {
      const open = data.inbox?.team.filter((t) => t.status === "open") ?? [];
      const closed = data.inbox?.team.filter((t) => t.status === "closed") ?? [];
      const list = h("div.mtickets", {}, ...open.map((t) => ticketRow(ctx, t, true)));
      root.append(card(cardTitle("Open conversations"), open.length ? list : empty("📭", "All caught up! Nothing's waiting.")));
      if (closed.length) root.append(card(cardTitle("Recently closed"), h("div.mtickets", {}, ...closed.map((t) => ticketRow(ctx, t, true)))));
      return root;
    }

    // Starting a conversation: a question, a report or an appeal.
    const what = textarea(box.kind === "appeal" ? "Why should it be taken back?" : box.kind === "report" ? "What happened?" : "What's up? Only the team sees this.", "", 1800);
    const appealable = data.myCases.filter((c) => !c.revoked && ["warn", "mute", "kick", "ban"].includes(c.kind));
    const caseLabel = (c: MenuOverview["myCases"][number]) => `${{ warn: "⚠️ Warning", mute: "🔇 Mute", kick: "👢 Kick", ban: "🔨 Ban" }[c.kind] ?? c.kind} #${c.id}${c.reason ? `: ${c.reason.slice(0, 50)}` : ""}`;
    const pickCase = select(appealable.map((c) => [String(c.id), caseLabel(c)]), String(box.caseId ?? appealable[0]?.id ?? ""));
    pickCase.addEventListener("change", () => (box.caseId = Number(pickCase.value)));
    const sendNew = button(box.kind === "report" ? "Tell the team" : box.kind === "appeal" ? "Send appeal" : "Send to the team", (b) => {
      const text = what.value.trim();
      if (!text) return what.focus();
      void busy(b, async () => {
        if (box.kind === "report") await menu.run("report", `${box.about ? `${box.about.userId} ` : ""}${text}`);
        else if (box.kind === "appeal") await menu.run("appeal", `${pickCase.value} ${text}`);
        else await menu.run("ticket", text);
        box.about = undefined;
        box.caseId = undefined;
      });
    }, "primary");
    const kinds: Array<[string, string]> = on
      ? [
          ["question", "💬 Ask the team"],
          ["report", "🚩 Report someone"],
          ["appeal", "⚖️ Appeal"],
        ]
      : [["report", "🚩 Report someone"]];
    if (!on && box.kind !== "report") box.kind = "report";
    root.append(
      card(
        cardTitle("Talk to the team"),
        note(on ? "Private: only the team sees it, and you'll get a notification when they answer." : "The inbox is off here, so reports go straight to the team's log."),
        segmented(kinds, box.kind, (v) => ((box.kind = v as typeof box.kind), redraw())),
        box.kind === "report" && h("div", {}, h("p.mlabel", { text: "About someone? (optional)" }), memberPicker(ctx, (m) => ((box.about = m), redraw()), box.about)),
        box.kind === "appeal" && (appealable.length ? h("div", {}, h("p.mlabel", { text: "Which one" }), pickCase) : note("✨ There's nothing on your record to appeal.")),
        (box.kind !== "appeal" || appealable.length > 0) && h("div", {}, what, h("div.mrow.end", {}, sendNew)),
      ),
    );
    const mine = data.inbox?.mine ?? [];
    if (on) root.append(card(cardTitle("Your conversations"), mine.length ? h("div.mtickets", {}, ...mine.map((t) => ticketRow(ctx, t, false))) : empty("✉️", "None yet.")));
    return root;
  },
};

// ---- Guardian (the team) ---------------------------------------------------------------

const CATCH_ICON: Record<string, string> = { scam: "🎣", raid: "🚨", newcomer: "👋", lockdown: "🔒", slowmode: "🐢", spam: "💨", duplicate: "📋", mentions: "📢", invite: "🔗", word: "🤐", zalgo: "👾", caps: "🔠", emoji: "😵", wall: "🧱" };
const guard = { lockFor: "1h", lockWhere: "", lockReason: "", slowFor: "15s", slowWhere: "", confirmAll: false };

const guardian: Section = {
  id: "guardian",
  icon: "🛡️",
  title: "Guardian",
  blurb: "Scams, raids, lockdowns and slowmode",
  team: true,
  render({ data, menu, redraw }) {
    const g = data.guardian;
    if (!g) return h("div.msection", {}, empty("🛡️", "Blitz couldn't load its shields just now."));
    const today = g.catches.filter((c) => Date.now() - c.at < 86_400_000);
    const count = (kinds: string[]) => today.filter((c) => kinds.includes(c.kind)).length;
    const tile = (icon: string, title: string, state: string, good: boolean | undefined, detail: string, action?: HTMLElement) =>
      h("div.mshield", {}, h("p.mshield-head", {}, h("span", { "aria-hidden": "true" }, icon), title), h(`p.mshield-state${good === undefined ? "" : good ? ".ok" : ".alert"}`, { text: state }), h("p.mnote", { text: detail }), action);
    const raidAction = g.raidActive ? button("End it", (b) => void busy(b, () => menu.run("raid", "off")), "ghost.small") : button("Raise it now", (b) => void busy(b, () => menu.run("raid", "on")), "ghost.small");
    const tiles = h(
      "div.mshields",
      {},
      tile("🎣", "Scam shield", g.scamOn ? "On" : "Off", g.scamOn, `${count(["scam"])} scam link${count(["scam"]) === 1 ? "" : "s"} stopped today`),
      tile("🚨", "Raid shield", g.raidActive ? "UP" : g.raidOn ? "Watching" : "Off", g.raidActive ? false : g.raidOn, g.raidActive ? `${g.raidManual ? "Raised by hand" : `Down ${fromNow(g.raidUntil)}`} · holding ${g.raidHeld}` : `Rises at ${g.raidJoins} joins a minute`, raidAction),
      tile("👋", "Newcomer links", g.newcomerMinutes ? `After ${g.newcomerMinutes} min` : "Anytime", undefined, `${count(["newcomer"])} held back today`),
      tile("🧹", "Auto-mod", g.automodOn ? (g.strict ? "On · strict" : "On") : "Off", g.automodOn, `${count(["spam", "duplicate", "mentions", "invite", "word", "zalgo", "caps", "emoji", "wall"])} removed today${g.coolOff ? " · cool-offs on" : ""}`),
    );

    const channelOptions: Array<[string, string]> = data.channels.map((c) => [c.id, `#${c.name}`]);
    const mention = (id: string) => {
      const c = data.channels.find((x) => x.id === id);
      return c ? `[#${c.name}](root://channel/${c.id})` : "";
    };
    const lockWhere = select([["all", "🌐 Every channel"], ...channelOptions], guard.lockWhere || channelOptions[0]?.[0] || "all");
    lockWhere.addEventListener("change", () => ((guard.lockWhere = lockWhere.value), (guard.confirmAll = false), redraw()));
    const lockReason = input("Reason (shown in the channel)", guard.lockReason, 200);
    lockReason.addEventListener("input", () => (guard.lockReason = lockReason.value));
    const everything = lockWhere.value === "all";
    const lockIt = (b: HTMLButtonElement) =>
      void busy(b, async () => {
        const where = everything ? "all" : mention(lockWhere.value);
        await menu.run("lockdown", `${where} ${guard.lockFor === "open" ? "" : guard.lockFor} ${guard.lockReason}`.replace(/\s+/g, " ").trim());
        guard.lockReason = "";
        guard.confirmAll = false;
      });
    const lockButton = everything && !guard.confirmAll ? button("🔒 Lock everything…", () => ((guard.confirmAll = true), redraw()), "ghost") : button(everything ? "Really lock every channel?" : "🔒 Lock", lockIt, everything ? "danger" : "primary");
    const locks = h("div.mlist");
    for (const l of g.locks) {
      locks.append(
        h(
          "div.mlist-row",
          {},
          h("span.mcase-icon", { "aria-hidden": "true" }, "🔒"),
          h("div.mlist-main", {}, h("p", { text: l.name }), h("p.mnote", { text: `${l.until ? `opens ${fromNow(l.until)}` : "until unlocked"}${l.reason ? ` · ${l.reason}` : ""}` })),
          button("Unlock", (b) => void busy(b, () => menu.run("unlock", l.channelId === "all" ? "all" : mention(l.channelId))), "ghost.small"),
        ),
      );
    }

    const slowWhere = select(channelOptions, guard.slowWhere || channelOptions[0]?.[0] || "");
    slowWhere.addEventListener("change", () => (guard.slowWhere = slowWhere.value));
    const slows = h("div.mlist");
    for (const s of g.slows) {
      slows.append(
        h(
          "div.mlist-row",
          {},
          h("span.mcase-icon", { "aria-hidden": "true" }, "🐢"),
          h("div.mlist-main", {}, h("p", { text: s.name }), h("p.mnote", { text: `one message every ${s.seconds >= 60 ? `${Math.round(s.seconds / 60)} min` : `${s.seconds}s`}` })),
          button("Turn off", (b) => void busy(b, () => menu.run("slowmode", `${mention(s.channelId) || s.name} off`)), "ghost.small"),
        ),
      );
    }

    const feed = h("div.mlist.mfeed");
    for (const c of g.catches.slice(0, 20)) {
      feed.append(
        h(
          "div.mlist-row",
          {},
          h("span.mcase-icon", { "aria-hidden": "true" }, CATCH_ICON[c.kind] ?? "🛡️"),
          h("div.mlist-main", {}, h("p", {}, c.name ? h("strong", { text: c.name }) : undefined, c.name ? ` · ${c.detail}` : c.detail), h("p.mnote", { text: [c.channel, ago(c.at)].filter(Boolean).join(" · ") })),
        ),
      );
    }

    return h(
      "div.msection",
      {},
      tiles,
      card(
        cardTitle("Lockdown"),
        note("Only the team can post in a locked channel; Blitz removes anything else, with a note why."),
        h("div.mrow", {}, lockWhere),
        segmented(
          [
            ["15m", "15 min"],
            ["1h", "1 hour"],
            ["6h", "6 hours"],
            ["open", "Until I unlock"],
          ],
          guard.lockFor,
          (v) => (guard.lockFor = v),
        ),
        lockReason,
        h("div.mrow.end", {}, lockButton),
        g.locks.length > 0 && locks,
      ),
      card(
        cardTitle("Slowmode"),
        h("div.mrow", {}, slowWhere),
        segmented(
          [
            ["5s", "5s"],
            ["15s", "15s"],
            ["30s", "30s"],
            ["1m", "1 min"],
            ["5m", "5 min"],
          ],
          guard.slowFor,
          (v) => (guard.slowFor = v),
        ),
        h("div.mrow.end", {}, button("🐢 Slow it down", (b) => void busy(b, () => menu.run("slowmode", `${mention(slowWhere.value)} ${guard.slowFor}`)), "primary")),
        g.slows.length > 0 && slows,
      ),
      card(cardTitle("Warning ladder"), h("p.mabout", { text: g.ladder === "off" ? "Off: warnings never lead to anything automatic." : g.ladder }), note("Members are told when they're moderated, and how to appeal. Change the steps in Blitz's App settings (Guardian).")),
      card(cardTitle("What the shields caught"), g.catches.length ? feed : empty("✨", "Nothing yet. All calm.")),
    );
  },
};

// ---- Pulse (the team) ----------------------------------------------------------------------

const KIND_NAME: Record<string, string> = {
  warn: "Warnings",
  mute: "Mutes",
  unmute: "Unmutes",
  kick: "Kicks",
  ban: "Bans",
  unban: "Unbans",
  note: "Notes",
  scam: "Scam links",
  raid: "Raid alerts",
  newcomer: "Newcomer links",
  lockdown: "Locked-out posts",
  slowmode: "Slowmode",
  spam: "Floods",
  duplicate: "Copy-paste spam",
  mentions: "Mass mentions",
  invite: "Invite links",
  word: "Blocked words",
  zalgo: "Glitch text",
  caps: "Shouting",
  emoji: "Emoji floods",
  wall: "Walls of text",
};

const pulse: Section = {
  id: "pulse",
  icon: "📈",
  title: "Pulse",
  blurb: "How the community is doing",
  team: true,
  render({ data }) {
    const p = data.pulse;
    if (!p || p.days.length === 0) return h("div.msection", {}, empty("📈", "Blitz starts counting from today. Check back tomorrow!"));
    const days = p.days;
    const recent = days.slice(-14);
    const kpis = h(
      "div.mstats",
      {},
      statTile("Messages", p.weekMessages, p.hasChange ? { fraction: p.changeMessages, upIsGood: true } : undefined, recent.map((d) => d.messages)),
      statTile("Chatting", p.weekPeople, p.hasChange ? { fraction: p.changePeople, upIsGood: true } : undefined, recent.map((d) => d.people)),
      statTile("Joined", p.weekJoins, undefined, recent.map((d) => d.joins)),
      statTile("Left", p.weekLeaves, undefined, recent.map((d) => d.leaves)),
    );
    const trend = trendChart(days.map((d) => ({ label: shortDate(d.date), value: d.messages })), "messages");
    const joins = upDownChart(days.map((d) => ({ label: shortDate(d.date), up: d.joins, down: d.leaves })), "Joined", "Left");
    const kinds = (list: Array<{ kind: string; count: number }>, unit: string) => (list.length ? barList(list.slice(0, 6).map((k) => ({ label: KIND_NAME[k.kind] ?? k.kind, value: k.count })), unit) : note("Nothing in the last four weeks."));
    return h(
      "div.msection.mpulse",
      {},
      card(cardTitle("Health"), healthFigure(p.health)),
      h("div", {}, h("p.mlabel.first", { text: p.hasChange ? "This week, and the change from last week" : "This week" }), kpis),
      card(
        cardTitle("Messages per day"),
        note("The last four weeks."),
        trend,
        tableView("Messages per day", ["Day", "Messages", "People"], days.map((d) => [shortDate(d.date), d.messages, d.people])),
      ),
      card(cardTitle("Joins and leaves"), joins, tableView("Joins and leaves per day", ["Day", "Joined", "Left"], days.map((d) => [shortDate(d.date), d.joins, d.leaves]))),
      card(cardTitle("Busiest hours"), note("When people chat, in your local time."), hoursChart(p.hours)),
      card(cardTitle("Busiest channels"), p.topChannels.length ? barList(p.topChannels.map((c) => ({ label: c.name, value: c.messages })), "messages") : note("No messages counted yet.")),
      h("div.mtwo", {}, card(cardTitle("What the team did"), kinds(p.modKinds, "times")), card(cardTitle("What the shields caught"), kinds(p.caughtKinds, "times"))),
    );
  },
};

// ---- Ask Blitz (the team) --------------------------------------------------------------------

const asked: Array<{ q: string; a?: string; ok?: boolean }> = [];
const EXAMPLES = ["How's the community doing this week?", "Who's been warned the most this month?", "What's waiting in the inbox?", "What happened in #general today?"];

const ask: Section = {
  id: "ask",
  icon: "🔮",
  title: "Ask Blitz",
  blurb: "Questions about the community, answered",
  team: true,
  render({ data, menu, redraw }) {
    if (!data.brain)
      return h(
        "div.msection",
        {},
        card(empty("🔮", "Ask Blitz needs Blitz's brain."), note("An admin can add an Anthropic API key in Blitz's App settings and tick “Let Blitz's brain help moderate”. Then you can ask things like “who's been warned most this month?” or “what happened in #general today?”.")),
      );
    const field = input("Ask about activity, members, the inbox, a channel…", "", 600);
    const go = async (q: string, b?: HTMLButtonElement) => {
      if (!q.trim()) return field.focus();
      const entry: { q: string; a?: string; ok?: boolean } = { q: q.trim() };
      asked.unshift(entry);
      if (asked.length > 8) asked.pop();
      redraw();
      const run = async () => {
        const res = await menu.api.ask(entry.q).catch(() => ({ ok: false, answer: "⚠️ I couldn't reach my server. Try again in a moment." }));
        entry.a = res.answer;
        entry.ok = res.ok;
        redraw();
      };
      if (b) await busy(b, run);
      else await run();
    };
    const askButton = button("Ask", (b) => void go(field.value, b), "primary");
    field.addEventListener("keydown", (e) => e.key === "Enter" && askButton.click());
    const chips = h("div.mchips", {}, ...EXAMPLES.map((q) => button(q, () => void go(q), "ghost.small")));
    const log = h("div.mask-log");
    for (const e of asked) {
      log.append(
        h(
          "div.mask-entry",
          {},
          h("p.mask-q", {}, h("span", { "aria-hidden": "true" }, "🗨️ "), e.q),
          e.a === undefined ? h("div.mask-a.thinking", {}, h("span.mloading-orb", { "aria-hidden": "true" }), h("p", { text: "Blitz is gazing into the stars…" })) : h(`div.mask-a${e.ok ? "" : ".bad"}`, {}, rich(e.a)),
        ),
      );
    }
    return h(
      "div.msection",
      {},
      card(cardTitle("What would you like to know?"), note("Blitz looks it up in its records: activity, members' histories, the inbox, and recent chat (never private channels). It can't change anything."), h("div.mrow", {}, field, askButton), chips),
      asked.length > 0 && log,
    );
  },
};

export const MORE = { stardust, giveaways, inbox, guardian, pulse, ask };
