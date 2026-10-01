// Typed access to the Bot's key-value store (a private SQLite file per
// community). Keys are namespaced "area:id". Patterns use SQL LIKE, where
// "_" is a wildcard, so key prefixes here never contain underscores.

import { rootServer } from "@rootsdk/server-bot";

export const kv = {
  get<T>(key: string): Promise<T | undefined> {
    return rootServer.dataStore.appData.get<T>(key);
  },

  set<T>(key: string, value: T): Promise<void> {
    return rootServer.dataStore.appData.set<T>({ key, value });
  },

  /** Atomic read-modify-write (runs in a transaction). */
  update<T>(key: string, change: (current: T) => T, initial: T): Promise<T> {
    return rootServer.dataStore.appData.update<T>(key, change, initial);
  },

  delete(key: string): Promise<void> {
    return rootServer.dataStore.appData.delete(key);
  },

  /** All entries whose key starts with `prefix`. */
  async entries<T>(prefix: string): Promise<Array<{ key: string; value: T }>> {
    const rows = await rootServer.dataStore.appData.select<T>(`${escapeLike(prefix)}%`);
    return rows.map((r) => ({ key: r.key, value: r.value }));
  },

  /** Next value of a counter, starting at 1. */
  next(counter: string): Promise<number> {
    return rootServer.dataStore.appData.update<number>(counter, (n) => n + 1, 0);
  },
};

function escapeLike(prefix: string): string {
  if (/[%_]/.test(prefix)) throw new Error(`Store prefix "${prefix}" can't contain % or _`);
  return prefix;
}
