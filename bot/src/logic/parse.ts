// Parsers for command input. Pure, so every edge case is unit tested.

export interface ParsedCommand {
  /** Lower-cased command name without the prefix. */
  name: string;
  /** Whitespace-separated arguments. */
  args: string[];
  /** Everything after the command name, trimmed, with line breaks kept. */
  rest: string;
}

/** "!poll  Best snack? | chips" -> { name: "poll", args: [...], rest: "Best snack? | chips" } */
export function parseCommand(content: string, prefix: string): ParsedCommand | undefined {
  const text = content.trimStart();
  if (!text.startsWith(prefix)) return undefined;
  const body = text.slice(prefix.length);
  const match = /^([a-z0-9][a-z0-9-]*)(?:\s+([\s\S]*))?$/i.exec(body);
  if (!match) return undefined;
  const rest = (match[2] ?? "").trim();
  return {
    name: match[1].toLowerCase(),
    args: rest.length > 0 ? rest.split(/\s+/) : [],
    rest,
  };
}

const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** "90m", "2h", "1d12h", "1w" -> milliseconds. Undefined when not a duration. */
export function parseDuration(input: string): number | undefined {
  const text = input.trim().toLowerCase();
  if (!/^(\d+[smhdw])+$/.test(text)) return undefined;
  let total = 0;
  for (const [, amount, unit] of text.matchAll(/(\d+)([smhdw])/g)) {
    total += Number(amount) * UNIT_MS[unit];
  }
  return total > 0 ? total : undefined;
}

/** 5400000 -> "1h 30m". */
export function formatDuration(ms: number): string {
  const parts: string[] = [];
  let left = Math.max(0, Math.round(ms / 1000));
  for (const [unit, size] of [
    ["d", 86_400],
    ["h", 3_600],
    ["m", 60],
    ["s", 1],
  ] as const) {
    const n = Math.floor(left / size);
    if (n > 0) parts.push(`${n}${unit}`);
    left -= n * size;
  }
  return parts.slice(0, 2).join(" ") || "0s";
}

export interface DiceRoll {
  count: number;
  sides: number;
  modifier: number;
}

/** "d20", "2d6", "3d8+2", "d100-5". Defaults to 1d6 when empty. */
export function parseDice(input: string): DiceRoll | undefined {
  const text = input.trim().toLowerCase();
  if (text === "") return { count: 1, sides: 6, modifier: 0 };
  const m = /^(\d*)d(\d+)([+-]\d+)?$/.exec(text);
  if (!m) {
    // A bare number means "roll 1..n".
    if (/^\d+$/.test(text)) {
      const sides = Number(text);
      return sides >= 2 && sides <= 1000 ? { count: 1, sides, modifier: 0 } : undefined;
    }
    return undefined;
  }
  const count = m[1] === "" ? 1 : Number(m[1]);
  const sides = Number(m[2]);
  const modifier = m[3] ? Number(m[3]) : 0;
  if (count < 1 || count > 20 || sides < 2 || sides > 1000 || Math.abs(modifier) > 1000) return undefined;
  return { count, sides, modifier };
}

/** "pizza | tacos | sushi", "pizza, tacos", "pizza or tacos" -> options. */
export function parseChoices(input: string): string[] {
  const text = input.trim();
  const separator = text.includes("|") ? /\s*\|\s*/ : text.includes(",") ? /\s*,\s*/ : /\s+or\s+/i;
  return text
    .split(separator)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface PollInput {
  durationMs?: number;
  question: string;
  /** Empty means a yes/no poll. */
  options: string[];
}

/** "[duration] Question? | option | option ..." (0 or 2-10 options). */
export function parsePoll(input: string): PollInput | string {
  let text = input.trim();
  let durationMs: number | undefined;
  const first = text.split(/\s+/)[0] ?? "";
  const asDuration = parseDuration(first);
  if (asDuration !== undefined) {
    durationMs = asDuration;
    text = text.slice(first.length).trim();
  }
  const parts = text
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const [question, ...options] = parts;
  if (!question) return "Give the poll a question, like `!poll 1h Pizza or tacos? | Pizza | Tacos`.";
  if (options.length === 1) return "A poll needs at least 2 options (or none for a yes/no poll).";
  if (options.length > 10) return "A poll can have at most 10 options.";
  if (durationMs !== undefined && (durationMs < 60_000 || durationMs > 30 * 86_400_000)) {
    return "Poll length must be between 1 minute and 30 days.";
  }
  return { durationMs, question, options };
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface MonthDay {
  month: number; // 1-12
  day: number; // 1-31
}

function monthFromName(name: string): number | undefined {
  const lower = name.toLowerCase().replace(/\.$/, "");
  if (lower.length < 3) return undefined;
  const index = MONTHS.findIndex((m) => m.startsWith(lower));
  return index >= 0 ? index + 1 : undefined;
}

/**
 * Birthdays: "07-14", "7-14" (month-day), "July 14", "Jul 14th", "14 July".
 * Slash dates are rejected on purpose: 03/04 means different days around the world.
 */
export function parseMonthDay(input: string): MonthDay | undefined {
  const text = input.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  let month: number | undefined;
  let day: number | undefined;

  let m = /^(\d{1,2})-(\d{1,2})$/.exec(text);
  if (m) {
    month = Number(m[1]);
    day = Number(m[2]);
  } else if ((m = /^([a-z.]+) (\d{1,2})(?:st|nd|rd|th)?$/.exec(text))) {
    month = monthFromName(m[1]);
    day = Number(m[2]);
  } else if ((m = /^(\d{1,2})(?:st|nd|rd|th)? (?:of )?([a-z.]+)$/.exec(text))) {
    month = monthFromName(m[2]);
    day = Number(m[1]);
  }

  if (month === undefined || day === undefined) return undefined;
  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) return undefined;
  return { month, day };
}

export function formatMonthDay({ month, day }: MonthDay): string {
  const name = MONTHS[month - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${day}`;
}
