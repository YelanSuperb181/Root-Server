// Short-lived memory for answers that cost a scan of the store to work out
// and are fine a few seconds old (the leaderboards): everyone opening the
// menu meanwhile shares one answer instead of each re-reading every record.

export interface Remembered<T> {
  (): Promise<T>;
  /** Drops the remembered answer (after a change that should show at once). */
  forget(): void;
}

/** `work`, remembered for `ms`. A failure isn't remembered. */
export function remember<T>(ms: number, work: () => Promise<T>): Remembered<T> {
  let kept: { at: number; value: Promise<T> } | undefined;
  const get = (() => {
    if (!kept || Date.now() - kept.at > ms) {
      const value = work();
      kept = { at: Date.now(), value };
      value.catch(() => {
        if (kept?.value === value) kept = undefined;
      });
    }
    return kept.value;
  }) as Remembered<T>;
  get.forget = () => {
    kept = undefined;
  };
  return get;
}
