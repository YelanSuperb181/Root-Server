// Console logging with a little structure. Root captures stdout/stderr from
// the Bot, so this is what you'll see in the developer log.

type Level = "info" | "warn" | "error";

export function log(level: Level, message: string, details?: Record<string, unknown>): void {
  const line = `[wisp] ${level.toUpperCase()} ${message}${details ? " " + JSON.stringify(details, bigintSafe) : ""}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function bigintSafe(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
