// The menu beside the bubble: a glass panel with every section in a list
// down its side (the team's tools in their own group), the open section, and
// Blitz's reply to whatever was just picked.

import { accentStyle, countUp, spotlight } from "./flair";
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
  private enterTimer: ReturnType<typeof setTimeout> | undefined;
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
      // A refresh in the background keeps what's being typed; after something's picked, the forms start afresh.
      const keep = same && this.drawn.reply === replyAt ? keepFields(this.content) : undefined;
      this.content.replaceChildren(this.body(section));
      keep?.();
      countUp(this.content);
      if (!same) {
        // A new section's cards float in one after another.
        this.content.classList.remove("enter");
        void this.content.offsetWidth;
        this.content.classList.add("enter");
        if (this.enterTimer) clearTimeout(this.enterTimer);
        this.enterTimer = setTimeout(() => this.content.classList.remove("enter"), 900);
      }
    }
    this.drawn = { section: section.id, data: menu.data, reply: replyAt };
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
        if (this.current === section.id) this.content.replaceChildren(this.body(section));
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
