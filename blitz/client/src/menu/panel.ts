// The menu beside the bubble: a glass panel with every section in a list
// down its side (the team's tools in their own group), the open section, and
// Blitz's reply to whatever was just picked.

import { accentStyle, countUp, enter, spotlight, swapIn } from "./flair";
import { Menu } from "./menu";
import { offlineCard } from "./pieces";
import { Section, SectionContext, sectionsFor } from "./sections";
import { h, rich } from "./ui";

/** Blitz's reply stays up this long. */
const REPLY_MS = 9000;

export class MenuPanel {
  readonly el: HTMLElement;
  private nav: HTMLElement;
  private content: HTMLElement;
  private replyBox: HTMLElement;
  private sub: HTMLElement;
  /** The glowing marker that slides to the open section's tab. */
  private marker: HTMLElement;
  private markerReady = false;
  /** Opens the quick finder (set by whoever made the panel). */
  onFind: (() => void) | undefined;
  private current = "you";
  private replyTimer: ReturnType<typeof setTimeout> | undefined;
  private shownReply = 0;
  /** What the open section was last drawn from. */
  private drawn: { section: string; data: unknown; reply: number } = { section: "", data: undefined, reply: 0 };

  constructor(private menu: Menu) {
    this.sub = h("p.mp-sub", { text: "Everything Blitz can do here" });
    this.nav = h("nav.mp-nav", { "aria-label": "Menu sections" });
    this.content = h("section.mp-content", { "aria-live": "polite" });
    this.replyBox = h("div.mp-reply", { hidden: true, role: "status" });
    this.marker = h("span.mp-marker", { "aria-hidden": "true" });
    const find = h("button.mp-find", { type: "button", title: "Find anything (Ctrl K)" }, h("span", { "aria-hidden": "true" }, "✦"), h("span.mp-find-label", { text: "Find" }), h("kbd", { text: "Ctrl K" }));
    find.addEventListener("click", () => this.onFind?.());
    this.el = h(
      "aside.menu-panel",
      { "aria-label": "Blitz's menu" },
      h("header.mp-head", {}, h("span.mp-aurora", { "aria-hidden": "true" }), h("div.sigil", { "aria-hidden": "true" }), h("div.mp-titles", {}, h("h2", { text: "Blitz's Menu" }), this.sub), find),
      h("div.mp-body", {}, this.nav, h("div.mp-main", {}, this.content, this.replyBox)),
    );
    spotlight(this.content);
    const typed = () => noteDraft(this.current, this.content);
    this.content.addEventListener("input", typed);
    this.content.addEventListener("change", typed);
    menu.subscribe(() => this.draw());
    this.draw();
  }

  /** Opens a section. */
  open(id: string): void {
    this.current = id;
    this.menu.opened(id);
    this.menu.freshen();
    this.draw();
    this.content.scrollTop = 0;
  }

  private draw(): void {
    const { menu } = this;
    const data = menu.data;
    this.sub.textContent = menu.api.demo
      ? "Preview · a made-up community"
      : data && menu.error
        ? "⚠️ Lost touch with Blitz's server; trying again…"
        : data?.community
          ? `Everything Blitz can do in ${data.community}`
          : "Everything Blitz can do here";
    const sections = sectionsFor(menu);
    if (!sections.some((s) => s.id === this.current)) this.current = "you";

    this.nav.replaceChildren();
    let teamLabel = false;
    for (const s of sections) {
      if (s.team && !teamLabel) {
        teamLabel = true;
        this.nav.append(h("p.mp-group", { text: "For the team" }));
      }
      const count = data ? s.badge?.(data) : undefined;
      const b = h(
        `button.mp-tab${s.id === this.current ? ".on" : ""}`,
        { type: "button", style: accentStyle(s.id), "aria-current": s.id === this.current ? "page" : undefined, "aria-label": count ? `${s.title}, ${count} new` : undefined },
        h("span.mp-tab-icon", { "aria-hidden": "true" }, s.icon),
        h("span.mp-tab-label", { text: s.title }),
        count ? h("span.mp-badge", { "aria-hidden": "true", text: String(count) }) : undefined,
      );
      b.addEventListener("click", () => this.open(s.id));
      this.nav.append(b);
    }

    const section = sections.find((s) => s.id === this.current)!;
    this.nav.append(this.marker);
    this.placeMarker();
    // The whole panel takes on the open section's colour.
    for (const part of accentStyle(section.id).split(";")) {
      const [name, value] = part.split(":");
      this.el.style.setProperty(name, value);
    }
    const replyAt = menu.reply?.at ?? 0;
    const same = this.drawn.section === section.id;
    if (!same || this.drawn.data !== menu.data || !menu.data) {
      const keep = same && !afresh(this.drawn.reply, menu) ? keepFields(this.content) : undefined;
      if (same) swapIn(this.content, this.body(section));
      else {
        // A new section's cards float in one after another, with whatever was typed there before.
        this.content.replaceChildren(this.body(section));
        enter(this.content, 900);
      }
      keep?.();
      if (!same) restoreDraft(section.id, this.content);
      noteDraft(section.id, this.content);
      countUp(this.content);
      this.drawn = { section: section.id, data: menu.data, reply: replyAt };
    }
    this.drawReply();
  }

