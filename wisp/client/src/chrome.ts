// The window around the domain, during the burst and the re-seal: the glass
// panel dissolves outward (or settles back in), and the title bar and message
// box glide between their places instead of jumping. Plain Web Animations.

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const glide = "cubic-bezier(.2, .8, .2, 1)";

export interface ChromeRects {
  window: DOMRect;
  bar: DOMRect;
  say: DOMRect;
}

const el = (selector: string) => document.querySelector(selector) as HTMLElement | null;

export function measureChrome(): ChromeRects | undefined {
  const w = el(".window");
  const bar = el(".bar");
  const say = el(".say");
  if (!w || !bar || !say) return undefined;
  return { window: w.getBoundingClientRect(), bar: bar.getBoundingClientRect(), say: say.getBoundingClientRect() };
}

/** Moves `node` from where it was (`from`) to where it is now, smoothly. */
function slideFrom(node: HTMLElement | null, from: DOMRect, delay: number, duration: number): void {
  if (!node || reduced) return;
  const to = node.getBoundingClientRect();
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  node.animate(
    [
      { transform: `translate(${dx}px, ${dy}px)`, opacity: 0.35 },
      { transform: "translate(0, 0)", opacity: 1 },
    ],
    { duration, delay, easing: glide, fill: "backwards" },
  );
}

/** The bubble burst: the glass window breaks away outward while its bar and message box glide to the edges. */
export function chromeBurst(before: ChromeRects | undefined): void {
  if (!before) return;
  if (!reduced) {
    const ghost = document.createElement("div");
    ghost.className = "ghost-window";
    Object.assign(ghost.style, {
      left: `${before.window.left}px`,
      top: `${before.window.top}px`,
      width: `${before.window.width}px`,
      height: `${before.window.height}px`,
    });
    document.body.append(ghost);
    ghost
      .animate(
        [
          { transform: "scale(1)", opacity: 1, filter: "blur(0px)" },
          { transform: "scale(1.22)", opacity: 0, filter: "blur(14px)" },
        ],
        { duration: 750, easing: "cubic-bezier(.1, .7, .3, 1)", fill: "forwards" },
      )
      .finished.finally(() => ghost.remove());
  }
  slideFrom(el(".bar"), before.bar, 120, 900);
  slideFrom(el(".say"), before.say, 200, 900);
}

/**
 * The bubble re-formed: the glass panel fades back in around it (only the
 * panel; the bubble inside stays crisp), and the bar and message box glide home.
 */
export function chromeReform(before: ChromeRects | undefined): void {
  const w = el(".window");
  if (w && !reduced) {
    w.animate(
      [
        { backgroundColor: "rgba(14, 20, 38, 0)", borderColor: "rgba(160, 196, 255, 0)", boxShadow: "0 0 0 rgba(0, 0, 0, 0), 0 0 0 rgba(0, 0, 0, 0)" },
        {},
      ],
      { duration: 700, easing: glide },
    );
    el(".hints")?.animate([{ opacity: 0, transform: "translateY(8px)" }, {}], { duration: 600, delay: 150, easing: glide, fill: "backwards" });
  }
  if (!before) return;
  slideFrom(el(".bar"), before.bar, 0, 750);
  slideFrom(el(".say"), before.say, 60, 750);
}
