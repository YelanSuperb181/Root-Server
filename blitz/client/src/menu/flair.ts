// The menu's flourishes: each section's own colour, numbers that count up,
// a soft spotlight that follows the pointer over cards, Stardust that flies
// into Blitz (and from Blitz into a dream page it opens), and a glint that
// follows the pointer over the dream cards.
// Everything moves with transforms and opacity only, and only briefly or
// while the pointer is there, so it stays cheap on computers without a
// graphics card (Root's desktop app often draws in software).

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Each section's colour: its tab, its header orb, its cards' edges and its main buttons. */
const ACCENTS: Record<string, string> = {
  you: "#7fe3ff",
  levels: "#8dffb0",
  stardust: "#ffd36e",
  roles: "#ff9ad5",
  giveaways: "#ff7ab6",
  reminders: "#ffb26b",
  birthday: "#ff8f9e",
  ideas: "#fff07a",
  inbox: "#79b8ff",
  fun: "#c79bff",
  commands: "#6ff0d8",
  guardian: "#6fe39a",
  moderation: "#ff7a6b",
  pulse: "#b4ff6b",
  ask: "#b18cff",
  post: "#ff9f7a",
  customs: "#ffc46b",
  setup: "#a9b8d9",
};

export function accentOf(sectionId: string): string {
  return ACCENTS[sectionId] ?? "#7fe3ff";
}

/** CSS custom properties for a section's colour (`--accent`, and a see-through `--accent-soft`). */
export function accentStyle(sectionId: string): string {
  const hex = accentOf(sectionId);
  const n = parseInt(hex.slice(1), 16);
  return `--accent:${hex};--accent-rgb:${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** The last button pressed for an action, and when: where a reward's Stardust flies from. */
let pressed: { rect: DOMRect; at: number } | undefined;

export function notePress(el: HTMLElement): void {
  pressed = { rect: el.getBoundingClientRect(), at: Date.now() };
}

/** Where the button pressed in the last few seconds was (if it was). */
export function recentPress(ms = 6000): DOMRect | undefined {
  return pressed && Date.now() - pressed.at < ms ? pressed.rect : undefined;
}

/** Last value shown per counter, so a refresh counts from there (not from 0 again). */
const shownCounts = new Map<string, number>();

/**
 * Numbers marked `data-count` (and `data-key`, to remember them by) count up
 * to their value the first time, and from the old value when it changes.
 */
export function countUp(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-count]")) {
    const to = Number(el.dataset.count);
    const key = el.dataset.key ?? "";
    const from = key ? (shownCounts.get(key) ?? 0) : 0;
    if (key) shownCounts.set(key, to);
    if (reduced || !Number.isFinite(to) || from === to) continue;
    const start = performance.now();
    const dur = Math.min(900, 380 + Math.abs(to - from) * 0.6);
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      const eased = 1 - (1 - k) ** 3;
      el.textContent = Math.round(from + (to - from) * eased).toLocaleString();
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    };
    el.textContent = from.toLocaleString();
    requestAnimationFrame(step);
  }
}

/** A soft light under the pointer on any `.mcard` inside `root` (one listener, a frame at a time). */
export function spotlight(root: HTMLElement): void {
  if (reduced || matchMedia("(hover: none)").matches) return;
  let queued: PointerEvent | undefined;
  let lit: HTMLElement | undefined;
  root.addEventListener("pointermove", (e) => {
    if (!queued) requestAnimationFrame(() => {
      const ev = queued!;
      queued = undefined;
      const card = (ev.target as HTMLElement | null)?.closest<HTMLElement>(".mcard");
      if (lit && lit !== card) lit.classList.remove("lit");
      lit = card ?? undefined;
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${(ev.clientX - r.left).toFixed(0)}px`);
      card.style.setProperty("--my", `${(ev.clientY - r.top).toFixed(0)}px`);
      card.classList.add("lit");
    });
    queued = e;
  });
  root.addEventListener("pointerleave", () => {
    lit?.classList.remove("lit");
    lit = undefined;
  });
}

/**
 * Stardust flies from `from` (a button) to `to` (where Blitz is, in viewport
 * pixels) along a curve, a few motes at a time; `arrive` runs as the first lands.
 */
export function stardustShower(from: DOMRect, to: { x: number; y: number }, arrive?: () => void, colour = "#ffd36e", n = 16): void {
  if (reduced) {
    arrive?.();
    return;
  }
  const layer = document.createElement("div");
  layer.className = "mshower";
  document.body.append(layer);
  const sx = from.left + from.width / 2;
  const sy = from.top + from.height / 2;
  let landed = false;
  let left = n;
  for (let i = 0; i < n; i++) {
    const mote = document.createElement("span");
    mote.className = "mshower-mote";
    mote.style.setProperty("--c", colour);
    layer.append(mote);
    const dx = to.x - sx;
    const dy = to.y - sy;
    // Each mote arcs a little differently: up and out, then into Blitz.
    const lift = -60 - Math.random() * 90;
    const side = (Math.random() - 0.5) * 160;
    const mx = sx + dx * 0.45 + side;
    const my = sy + dy * 0.35 + lift;
    const size = 0.6 + Math.random() * 0.9;
    const anim = mote.animate(
      [
        { transform: `translate(${sx}px, ${sy}px) scale(${size * 0.4})`, opacity: 0 },
        { transform: `translate(${mx}px, ${my}px) scale(${size})`, opacity: 1, offset: 0.45 },
        { transform: `translate(${to.x}px, ${to.y}px) scale(${size * 0.3})`, opacity: 0.9 },
      ],
      { duration: 820 + Math.random() * 260, delay: i * 28, easing: "cubic-bezier(.35, 0, .2, 1)", fill: "both" },
    );
    anim.finished.then(
      () => {
        if (!landed) {
          landed = true;
          arrive?.();
        }
        if (--left === 0) layer.remove();
      },
      () => layer.remove(),
    );
  }
}

/** A glint that follows the pointer over a card (only that card, and only then). */
export function glint(card: HTMLElement): void {
  if (reduced || matchMedia("(hover: none)").matches) return;
  let queued: PointerEvent | undefined;
  card.addEventListener("pointermove", (e) => {
    if (!queued) requestAnimationFrame(() => {
      const ev = queued!;
      queued = undefined;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--gx", `${(((ev.clientX - r.left) / r.width) * 100).toFixed(0)}%`);
      card.style.setProperty("--gy", `${(((ev.clientY - r.top) / r.height) * 100).toFixed(0)}%`);
    });
    queued = e;
  });
}
