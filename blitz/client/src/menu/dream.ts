// The menu out in open space, summoned by Blitz: the sections bloom out of
// it as glowing cards that hang in the dark around it, drifting like
// something half-remembered from a dream. Pick one and it unfolds into a
// floating page with Blitz hovering beside it; send it away and it dissolves
// back into Blitz in a stream of light.

import { accentOf, accentStyle, countUp, enter, glint, spotlight, stardustShower, swapIn } from "./flair";
import { Menu } from "./menu";
import { afresh, keepFields, noteDraft, restoreDraft } from "./panel";
import { offlineCard } from "./pieces";
import { Section, SectionContext, sectionsFor } from "./sections";
import { h, rich } from "./ui";

/** What the menu needs from Blitz's domain. */
export interface DreamHost {
  blitzAt(): { x: number; y: number; r: number };
  stageBox(): { w: number; h: number; top: number; bottom: number };
  hold(at?: { x: number; y: number }, look?: { x: number; y: number }): void;
  summonFx(points: Array<{ x: number; y: number }>, say: string): void;
  dismissFx(from: { x: number; y: number }, spread: number, say: string): void;
}

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

const SUMMON_LINES = ["✨ behold!", "ta-da! ✨", "what shall we look at?", "✨ ooh, the menu!", "here you go ✨"];
const BYE_LINES = ["✨ poof!", "back into the stars ✨", "all tucked away!"];
const CARD_W = 148;
const CARD_H = 96;
/** Small cards (narrow screens) are just an icon and a title. */
const COMPACT_H = 74;
/** Space above the grid on narrow screens for Blitz and what it says. */
const BLITZ_ROOM = 92;
/** Below this width the cards sit in a grid instead of a ring. */
const NARROW = 760;

/**
 * Spots for `n` cards around an ellipse, spaced so that none overlap: along
 * the top and bottom a card needs its width, down the sides only its height,
 * so the spacing follows the direction of travel. Returns the spots and how
 * much the cards must shrink (1 when they fit as they are).
 */
function ringPoints(c: { x: number; y: number }, rx: number, ry: number, n: number, offset: number, cardH = CARD_H): { points: Array<{ x: number; y: number }>; scale: number } {
  const STEPS = 720;
  const GAP = 14;
  const at = (k: number) => {
    const a = -Math.PI / 2 + (k / STEPS) * Math.PI * 2;
    return { x: c.x + Math.cos(a) * rx, y: c.y + Math.sin(a) * ry };
  };
  // How many cards' worth of room each little step of the ring is.
  const room: number[] = [];
  let total = 0;
  for (let k = 0; k < STEPS; k++) {
    const p = at(k);
    const q = at(k + 1);
    const dx = Math.abs(q.x - p.x);
    const dy = Math.abs(q.y - p.y);
    const ds = Math.hypot(dx, dy) || 1e-6;
    const r = ds / ((dx / ds) * (CARD_W + GAP) + (dy / ds) * (cardH + GAP));
    room.push(r);
    total += r;
  }
  const scale = Math.min(1, total / n);
  const points: Array<{ x: number; y: number }> = [];
  let acc = 0;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const want = ((i + offset) / n) * total;
    while (k < STEPS - 1 && acc + room[k] < want) acc += room[k++];
    points.push(at(k + (want - acc) / (room[k] || 1)));
  }
  return { points, scale };
}

export class DreamMenu {
  /** Whether the menu is out. */
  get isOpen(): boolean {
    return this.root !== undefined;
  }
  /** Called when the menu comes out or goes away (to update the summon button). */
  onToggle: ((open: boolean) => void) | undefined;

