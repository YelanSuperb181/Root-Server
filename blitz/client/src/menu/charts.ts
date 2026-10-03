// Small charts for the menu's Pulse page, built to read well at a glance:
// thin marks, hairline grids, one hue per series (a palette checked for
// colour-blind safety against the menu's dark glass), a tooltip on hover or
// focus, and the numbers in a table for anyone who'd rather read them.
// Bars are plain elements (crisp corners at any width); the trend line is
// SVG stretched to fit, with its labels and dots as elements on top so text
// never scales.

import { h } from "./ui";

/** Validated for the dark menu surface (#161b2e): both inside the lightness band, ΔE 19 apart under deutan simulation. */
export const SERIES = { a: "#24a0cc", b: "#db5a46" } as const;
/** Status colours: only ever with a label beside them. */
export const STATUS = { good: "#0ca30c", warning: "#fab219", critical: "#d03b3b" } as const;

const fmt = (n: number) => (Math.abs(n) >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : n.toLocaleString());

/** A clean top for an axis: 1, 2, 2.5 or 5 times a power of ten, at or above `max`. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

/** The tooltip a chart shares between its marks. Rows are value first, then what it is. */
function tooltip(host: HTMLElement): { show(x: number, y: number, title: string, rows: Array<{ value: string; label: string; color?: string }>): void; hide(): void } {
  const tip = h("div.mtip", { role: "status", hidden: true });
  host.append(tip);
  return {
    show(x, y, title, rows) {
      tip.replaceChildren(
        h("p.mtip-title", { text: title }),
        ...rows.map((r) => h("p.mtip-row", {}, r.color ? h("span.mtip-key", { style: `background:${r.color}` }) : undefined, h("strong", { text: r.value }), h("span", { text: r.label }))),
      );
      tip.hidden = false;
      const box = host.getBoundingClientRect();
      const w = tip.offsetWidth;
      tip.style.left = `${Math.min(Math.max(4, x - box.left + 12), box.width - w - 4)}px`;
      tip.style.top = `${Math.max(0, y - box.top - tip.offsetHeight - 10)}px`;
    },
    hide() {
      tip.hidden = true;
    },
  };
}

/** Shows `show` on hover and keyboard focus of `mark`. */
function hoverable(mark: HTMLElement, show: (x: number, y: number) => void, hide: () => void): void {
  mark.tabIndex = 0;
  mark.addEventListener("pointermove", (e) => show(e.clientX, e.clientY));
  mark.addEventListener("pointerleave", hide);
  mark.addEventListener("focus", () => {
    const r = mark.getBoundingClientRect();
    show(r.left + r.width / 2, r.top);
  });
  mark.addEventListener("blur", hide);
}

/** The same numbers as a table, folded away under the chart. */
export function tableView(caption: string, head: string[], rows: Array<Array<string | number>>): HTMLElement {
  const table = h("table.mtable", {}, h("caption", { text: caption }), h("thead", {}, h("tr", {}, ...head.map((x) => h("th", { scope: "col", text: x })))));
  const body = h("tbody");
  for (const row of rows) body.append(h("tr", {}, ...row.map((x, i) => h(i === 0 ? "th" : "td", i === 0 ? { scope: "row", text: String(x) } : { text: typeof x === "number" ? x.toLocaleString() : x }))));
  table.append(body);
  return h("details.mtable-wrap", {}, h("summary", { text: "Show the numbers" }), table);
}

/** Gridlines with their values, as hairlines behind the marks. */
function grid(top: number, steps = 2): HTMLElement {
  const g = h("div.mgrid", { "aria-hidden": "true" });
  for (let i = 0; i <= steps; i++) {
    const v = (top / steps) * i;
    g.append(h("div.mgrid-line", { style: `bottom:${(i / steps) * 100}%` }, h("span", { text: fmt(Math.round(v)) })));
  }
  return g;
}

export interface Point {
  label: string;
  value: number;
}

