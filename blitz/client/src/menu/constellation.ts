// The leaderboard as a constellation: the top members are stars, brighter and
// bigger the higher their level, joined in order like a figure in the night
// sky. Your own star wears a golden ring. The list beside it carries the same
// names and numbers, so nothing here is only in the picture.

import type { MenuOverview } from "./api";
import { h } from "./ui";

type Leader = NonNullable<MenuOverview["levels"]>["top"][number];

/** Where each star sits (in percent of the sky), a gently wandering line from left to right. */
function placeStars(n: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    // Alternating high and low (a zig-zag with some wander), so each label has room on its outer side.
    out.push({ x: 7 + k * 86, y: 50 + (i % 2 ? 1 : -1) * (16 + Math.abs(Math.sin(i * 1.9 + 0.4)) * 10) });
  }
  return out;
}

export function constellation(top: readonly Leader[], meId: string): HTMLElement {
  const sky = h("div.mconst", { role: "img", "aria-label": `The leaderboard as a constellation: ${top.map((l, i) => `${i + 1}. ${l.name}, level ${l.level}`).join("; ")}` });
  if (top.length === 0) return sky;
  const spots = placeStars(top.length);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", spots.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "));
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "rgba(170, 220, 255, 0.35)");
  path.setAttribute("stroke-width", "1");
  path.setAttribute("vector-effect", "non-scaling-stroke");
  svg.append(path);
  sky.append(svg);
  const maxLevel = Math.max(...top.map((l) => l.level), 1);
  top.forEach((l, i) => {
    const p = spots[i];
    const size = 6 + (l.level / maxLevel) * 10;
    const star = h(
      `span.mstar${l.userId === meId ? ".me" : ""}${i === 0 ? ".first" : ""}`,
      { style: `left:${p.x}%;top:${p.y}%;--s:${size.toFixed(1)}px;animation-delay:${(-i * 0.61).toFixed(2)}s`, "aria-hidden": "true" },
    );
    // Neighbours' labels go on opposite sides, so they never crowd each other: a star above its neighbours is labelled above.
    const below = p.y > (spots[i - 1]?.y ?? spots[i + 1]?.y ?? 50);
    const label = h(`span.mstar-label${below ? ".below" : ""}`, { style: `left:${Math.min(94, Math.max(6, p.x))}%;top:${p.y}%`, "aria-hidden": "true" }, h("strong", { text: l.name }), h("span", { text: `Lv ${l.level}` }));
    sky.append(star, label);
  });
  return sky;
}
