// The building blocks every menu section is made of: cards, buttons that
// show they're busy, fields, pickers. Plain elements (see ui.ts), styled by
// the .m* classes in style.css.

import type { MemberLine, MenuOverview } from "./api";
import { notePress } from "./flair";
import { Menu } from "./menu";
import { avatar, h } from "./ui";

export interface SectionContext {
  menu: Menu;
  data: MenuOverview;
  /** Draw this section again (after its own state changed). */
  redraw(): void;
  /** Open another section. */
  go(id: string): void;
}

export interface Section {
  id: string;
  icon: string;
  title: string;
  /** A few words on what's in it. */
  blurb: string;
  /** Only for the team (mods and admins). */
  team?: boolean;
  /** A count to show beside it (unread messages), if any. */
  badge?(data: MenuOverview): number | undefined;
  render(ctx: SectionContext): HTMLElement;
}

// ---- Small pieces -------------------------------------------------------------------

/** Runs `work` with the button showing it's busy (and pressed only once). */
export async function busy(button: HTMLButtonElement, work: () => Promise<unknown>): Promise<void> {
  if (button.disabled) return;
  notePress(button);
  button.disabled = true;
  button.classList.add("busy");
  try {
    await work();
  } finally {
    button.disabled = false;
    button.classList.remove("busy");
  }
}

export function button(label: string, onclick: (b: HTMLButtonElement) => void, kind = ""): HTMLButtonElement {
  const b: HTMLButtonElement = h(`button.mbtn${kind ? `.${kind}` : ""}`, { type: "button" }, label);
  b.addEventListener("click", () => onclick(b));
  return b;
}

export const card = (...children: Array<Node | string | false | null | undefined>) => h("div.mcard", {}, ...children);
export const cardTitle = (text: string) => h("h3.mcard-title", { text });
export const note = (text: string) => h("p.mnote", { text });
export const empty = (icon: string, text: string) => h("div.mempty", {}, h("span.mempty-icon", { "aria-hidden": "true" }, icon), h("p", { text }));

export function input(placeholder: string, value = "", max = 500): HTMLInputElement {
  return h("input.minput", { type: "text", placeholder, value, maxlength: max, autocomplete: "off" });
}

export function textarea(placeholder: string, value = "", max = 1500): HTMLTextAreaElement {
  const t = h("textarea.minput", { placeholder, maxlength: max, rows: 3 });
  t.value = value;
  return t;
}

export function select(options: Array<[value: string, label: string]>, value = ""): HTMLSelectElement {
  const s = h("select.minput");
  for (const [v, label] of options) s.append(h("option", { value: v, selected: v === value }, label));
  return s;
}

/** Enter in a one-line field (Ctrl or ⌘ Enter in a bigger one, where Enter is a new line) presses `button`. */
export function submitOn(field: HTMLInputElement | HTMLTextAreaElement, button: HTMLButtonElement): void {
  const big = field instanceof HTMLTextAreaElement;
  (field as HTMLElement).addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.isComposing || (big && !(e.ctrlKey || e.metaKey))) return;
    e.preventDefault();
    button.click();
  });
  if (big && !button.title) button.title = "Ctrl Enter";
}

export interface ChannelChoice {
  id: string;
  name: string;
  /** The category it's in (channels are grouped by it). */
  group: string;
}

/**
 * Tap channels to pick as many as you like, or a whole category at once.
 * `picked` belongs to the caller, so the choice survives redraws; `marks`
 * puts a small sign on a channel (🔒 already locked, say); `onChange` runs
 * after every change.
 */