/** One series over time, as a line with a soft wash under it; the latest value labelled at the end. */
export function trendChart(points: Point[], what: string): HTMLElement {
  const wrap = h("div.mchart.trend");
  const plot = h("div.mplot");
  const top = niceMax(Math.max(...points.map((p) => p.value), 1));
  const n = Math.max(1, points.length - 1);
  const xy = points.map((p, i) => [(i / n) * 100, 100 - (p.value / top) * 100] as const);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = document.createElementNS(ns, "path");
  area.setAttribute("d", `${line} L100,100 L0,100 Z`);
  area.setAttribute("fill", SERIES.a);
  area.setAttribute("fill-opacity", "0.12");
  const stroke = document.createElementNS(ns, "path");
  stroke.setAttribute("d", line);
  stroke.setAttribute("fill", "none");
  stroke.setAttribute("stroke", SERIES.a);
  stroke.setAttribute("stroke-width", "2");
  stroke.setAttribute("stroke-linejoin", "round");
  stroke.setAttribute("stroke-linecap", "round");
  stroke.setAttribute("vector-effect", "non-scaling-stroke");
  svg.append(area, stroke);
  const last = xy[xy.length - 1];
  const end = h("span.mdot", { style: `left:${last[0]}%;top:${last[1]}%;background:${SERIES.a}` });
  const endLabel = h("span.mend-label", { style: `top:${last[1]}%`, text: fmt(points[points.length - 1]?.value ?? 0) });
  const cross = h("div.mcross", { hidden: true });
  const hoverDot = h("span.mdot", { hidden: true, style: `background:${SERIES.a}` });
  plot.append(grid(top), svg, cross, hoverDot, end, endLabel);
  const axis = h("div.maxis", {}, h("span", { text: points[0]?.label ?? "" }), h("span", { text: points[Math.floor(points.length / 2)]?.label ?? "" }), h("span", { text: "today" }));
  wrap.append(plot, axis);
  const tip = tooltip(wrap);
  // The crosshair finds the nearest day; nobody has to land on a 2px line.
  const at = (clientX: number) => {
    const r = plot.getBoundingClientRect();
    return Math.min(points.length - 1, Math.max(0, Math.round(((clientX - r.left) / r.width) * n)));
  };
  const show = (clientX: number, clientY: number, i = at(clientX)) => {
    const [x, y] = xy[i];
    cross.hidden = hoverDot.hidden = false;
    cross.style.left = `${x}%`;
    hoverDot.style.left = `${x}%`;
    hoverDot.style.top = `${y}%`;
    tip.show(clientX, clientY, points[i].label, [{ value: points[i].value.toLocaleString(), label: what, color: SERIES.a }]);
  };
  plot.tabIndex = 0;
  plot.setAttribute("role", "img");
  plot.setAttribute("aria-label", `${what} per day: ${points.map((p) => `${p.label} ${p.value}`).join(", ")}`);
  plot.addEventListener("pointermove", (e) => show(e.clientX, e.clientY));
  plot.addEventListener("pointerleave", () => ((cross.hidden = hoverDot.hidden = true), tip.hide()));
  let focusAt = points.length - 1;
  plot.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    focusAt = Math.min(points.length - 1, Math.max(0, focusAt + (e.key === "ArrowLeft" ? -1 : 1)));
    const r = plot.getBoundingClientRect();
    show(r.left + (xy[focusAt][0] / 100) * r.width, r.top + (xy[focusAt][1] / 100) * r.height, focusAt);
  });
  plot.addEventListener("blur", () => ((cross.hidden = hoverDot.hidden = true), tip.hide()));
  return wrap;
}

/** Two opposite things per day from one baseline: `up` above it, `down` below (joins and leaves). */
export function upDownChart(days: Array<{ label: string; up: number; down: number }>, upName: string, downName: string): HTMLElement {
  const wrap = h("div.mchart.updown");
  const top = niceMax(Math.max(1, ...days.map((d) => Math.max(d.up, d.down))));
  const cols = h("div.mupdown", { role: "img", "aria-label": `${upName} and ${downName} per day` });
  const tip = tooltip(wrap);
  for (const d of days) {
    const col = h(
      "div.mupdown-col",
      {},
      h("div.mupdown-half.up", {}, h("span.mbar-v.up", { style: `height:${(d.up / top) * 100}%;background:${SERIES.a}` })),
      h("div.mupdown-half.down", {}, h("span.mbar-v.down", { style: `height:${(d.down / top) * 100}%;background:${SERIES.b}` })),
    );
    hoverable(
      col,
      (x, y) => tip.show(x, y, d.label, [{ value: d.up.toLocaleString(), label: upName, color: SERIES.a }, { value: d.down.toLocaleString(), label: downName, color: SERIES.b }]),
      tip.hide,
    );
    cols.append(col);
  }
  const legend = h("div.mlegend", {}, h("span", {}, h("i", { style: `background:${SERIES.a}` }), upName), h("span", {}, h("i", { style: `background:${SERIES.b}` }), downName), h("span.mlegend-scale", { text: `scale: ${top} a day` }));
  wrap.append(legend, cols, h("div.maxis", {}, h("span", { text: days[0]?.label ?? "" }), h("span", { text: "today" })));
  return wrap;
}

