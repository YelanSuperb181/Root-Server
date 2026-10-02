// Who may use Blitz: the lock compares a community's owner with the owners
// Blitz was packaged for. Root writes the same ID two ways (22 characters of
// URL-safe base64, or a UUID), so IDs are compared by their bytes.

/** A Root ID's 16 bytes as hex, whichever way it's written; undefined if it isn't one. */
export function rootIdHex(id: string): string | undefined {
  const s = id.trim();
  if (/^[A-Za-z0-9_-]{22}$/.test(s)) {
    const bytes = Buffer.from(s, "base64url");
    return bytes.length === 16 ? bytes.toString("hex") : undefined;
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return s.replace(/-/g, "").toLowerCase();
  return undefined;
}

/** Whether a community owned by `owner` may use Blitz. */
export function ownerAllowed(owner: string | undefined, allowed: readonly string[]): boolean {
  const mine = owner ? rootIdHex(owner) : undefined;
  return mine !== undefined && allowed.some((id) => rootIdHex(id) === mine);
}