export function channelPicker(channels: ChannelChoice[], picked: Set<string>, onChange: () => void, marks: Record<string, { sign: string; label: string }> = {}): HTMLElement {
  for (const id of [...picked]) if (!channels.some((c) => c.id === id)) picked.delete(id);
  const chips = new Map<string, HTMLButtonElement>();
  const groupLabels: Array<{ el: HTMLButtonElement; ids: string[] }> = [];
  const count = h("span.mchanpick-count");
  const sync = () => {
    for (const [id, chip] of chips) chip.setAttribute("aria-pressed", String(picked.has(id)));
    for (const g of groupLabels) g.el.setAttribute("aria-pressed", String(g.ids.every((id) => picked.has(id))));
    count.textContent = picked.size ? `${picked.size} picked` : "None picked yet";
  };
  const change = () => {
    sync();
    onChange();
  };
  const groups = new Map<string, ChannelChoice[]>();
  for (const c of channels) {
    const list = groups.get(c.group) ?? [];
    list.push(c);
    groups.set(c.group, list);
  }
  const body = h("div.mchanpick-groups");
  const groupEls: Array<{ el: HTMLElement; ids: string[] }> = [];
  for (const [name, list] of groups) {
    const ids = list.map((c) => c.id);
    const groupEl = h("div.mchanpick-group");
    if (name && groups.size > 1) {
      const label = h("button.mchanpick-label", { type: "button", title: `Pick every channel in ${name} (again to drop them)` }, name);
      label.addEventListener("click", () => {
        const all = ids.every((id) => picked.has(id));
        for (const id of ids) all ? picked.delete(id) : picked.add(id);
        change();
      });
      groupLabels.push({ el: label, ids });
      groupEl.append(label);
    }
    const row = h("div.mchanpick-chips");
    for (const c of list) {
      const mark = marks[c.id];
      const chip = h("button.mchan", { type: "button", "aria-pressed": "false", title: mark?.label }, `#${c.name}`, mark && h("span.mchan-mark", { "aria-label": mark.label }, mark.sign));
      chip.addEventListener("click", () => {
        picked.has(c.id) ? picked.delete(c.id) : picked.add(c.id);
        change();
      });
      chips.set(c.id, chip);
      row.append(chip);
    }
    groupEl.append(row);
    groupEls.push({ el: groupEl, ids });
    body.append(groupEl);
  }
  // A filter, once there are more channels than fit at a glance; "All" picks what it shows.
  const filter = channels.length > 12 ? input("Filter channels…", "", 40) : undefined;
  const shown = () => channels.filter((c) => !chips.get(c.id)!.hidden);
  const nothing = h("p.mnote", { hidden: true, text: "No channel by that name." });
  body.append(nothing);
  filter?.addEventListener("input", () => {
    const q = filter.value.trim().toLowerCase().replace(/^#/, "");
    for (const c of channels) chips.get(c.id)!.hidden = !!q && !c.name.toLowerCase().includes(q) && !c.group.toLowerCase().includes(q);
    for (const g of groupEls) g.el.hidden = g.ids.every((id) => chips.get(id)!.hidden);
    nothing.hidden = groupEls.some((g) => !g.el.hidden);
  });
  const top = h(
    "div.mchanpick-top",
    {},
    count,
    filter,
    button("All", () => {
      for (const c of shown()) picked.add(c.id);
      change();
    }, "ghost.small"),
    button("None", () => {
      picked.clear();
      change();
    }, "ghost.small"),
  );
  sync();
  return h("div.mchanpick", {}, top, body);
}

/** Filter pills above a list (one picked), spaced for that spot. */
export function filters(options: Array<[value: string, label: string]>, value: string, onPick: (v: string) => void): HTMLElement {
  const row = segmented(options, value, onPick);
  row.classList.add("mfilter");
  return row;
}

/** A row of pill buttons, one picked. */
export function segmented(options: Array<[value: string, label: string]>, value: string, onPick: (v: string) => void): HTMLElement {
  const row = h("div.mseg", { role: "radiogroup" });
  for (const [v, label] of options) {
    const b = h("button.mseg-btn", { type: "button", role: "radio", "aria-checked": String(v === value) }, label);
    b.addEventListener("click", () => {
      for (const other of row.children) other.setAttribute("aria-checked", "false");
      b.setAttribute("aria-checked", "true");
      onPick(v);
    });
    row.append(b);
  }
  return row;
}

/** Finds members by name as you type, and calls `onPick` with the one chosen. */
export function memberPicker(ctx: SectionContext, onPick: (m: MemberLine | undefined) => void, picked?: MemberLine): HTMLElement {
  const box = h("div.mpicker");
  const results = h("div.mpicker-results");
  const field = input("Search by name…", "", 64);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let asked = 0;
  /** Enter was pressed before the results came: pick the first one when they do. */
  let pickFirst = false;
  /** What the results showing are for. */
  let shownFor = "";
  const showPicked = (m: MemberLine) => {
    box.replaceChildren(
      h("div.mpicked", {}, avatar(m.userId, m.name, 26), h("span", { text: m.name }), button("✕", () => onPick(undefined), "ghost.small")),
    );
  };
  const search = async (q: string) => {
    const mine = ++asked;
    const found = await ctx.menu.api.searchMembers(q).catch(() => []);
    if (mine !== asked) return;
    if (pickFirst && found[0]) return onPick(found[0]);
    pickFirst = false;
    shownFor = q;
    results.replaceChildren(
      ...(found.length
        ? found.map((m) => {
            const row = h("button.mpicker-row", { type: "button" }, avatar(m.userId, m.name, 24), h("span", { text: m.name }));
            row.addEventListener("click", () => onPick(m));
            return row;
          })
        : [h("p.mnote", { text: "Nobody by that name." })]),
    );
  };
  field.addEventListener("input", () => {
    if (timer) clearTimeout(timer);
    pickFirst = false;
    const q = field.value.trim();
    if (!q) {
      results.replaceChildren();
      return;
    }
    timer = setTimeout(() => void search(q), 220);
  });
  // Enter takes the first match (searching right away if the results aren't in yet).
  field.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing || !field.value.trim()) return;
    e.preventDefault();
    const first = results.querySelector<HTMLButtonElement>(".mpicker-row");
    if (first && shownFor === field.value.trim()) return first.click();
    if (timer) clearTimeout(timer);
    pickFirst = true;
    void search(field.value.trim());
  });
  if (picked) showPicked(picked);
  else box.append(field, results);
  return box;
}

/** A progress bar, `fraction` of the way. */
export const bar = (fraction: number) => h("div.mbar", {}, h("span", { style: `width:${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }));

export const MEDALS = ["🥇", "🥈", "🥉"];

/** While the menu can't reach Blitz's server: what happened, that Blitz keeps trying, and a button to try now. */
export function offlineCard(menu: Menu): HTMLElement {
  const retry = h("button.mbtn.primary", { type: "button" }, menu.loading ? "Trying…" : "Try again now");
  retry.disabled = menu.loading;
  retry.addEventListener("click", () => void menu.load());
  const when = h("p.mnote");
  const tell = () => {
    const secs = Math.max(0, Math.ceil((menu.retryAt - Date.now()) / 1000));
    when.textContent = menu.loading ? "Reaching out to Blitz…" : secs ? `Blitz tries again by itself in ${secs}s.` : "Blitz keeps trying by itself.";
  };
  tell();
  // Counts down while it's on screen.
  let gone = 0;
  const timer = setInterval(() => (when.isConnected ? tell() : ++gone > 2 && clearInterval(timer)), 1000);
  return h("div.mcard.mempty.moffline", {}, h("span.mempty-icon", { "aria-hidden": "true" }, "🌫️"), h("p", { text: menu.error ?? "" }), menu.errorDetail && h("p.mnote", { text: menu.errorDetail }), when, retry);
}