  /** Slides the marker under the open tab (it jumps there the first time). */
  private placeMarker(): void {
    const on = this.nav.querySelector<HTMLElement>(".mp-tab.on");
    if (!on) return;
    requestAnimationFrame(() => {
      if (!on.isConnected) return;
      this.marker.style.width = `${on.offsetWidth}px`;
      this.marker.style.height = `${on.offsetHeight}px`;
      this.marker.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
      if (!this.markerReady) {
        this.markerReady = true;
        requestAnimationFrame(() => this.marker.classList.add("ready"));
      }
    });
  }

  private body(section: Section): HTMLElement {
    const { menu } = this;
    const head = h(
      "div.mp-section-head",
      {},
      h("span.mp-orb", { "aria-hidden": "true" }, section.icon),
      h("div.mp-section-titles", {}, h("h3", { text: section.title }), h("p", { text: section.blurb })),
    );
    if (!menu.data) {
      if (menu.error) return h("div", {}, head, offlineCard(menu));
      return h("div", {}, head, h("div.mcard.mloading", {}, h("span.mloading-orb", { "aria-hidden": "true" }), h("p", { text: "Blitz is gathering the menu…" })));
    }
    const ctx: SectionContext = {
      menu,
      data: menu.data,
      redraw: () => {
        if (this.current !== section.id) return;
        swapIn(this.content, this.body(section));
        noteDraft(section.id, this.content);
        countUp(this.content);
      },
      go: (id) => this.open(id),
    };
    return h("div", {}, head, section.render(ctx));
  }

  private drawReply(): void {
    const reply = this.menu.reply;
    if (!reply || Date.now() - reply.at > REPLY_MS) {
      this.replyBox.hidden = true;
      return;
    }
    if (reply.at === this.shownReply) return;
    this.shownReply = reply.at;
    const close = h("button.mp-reply-close", { type: "button", "aria-label": "Dismiss" }, "✕");
    close.addEventListener("click", () => this.menu.dismissReply());
    this.replyBox.replaceChildren(h("span.mp-reply-orb", { "aria-hidden": "true" }), h("div.mp-reply-text", {}, h("p.mp-reply-from", { text: "Blitz" }), rich(reply.text)), close);
    this.replyBox.classList.toggle("bad", !reply.ok);
    this.replyBox.hidden = false;
    this.replyBox.classList.remove("show");
    void this.replyBox.offsetWidth; // restart the entrance
    this.replyBox.classList.add("show");
    if (this.replyTimer) clearTimeout(this.replyTimer);
    this.replyTimer = setTimeout(() => {
      if (this.menu.reply?.at === reply.at) this.menu.dismissReply();
    }, REPLY_MS);
  }
}

/**
 * Whether the forms should start afresh in this redraw: yes after something
 * picked in the menu worked (since the last time they were drawn), so the
 * same announcement can't go out twice. A refresh in the background keeps
 * what's being typed, and so does something that didn't work: fix it and
 * try again.
 */
export function afresh(replyDrawn: number, menu: Menu): boolean {
  const reply = menu.reply;
  return !!reply && reply.at !== replyDrawn && reply.ok;
}

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const fieldsIn = (root: HTMLElement) => [...root.querySelectorAll<Field>("input:not([type=checkbox]):not([type=radio]), textarea, select")];

/** What was last in each section's fields, so leaving a section and coming back finds it as it was. */
const drafts = new Map<string, string[]>();

/** Remembers what's in `sectionId`'s fields now. */
export function noteDraft(sectionId: string, root: HTMLElement): void {
  drafts.set(sectionId, fieldsIn(root).map((f) => f.value));
}

/** Puts back what was in `sectionId`'s fields when it was left (if the fields still line up), and lets the section catch up. */
export function restoreDraft(sectionId: string, root: HTMLElement): void {
  const values = drafts.get(sectionId);
  const fields = fieldsIn(root);
  if (!values || values.length !== fields.length) return;
  const changed = fields.filter((f, i) => f.value !== values[i] && ((f.value = values[i]), true));
  for (const f of changed) {
    if (!f.isConnected) continue;
    f.dispatchEvent(new Event("input", { bubbles: true }));
    if (f instanceof HTMLSelectElement) f.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/** Remembers what's typed in the fields under `root`; the function returned puts it back after a redraw (where the fields line up). */
export function keepFields(root: HTMLElement): () => void {
  const fields = () => [...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")];
  const before = fields().map((f) => ({ value: f.value, focused: f === document.activeElement, at: "selectionStart" in f ? f.selectionStart : null }));
  return () => {
    const after = fields();
    if (after.length !== before.length) return;
    after.forEach((f, i) => {
      const b = before[i];
      if (f.value !== b.value) {
        f.value = b.value;
        f.dispatchEvent(new Event("input"));
      }
      if (b.focused) {
        f.focus();
        if (b.at !== null && "setSelectionRange" in f) f.setSelectionRange(b.at, b.at);
      }
    });
  };
}