  private root: HTMLElement | undefined;
  private page: HTMLElement | undefined;
  private section: Section | undefined;
  private cards = new Map<string, HTMLElement>();
  /** Where Blitz floats while the cards are out. */
  private cardsSpot: { x: number; y: number } | undefined;
  private unsubscribe: (() => void) | undefined;
  private drawn: { data: unknown; reply: number } = { data: undefined, reply: 0 };
  /** When the open page was opened: only replies from after that show on it. */
  private openedAt = 0;
  private keyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (this.page) this.backToCards();
      else this.close();
    }
  };

  constructor(
    private menu: Menu,
    private host: DreamHost,
    private parent: HTMLElement,
  ) {}

  toggle(): void {
    if (this.isOpen) this.close();
    else this.summon();
  }

  /** Blitz summons the menu: the cards bloom out around it. */
  summon(): void {
    if (this.root) return;
    this.menu.freshen();
    const box = this.host.stageBox();
    const centre = { x: box.w / 2, y: (box.top + box.bottom) / 2 };
    this.host.hold(centre);
    const veil = h("div.dream-veil");
    veil.addEventListener("click", () => (this.page ? this.backToCards() : this.close()));
    const find = h("button.dream-find", { type: "button", title: "Find anything (Ctrl K)" }, h("span", { "aria-hidden": "true" }, "✦ "), "Find anything ", h("kbd", { text: "Ctrl K" }));
    find.addEventListener("click", () => this.onFind?.());
    this.root = h("div.dream", { role: "dialog", "aria-label": "Blitz's menu" }, veil, find);
    this.parent.append(this.root);
    window.addEventListener("keydown", this.keyHandler);
    this.unsubscribe = this.menu.subscribe(() => this.refresh());
    const points = this.layCards(centre, box);
    this.host.summonFx(points, pick(SUMMON_LINES));
    this.onToggle?.(true);
    (this.root.querySelector(".dream-card") as HTMLElement | null)?.focus({ preventScroll: true });
  }

  /** Opens the quick finder (set by whoever made the menu). */
  onFind: (() => void) | undefined;

  /** Opens one section's page (summoning the menu first if it isn't up). */
  openSection(id: string): void {
    if (!this.isOpen) this.summon();
    const section = sectionsFor(this.menu).find((s) => s.id === id);
    if (section && this.root) this.openPage(section);
  }

  /** Sends the menu away: it dissolves back into Blitz. */
  close(): void {
    const root = this.root;
    if (!root) return;
    this.menu.opened(undefined);
    this.root = undefined;
    this.unsubscribe?.();
    window.removeEventListener("keydown", this.keyHandler);
    const where = this.page ? centreOf(this.page, this.parent) : this.host.blitzAt();
    this.host.dismissFx(where, this.page ? 180 : 320, pick(BYE_LINES));
    this.host.hold(undefined);
    this.page = undefined;
    this.section = undefined;
    this.cards.clear();
    root.classList.add("leaving");
    const done = () => root.remove();
    if (reduced) done();
    else root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: "ease-out", fill: "forwards" }).finished.then(done, done);
    this.onToggle?.(false);
  }

  /** The cards, in a ring around Blitz (or a grid on narrow screens); returns their middles. */
  private layCards(centre: { x: number; y: number }, box: { w: number; h: number; top: number; bottom: number }): Array<{ x: number; y: number }> {
    const root = this.root!;
    const sections = sectionsFor(this.menu);
    const n = sections.length;
    const points: Array<{ x: number; y: number }> = [];
    const narrow = box.w < NARROW;
    let scale = 1;
    /** Per card, when the rings differ. */
    let scales: number[] | undefined;
    /** The inner ring's cards are slim (no blurb). */
    let slim = false;
    let size = "";
    if (narrow) {
      // A grid below Blitz, as many across as fit; small cards drop their blurbs.
      const gap = 8;
      const cols = Math.max(2, Math.min(4, Math.floor((box.w - 24 + gap) / (112 + gap))));
      const w = Math.min(CARD_W, (box.w - 24 - (cols - 1) * gap) / cols);
      const rows = Math.ceil(n / cols);
      const room = box.bottom - box.top - BLITZ_ROOM;
      const compact = w < 140 || rows * (CARD_H + gap) > room;
      const ch = compact ? COMPACT_H : CARD_H;
      scale = Math.min(1, room / (rows * (ch + gap)));
      root.classList.toggle("compact", compact);
      size = `;--w:${w.toFixed(1)}px;--h:${ch}px`;
      const pitchX = (w + gap) * scale;
      const pitchY = (ch + gap) * scale;
      const top = Math.max(box.top + BLITZ_ROOM, box.bottom - rows * pitchY);
      sections.forEach((_, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        points.push({ x: box.w / 2 + (col - (cols - 1) / 2) * pitchX, y: top + row * pitchY + (ch * scale) / 2 });
      });
      this.cardsSpot = { x: box.w / 2, y: Math.max(box.top + 26, top - 40) };
      this.host.hold(this.cardsSpot);
    } else {
      const rx = Math.min(box.w / 2 - CARD_W / 2 - 24, 520);
      const ry = Math.min((box.bottom - box.top) / 2 - CARD_H / 2 - 8, 300);
      const team = sections.filter((x) => x.team).length;
      if (n > 13 && team > 0 && team < n) {
        // Two orbits: everyone's sections close around Blitz, the team's tools on the outer ring.
        let inner = ringPoints(centre, rx * 0.58, ry * 0.58, n - team, 0);
        // A crowded inner ring keeps its cards readable by going slim (icon and title, like on phones).
        if (inner.scale < 0.8) {
          inner = ringPoints(centre, rx * 0.58, ry * 0.58, n - team, 0, COMPACT_H);
          slim = true;
        }
        const outer = ringPoints(centre, rx, ry, team, 0.5);
        scales = [];
        let i = 0;
        let o = 0;
        for (const x of sections) {
          points.push(x.team ? outer.points[o++] : inner.points[i++]);
          scales.push(x.team ? outer.scale : inner.scale);
        }
      } else {
        const ring = ringPoints(centre, rx, ry, n, 0);
        points.push(...ring.points);
        scale = ring.scale;
      }
      this.cardsSpot = centre;
    }
    sections.forEach((section, i) => {
      const p = points[i];
      const card = h(
        `button.dream-card${slim && !section.team ? ".slim" : ""}`,
        { type: "button", style: `left:${p.x}px;top:${p.y}px;--s:${(scales?.[i] ?? scale).toFixed(3)}${slim && !section.team ? `;--h:${COMPACT_H}px` : size};${accentStyle(section.id)}`, "aria-label": `${section.title}: ${section.blurb}` },
        h(
          "span.dream-card-inner",
          { style: `animation-delay:${(-i * 0.73).toFixed(2)}s` },
          h("span.dream-card-icon", { "aria-hidden": "true" }, section.icon),
          h("span.dream-card-title", { text: section.title }),
          h("span.dream-card-blurb", { text: section.blurb }),
          section.team ? h("span.dream-card-team", { text: "team" }) : undefined,
          this.menu.data && section.badge?.(this.menu.data) ? h("span.dream-card-badge", { text: String(section.badge(this.menu.data)) }) : undefined,
        ),
      );
      card.addEventListener("click", () => this.openPage(section));
      glint(card);
      root.append(card);
      this.cards.set(section.id, card);
      if (!reduced) {
        // Out of Blitz, one after another.
        const from = this.host.blitzAt();
        card.animate(
          [
            { transform: `translate(calc(-50% + ${from.x - p.x}px), calc(-50% + ${from.y - p.y}px)) scale(0.15)`, opacity: 0 },
            { opacity: 1, offset: 0.5 },
            { transform: `translate(-50%, -50%) scale(var(--s))`, opacity: 1 },
          ],
          { duration: 700, delay: 60 + i * 45, easing: "cubic-bezier(.2, .9, .25, 1.12)", fill: "backwards" },
        );
      }
    });
    return points;
  }

  /** A card unfolds into its page, and Blitz floats over beside it. */
  private openPage(section: Section): void {
    this.menu.opened(section.id);
    const root = this.root;
    if (!root) return;
    this.section = section;
    this.openedAt = Date.now();
    const card = this.cards.get(section.id);
    const box = this.host.stageBox();
    root.classList.add("paged");
    const back = h("button.dream-btn", { type: "button" }, "◂ All menus");
    back.addEventListener("click", () => this.backToCards());
    const close = h("button.dream-btn", { type: "button", "aria-label": "Send the menu away" }, "✕");
    close.addEventListener("click", () => this.close());
    const body = h("div.dream-page-body");
    const replyBox = h("div.dream-reply", { hidden: true, role: "status" });
    const page = h(
      "section.dream-page",
      { "aria-label": section.title, style: accentStyle(section.id) },
      h("header.dream-page-head", {}, h("span.dream-page-icon.mp-orb", { "aria-hidden": "true" }, section.icon), h("div.dream-page-titles", {}, h("h2", { text: section.title }), h("p", { text: section.blurb })), back, close),
      body,
      replyBox,
    );
    this.page?.parentElement?.remove();
    this.page = page;
    root.append(h("div.dream-page-wrap", {}, page));
    spotlight(body);
    const typed = () => noteDraft(section.id, body);
    body.addEventListener("input", typed);
    body.addEventListener("change", typed);
    enter(body, 1100);
    this.drawPage();

    // Blitz hovers beside the page (above it on narrow screens), looking at it.
    const rect = page.getBoundingClientRect();
    const host = this.parent.getBoundingClientRect();
    const left = rect.left - host.left;
    const top = rect.top - host.top;
    const narrow = box.w < NARROW;
    const at = narrow ? { x: box.w / 2, y: Math.max(box.top + 30, top - 46) } : { x: Math.max(60, left - 140), y: top + Math.min(rect.height / 2, 200) };
    // Blitz casts the page: motes of the section's light stream from Blitz into its orb, which flares.
    const orb = page.querySelector<HTMLElement>(".mp-orb");
    if (orb) {
      const b = this.host.blitzAt();
      const o = orb.getBoundingClientRect();
      stardustShower(DOMRect.fromRect({ x: host.left + b.x, y: host.top + b.y, width: 0, height: 0 }), { x: o.left + o.width / 2, y: o.top + o.height / 2 }, () => orb.classList.add("flare"), accentOf(section.id), 10);
    }
    this.host.hold(at, { x: left + rect.width / 2, y: top + rect.height / 3 });

    if (!reduced && card) {
      // Unfolding out of the card that was picked.
      const c = card.getBoundingClientRect();
      const dx = c.left + c.width / 2 - (rect.left + rect.width / 2);
      const dy = c.top + c.height / 2 - (rect.top + rect.height / 2);
      page.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${(c.width / rect.width).toFixed(3)})`, opacity: 0.2 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 520, easing: "cubic-bezier(.2, .85, .25, 1)" },
      );
    }
    page.querySelector<HTMLElement>("h2")?.setAttribute("tabindex", "-1");
    page.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }

  /** Back to the ring of cards. */
  private backToCards(): void {
    const page = this.page;
    if (!page || !this.root) return;
    this.menu.opened(undefined);
    this.page = undefined;
    this.section = undefined;
    this.root.classList.remove("paged");
    // Back to where Blitz floated for the cards.
    this.host.hold(this.cardsSpot);
    const done = () => page.parentElement?.remove();
    if (reduced) done();
    else page.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.94) translateY(8px)" }], { duration: 260, easing: "ease-in", fill: "forwards" }).finished.then(done, done);
  }

  /** The menu changed (new data, Blitz's reply): draw the open page again. */
  private refresh(): void {
    if (this.page) this.drawPage();
  }

  private drawPage(): void {
    const page = this.page;
    const section = this.section;
    if (!page || !section) return;
    const body = page.querySelector<HTMLElement>(".dream-page-body")!;
    const { menu } = this;
    const replyAt = menu.reply?.at ?? 0;
    const sameSection = body.dataset.section === section.id;
    if (!sameSection || this.drawn.data !== menu.data || !menu.data) {
      const keep = sameSection && !afresh(this.drawn.reply, menu) ? keepFields(body) : undefined;
      if (sameSection) swapIn(body, this.render(section, body));
      else body.replaceChildren(this.render(section, body));
      body.dataset.section = section.id;
      keep?.();
      if (!sameSection) restoreDraft(section.id, body);
      noteDraft(section.id, body);
      countUp(body);
      this.drawn = { data: menu.data, reply: replyAt };
    }
    const replyBox = page.querySelector<HTMLElement>(".dream-reply")!;
    const reply = menu.reply;
    if (reply && reply.at >= this.openedAt && Date.now() - reply.at < 9000) {
      if (replyBox.dataset.at !== String(reply.at)) {
        replyBox.dataset.at = String(reply.at);
        replyBox.replaceChildren(h("span.mp-reply-orb", { "aria-hidden": "true" }), rich(reply.text));
        replyBox.hidden = false;
      }
    } else replyBox.hidden = true;
  }

  private render(section: Section, body: HTMLElement): HTMLElement {
    const { menu } = this;
    if (!menu.data) {
      if (menu.error) return offlineCard(menu);
      return h("div.mcard.mloading", {}, h("span.mloading-orb", { "aria-hidden": "true" }), h("p", { text: "Blitz is gathering the menu…" }));
    }
    const ctx: SectionContext = {
      menu,
      data: menu.data,
      redraw: () => {
        if (this.section !== section) return;
        swapIn(body, this.render(section, body));
        noteDraft(section.id, body);
        countUp(body);
      },
      go: (id) => {
        const next = sectionsFor(menu).find((s) => s.id === id);
        if (next) this.openPage(next);
      },
    };
    return section.render(ctx);
  }
}

/** The middle of `el`, in `parent`'s CSS pixels. */
function centreOf(el: HTMLElement, parent: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  const p = parent.getBoundingClientRect();
  return { x: r.left - p.left + r.width / 2, y: r.top - p.top + r.height / 2 };
}
