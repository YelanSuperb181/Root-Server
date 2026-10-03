// Little building blocks for the menu: making elements, drawing Blitz's
// replies (its chat formatting, as elements, never raw HTML), avatars, and
// friendly times.

import { ImageUriResolution, rootClient } from "@rootsdk/client-app";
import { RichPart, parseRich } from "@blitz/shared";

type Child = Node | string | false | null | undefined;
type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;

/** The tag in an element spec: "button" in "button.mbtn.primary". */
type TagOf<S extends string> = S extends `${infer T}.${string}` ? T : S;
type ElementOf<S extends string> = TagOf<S> extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[TagOf<S>] : HTMLElement;

/** An element: h("button.mbtn.primary", { onclick }, "Save"). Attributes starting with "on" are listeners. */
export function h<S extends string>(spec: S, attrs: Attrs = {}, ...children: Child[]): ElementOf<S> {
  const [tag, ...classes] = spec.split(".");
  const el = document.createElement(tag) as ElementOf<S>;
  if (classes.length) el.className = classes.join(" ");
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "text") el.textContent = String(value);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

/** Blitz's reply text, drawn: bold, italics, code, quotes, links, and mentions as chips (a person's opens their profile). */
export function rich(text: string): HTMLElement {
  const box = h("div.rich");
  for (const line of parseRich(text)) {
    const el = h(line.quote ? "blockquote" : line.bullet ? "p.bullet" : line.heading ? "p.heading" : "p");
    for (const part of line.parts) el.append(richPart(part));
    if (!line.parts.length) el.append(" ");
    box.append(el);
  }
  return box;
}

function richPart(part: RichPart): Node {
  switch (part.kind) {
    case "text":
      return document.createTextNode(part.text);
    case "bold":
    case "italic": {
      const el = h(part.kind === "bold" ? "strong" : "em");
      for (const p of part.parts) el.append(richPart(p));
      return el;
    }
    case "code":
      return h("code", { text: part.text });
    case "user":
      return h("button.mention", { type: "button", title: "Open their profile", onclick: () => showProfile(part.id) }, `@${part.name}`);
    case "role":
      return h("span.mention", {}, `@${part.name}`);
    case "channel":
      return h("span.mention", {}, `#${part.name}`);
    case "link":
      return h("a", { href: part.href, target: "_blank", rel: "noopener noreferrer" }, part.text);
  }
}

function showProfile(userId: string): void {
  try {
    rootClient.users.showUserProfile(userId);
  } catch {
    // Outside Root there are no profiles to show.
  }
}

/** Profile pictures, looked up once per person. */
const pictures = new Map<string, Promise<string | undefined>>();

function pictureOf(userId: string): Promise<string | undefined> {
  let found = pictures.get(userId);
  if (!found) {
    found = rootClient.users
      .getUserProfile(userId)
      .then((p) => (p.profilePictureUri ? rootClient.assets.toImageUrl(p.profilePictureUri, ImageUriResolution.Small) : undefined))
      .catch(() => undefined);
    pictures.set(userId, found);
  }
  return found;
}

/** A round avatar: their initial on a color of their own, swapped for their profile picture when there is one. */
export function avatar(userId: string, name: string, size = 32): HTMLElement {
  let hash = 0;
  for (const ch of userId) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  const el = h("span.avatar", { style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;background:hsl(${hue} 55% 42%)`, "aria-hidden": "true" }, (name.trim()[0] ?? "?").toUpperCase());
  if (!userId.startsWith("demo")) {
    void pictureOf(userId).then((url) => {
      if (!url) return;
      const img = h("img", { src: url, alt: "" });
      img.onload = () => el.replaceChildren(img);
    });
  }
  return el;
}

/** "in 5 minutes", "in 2 hours", "in 3 days". */
export function fromNow(at: number, now = Date.now()): string {
  const s = Math.max(0, (at - now) / 1000);
  if (s < 60) return "in under a minute";
  const unit = (n: number, one: string) => `in ${n} ${one}${n === 1 ? "" : "s"}`;
  if (s < 3600) return unit(Math.round(s / 60), "minute");
  if (s < 86_400 * 2) return unit(Math.round(s / 3600), "hour");
  return unit(Math.round(s / 86_400), "day");
}

/** "Mar 3, 2024". */
export function dateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