/** Columns for the 24 hours (UTC), the busiest one labelled. */
export function hoursChart(hours: number[]): HTMLElement {
  const wrap = h("div.mchart.hours");
  const max = Math.max(1, ...hours);
  const top = niceMax(max);
  const peak = hours.indexOf(max);
  const local = (hUtc: number) => {
    const d = new Date();
    d.setUTCHours(hUtc, 0, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "numeric" });
  };
  const plot = h("div.mplot");
  const cols = h("div.mcols", { role: "img", "aria-label": `Messages by hour; busiest around ${local(peak)}` });
  const tip = tooltip(wrap);
  hours.forEach((n, i) => {
    const col = h("div.mcol", {}, h("span.mbar-v", { style: `height:${(n / top) * 100}%;background:${SERIES.a}` }, i === peak && n > 0 ? h("span.mbar-tip", { text: fmt(n) }) : undefined));
    hoverable(col, (x, y) => tip.show(x, y, `${local(i)} (your time)`, [{ value: n.toLocaleString(), label: "messages", color: SERIES.a }]), tip.hide);
    cols.append(col);
  });
  plot.append(grid(top, 2), cols);
  // Each label sits under the middle of its hour's column.
  const axis = h("div.maxis.at", {}, ...[0, 6, 12, 18].map((hr) => h("span", { style: `left:${((hr + 0.5) / 24) * 100}%`, text: local(hr) })));
  wrap.append(plot, axis);
  return wrap;
}

/** Horizontal bars, biggest first, the value at each tip. */
export function barList(items: Point[], unit: string): HTMLElement {
  const top = Math.max(1, ...items.map((i) => i.value));
  const wrap = h("div.mchart.bars");
  const tip = tooltip(wrap);
  for (const item of items) {
    const row = h("div.mhbar", {}, h("span.mhbar-label", { text: item.label }), h("span.mhbar-track", {}, h("span.mbar-h", { style: `width:${Math.max(2, (item.value / top) * 100)}%;background:${SERIES.a}` }), h("span.mhbar-value", { text: fmt(item.value) })));
    hoverable(row, (x, y) => tip.show(x, y, item.label, [{ value: item.value.toLocaleString(), label: unit, color: SERIES.a }]), tip.hide);
    wrap.append(row);
  }
  return wrap;
}

/** A tiny trend for a stat tile: muted, with the latest point in the accent. */
export function sparkline(values: number[]): HTMLElement {
  const top = Math.max(1, ...values);
  const n = Math.max(1, values.length - 1);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 100 30");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", values.map((v, i) => `${i ? "L" : "M"}${((i / n) * 100).toFixed(1)},${(28 - (v / top) * 26).toFixed(1)}`).join(" "));
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "rgba(170, 186, 220, 0.55)");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("vector-effect", "non-scaling-stroke");
  svg.append(path);
  const last = values[values.length - 1] ?? 0;
  return h("span.mspark", {}, svg, h("span.mspark-dot", { style: `top:${((28 - (last / top) * 26) / 30) * 100}%;background:${SERIES.a}` }));
}

/** A headline number with an optional change and trend. */
export function statTile(label: string, value: number, change?: { fraction: number; upIsGood: boolean }, trend?: number[]): HTMLElement {
  const delta =
    change && Number.isFinite(change.fraction)
      ? (() => {
          const pct = Math.round(change.fraction * 100);
          const good = pct === 0 ? undefined : pct > 0 === change.upIsGood;
          return h(`span.mdelta${good === undefined ? "" : good ? ".good" : ".bad"}`, { text: `${pct > 0 ? "▲" : pct < 0 ? "▼" : "•"} ${Math.abs(pct)}%`, title: "vs last week" });
        })()
      : undefined;
  return h("div.mstat", {}, h("p.mstat-label", { text: label }), h("p.mstat-value", { text: fmt(value) }), delta, trend && trend.length > 1 ? sparkline(trend) : undefined);
}

/** The community's health: one big number and a meter, its status in words as well as colour. */
export function healthFigure(score: number): HTMLElement {
  const status = score >= 70 ? { word: "Thriving", color: STATUS.good, icon: "✦" } : score >= 45 ? { word: "Steady", color: STATUS.warning, icon: "◐" } : { word: "Needs care", color: STATUS.critical, icon: "!" };
  return h(
    "div.mhealth",
    {},
    h("div.mhealth-top", {}, h("p.mhealth-value", { text: String(score) }), h("p.mhealth-status", {}, h("span.mhealth-icon", { style: `background:${status.color}`, "aria-hidden": "true" }, status.icon), status.word)),
    h("div.mmeter", { role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(score), "aria-label": `Health ${score} of 100, ${status.word}` }, h("span", { style: `width:${score}%;background:${status.color}` })),
    h("p.mnote", { text: "Out of 100, from this week's activity trend, who stayed versus left, and how calm it's been." }),
  );
}
