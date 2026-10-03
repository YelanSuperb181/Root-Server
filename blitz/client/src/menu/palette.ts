// The quick finder: Ctrl+K (or ⌘K, or "/" when not typing) opens a search
// over every menu section and every command, and jumps straight there.

import { accentStyle } from "./flair";
import { Menu } from "./menu";
import { sectionsFor } from "./sections";
import { h } from "./ui";

interface Hit {
  icon: string;
  title: string;
  detail: string;
  /** The section it opens. */
  section: string;
  /** A command to look up in the Commands section. */
  command?: string;
  score: number;
}

/** How well `text` matches `q`: 4 exactly, 3 starts with it, 2 a word starts with it, 1 contains it, 0 not at all. */
function match(text: string, q: string): number {
  const t = text.toLowerCase();
  if (t === q) return 4;
  if (t.startsWith(q)) return 3;
  if (t.includes(` ${q}`) || t.includes(`!${q}`)) return 2;
  return t.includes(q) ? 1 : 0;
}

export class Palette {
  private root: HTMLElement | undefined;
  private input!: HTMLInputElement;
  private list!: HTMLElement;
  private hits: Hit[] = [];
  private active = 0;
  private returnFocus: HTMLElement | null = null;

  constructor(
    private menu: Menu,
    /** Opens a section (and, for a command, looks it up there). */
    private go: (section: string, command?: string) => void,
  ) {
    window.addEventListener("keydown", (e) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target?.closest("input, textarea, select, [contenteditable='true']");
      if ((e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  get isOpen(): boolean {
    return this.root !== undefined;
  }

  toggle(): void {
    if (this.root) this.close();
    else this.open();
  }

  open(): void {
    if (this.root) return;
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.input = h("input.mpal-input", { type: "search", placeholder: "Find anything: a section, a command, “daily”, “ban”…", "aria-label": "Find in Blitz's menu", autocomplete: "off", spellcheck: "false" });
    this.list = h("div.mpal-list", { role: "listbox", "aria-label": "Results" });
    const box = h(
      "div.mpal-box",
      { role: "dialog", "aria-modal": "true", "aria-label": "Quick find" },
      h("div.mpal-field", {}, h("span.mpal-glyph", { "aria-hidden": "true" }, "✦"), this.input, h("kbd.mpal-kbd", { text: "Esc" })),
      this.list,
      h("p.mpal-foot", {}, h("kbd", { text: "↑" }), h("kbd", { text: "↓" }), " to move · ", h("kbd", { text: "Enter" }), " to open · ", h("kbd", { text: "Ctrl K" }), " any time"),
    );
    const root = h("div.mpal", {}, h("div.mpal-veil", { onclick: () => this.close() }), box);
    this.root = root;
    document.body.append(root);
    this.input.addEventListener("input", () => this.search());
    this.input.addEventListener("keydown", (e) => this.key(e));
    this.search();
    this.input.focus();
  }

  close(): void {
    const root = this.root;
    if (!root) return;
    this.root = undefined;
    root.classList.add("leaving");
    setTimeout(() => root.remove(), 160);
    this.returnFocus?.focus?.({ preventScroll: true });
  }

  private key(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (this.hits.length) this.setActive((this.active + (e.key === "ArrowDown" ? 1 : -1) + this.hits.length) % this.hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = this.hits[this.active];
      if (hit) this.pick(hit);
    }
  }

  private search(): void {
    const q = this.input.value.trim().toLowerCase().replace(/^[!/]/, "");
    const hits: Hit[] = [];
    for (const s of sectionsFor(this.menu)) {
      const score = q ? Math.max(match(s.title, q) * 2, match(s.blurb, q)) : 1;
      if (score > 0) hits.push({ icon: s.icon, title: s.title, detail: s.blurb, section: s.id, score: score + 0.5 });
    }
    if (q) {
      for (const c of this.menu.data?.commands ?? []) {
        const score = Math.max(match(c.name, q) * 2, ...c.aliases.map((a) => match(a, q) * 2), match(c.summary, q));
        if (score > 0) hits.push({ icon: "›", title: `!${c.name}`, detail: c.summary, section: "commands", command: c.name, score });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    this.hits = hits.slice(0, q ? 9 : 18);
    this.list.replaceChildren();
    if (!this.hits.length) this.list.append(h("p.mpal-empty", { text: "Nothing like that. Try “levels”, “warn” or “stardust”." }));
    this.hits.forEach((hit, i) => {
      const row = h(
        "button.mpal-row",
        { type: "button", role: "option", style: accentStyle(hit.section), id: `mpal-${i}` },
        h("span.mpal-icon", { "aria-hidden": "true" }, hit.icon),
        h("span.mpal-text", {}, h("span.mpal-title", { text: hit.title }), h("span.mpal-detail", { text: hit.detail })),
        h("span.mpal-kind", { text: hit.command ? "command" : "section" }),
      );
      row.addEventListener("pointermove", () => this.active !== i && this.setActive(i));
      row.addEventListener("click", () => this.pick(hit));
      this.list.append(row);
    });
    this.setActive(0);
  }

  private setActive(i: number): void {
    this.active = i;
    this.list.querySelectorAll(".mpal-row").forEach((row, j) => {
      row.classList.toggle("on", j === i);
      row.setAttribute("aria-selected", String(j === i));
      if (j === i) row.scrollIntoView({ block: "nearest" });
    });
    this.input.setAttribute("aria-activedescendant", this.hits[i] ? `mpal-${i}` : "");
  }

  private pick(hit: Hit): void {
    this.returnFocus = null;
    this.close();
    this.go(hit.section, hit.command);
  }
}
