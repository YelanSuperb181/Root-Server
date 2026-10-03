// The building blocks every menu section is made of: cards, buttons that
// show they're busy, fields, pickers. Plain elements (see ui.ts), styled by
// the .m* classes in style.css.

import type { MemberLine, MenuOverview } from "./api";
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
  const showPicked = (m: MemberLine) => {
    box.replaceChildren(
      h("div.mpicked", {}, avatar(m.userId, m.name, 26), h("span", { text: m.name }), button("✕", () => onPick(undefined), "ghost.small")),
    );
  };
  field.addEventListener("input", () => {
    if (timer) clearTimeout(timer);
    const q = field.value.trim();
    if (!q) {
      results.replaceChildren();
      return;
    }
    timer = setTimeout(async () => {
      const mine = ++asked;
      const found = await ctx.menu.api.searchMembers(q).catch(() => []);
      if (mine !== asked) return;
      results.replaceChildren(
        ...(found.length
          ? found.map((m) => {
              const row = h("button.mpicker-row", { type: "button" }, avatar(m.userId, m.name, 24), h("span", { text: m.name }));
              row.addEventListener("click", () => onPick(m));
              return row;
            })
          : [h("p.mnote", { text: "Nobody by that name." })]),
      );
    }, 220);
  });
  if (picked) showPicked(picked);
  else box.append(field, results);
  return box;
}

/** A progress bar, `fraction` of the way. */
export const bar = (fraction: number) => h("div.mbar", {}, h("span", { style: `width:${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }));

export const MEDALS = ["🥇", "🥈", "🥉"];

