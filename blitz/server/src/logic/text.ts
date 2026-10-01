// Message formatting helpers. Pure: no SDK runtime imports, so tests can
// cover them without a Root connection.

/** Root messages allow 10,001 characters; stay safely under. */
export const MAX_MESSAGE = 9500;

/** Push notifications are cut off by Root past these lengths. */
export const MAX_NOTIFY_TITLE = 50;
export const MAX_NOTIFY_BODY = 150;

/** Channel descriptions; Root shows short topics best. */
export const MAX_TOPIC = 250;

export function userMention(name: string, userId: string): string {
  return `[@${linkText(name)}](root://user/${userId})`;
}

export function roleMention(name: string, roleId: string): string {
  return `[@${linkText(name)}](root://role/${roleId})`;
}

export function channelMention(name: string, channelId: string): string {
  return `[#${linkText(name)}](root://channel/${channelId})`;
}

function linkText(text: string): string {
  return text.replace(/[[\]]/g, "");
}

const USER_MENTION = /\[@[^\]]*\]\(root:\/\/user\/([^)\s]+)\)/g;
const ROLE_MENTION = /\[@[^\]]*\]\(root:\/\/role\/([^)\s]+)\)/g;
const CHANNEL_MENTION = /\[#[^\]]*\]\(root:\/\/channel\/([^)\s]+)\)/g;

export function mentionedUserIds(text: string): string[] {
  return [...text.matchAll(USER_MENTION)].map((m) => m[1]);
}

export function mentionedRoleIds(text: string): string[] {
  return [...text.matchAll(ROLE_MENTION)].map((m) => m[1]);
}

export function mentionedChannelIds(text: string): string[] {
  return [...text.matchAll(CHANNEL_MENTION)].map((m) => m[1]);
}

/** Turns mention links into plain text, so re-posted text never pings anyone. */
export function defuseMentions(text: string): string {
  return text.replace(/\[([^\]]*)\]\(root:\/\/[^)\s]*\)/g, "$1");
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** Prefixes every line with "> " so the text renders as a quote block. */
export function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

/**
 * Fills {placeholders} in templates. Keys are case-insensitive; unknown
 * placeholders are left exactly as typed.
 */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) lower[k.toLowerCase()] = v;
  return template.replace(/\{([a-z0-9_.-]+)\}/gi, (whole, key: string) => lower[key.toLowerCase()] ?? whole);
}

/** "▰▰▰▰▱▱▱▱▱▱" for a 0..1 fraction. */
export function progressBar(fraction: number, width = 10): string {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const filled = Math.round(clamped * width);
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

/** Medal for leaderboard places 1-3, otherwise "#n". */
export function placeLabel(place: number): string {
  return ["🥇", "🥈", "🥉"][place - 1] ?? `**#${place}**`;
}

/**
 * Root channel names are 1-100 letters, digits and hyphens, with no leading,
 * trailing or doubled hyphens. Undefined when nothing usable is left.
 */
export function sanitizeChannelName(input: string, max = 100): string | undefined {
  const name = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .slice(0, max)
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return name || undefined;
}

/** Loose name comparison: case, spacing, emoji and punctuation don't matter. */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) => (sanitizeChannelName(s.toLowerCase()) ?? s.trim().toLowerCase());
  return norm(a) === norm(b);
}

/** Picks a random element; `random` is injectable for tests. */
export function pick<T>(items: readonly T[], random: () => number = Math.random): T {
  if (items.length === 0) throw new Error("pick() needs at least one item");
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}
