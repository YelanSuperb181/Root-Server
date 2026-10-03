// The domain's one line to Blitz's server. Each window runs its own Blitz
// entirely by itself; the only thing it ever asks the server for is a thought:
// what Blitz makes of something typed to it, worked out with Claude using the
// community's API key (which never leaves the server). Outside Root there's no
// server, and Blitz reads the mood from keywords instead.

import { rootClient } from "@rootsdk/client-app";
import { blitzDomainServiceClient } from "@blitz/gen-client";
import { readThought } from "@blitz/shared";
import type { Brain } from "./domain";

/** Claude gets 20 s on the server; past this the window stops waiting. */
const THINK_TIMEOUT_MS = 25_000;
/** How long the quick "are you there?" check may take. */
const CHECK_TIMEOUT_MS = 5000;
/** While the server can't be reached, keywords only; it's checked again this often. */
const RETRY_AFTER_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Whether this page is running inside Root (rather than a plain browser). */
export function insideRoot(): boolean {
  try {
    return rootClient.users.getCurrentUserId() !== "";
  } catch {
    return false;
  }
}

/**
 * Blitz's server-side brain, when the page is inside Root. It checks right
 * away that the server answers (an empty message, which the server turns
 * down instantly), so if it can't be reached Blitz reacts from keywords at
 * once instead of pondering until a long timeout.
 */
export function serverBrain(): Brain | undefined {
  if (!insideRoot()) return undefined;
  const svc = blitzDomainServiceClient;
  const check = () => withTimeout(svc.think({ text: "", asleep: false, open: false }), CHECK_TIMEOUT_MS).then(() => true, () => false);
  let reachable = check();
  let checkedAt = Date.now();
  const down = () => {
    reachable = Promise.resolve(false);
    checkedAt = Date.now();
  };
  return async (s) => {
    if (!(await reachable)) {
      if (Date.now() - checkedAt < RETRY_AFTER_MS) return undefined;
      checkedAt = Date.now();
      reachable = check();
      if (!(await reachable)) return undefined;
    }
    try {
      const res = await withTimeout(svc.think({ text: s.text, asleep: s.asleep ?? false, open: s.open ?? false }), THINK_TIMEOUT_MS);
      return res.thought ? readThought({ mood: res.mood, trick: res.trick || "none", say: res.say }) : undefined;
    } catch {
      down();
      return undefined;
    }
  };
}
