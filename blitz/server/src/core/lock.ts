// Runs async work one at a time per key, so two reactions on the same
// message (say) can't race each other into a double post.

const tails = new Map<string, Promise<unknown>>();

export function serialize<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  tails.set(key, next);
  // Tidy up either way. (Not .finally(): that hands back a promise that fails
  // when the work does, and with nobody waiting on it, Node would stop the
  // whole server over an ordinary "you can't afford that".)
  const tidy = () => {
    if (tails.get(key) === next) tails.delete(key);
  };
  next.then(tidy, tidy);
  return next;
}
