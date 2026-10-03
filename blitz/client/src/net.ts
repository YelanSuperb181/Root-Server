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
/** After a failed call, keywords only for this long before trying the server again. */
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

/** Blitz's server-side brain, when the page is inside Root. */
export function serverBrain(): Brain | undefined {
  if (!insideRoot()) return undefined;
  let downUntil = 0;
  return async (s) => {
    if (Date.now() < downUntil) return undefined;
    try {
      const res = await withTimeout(blitzDomainServiceClient.think({ text: s.text, asleep: s.asleep ?? false, open: s.open ?? false }), THINK_TIMEOUT_MS);
      return res.thought ? readThought({ mood: res.mood, trick: res.trick || "none", say: res.say }) : undefined;
    } catch {
      downUntil = Date.now() + RETRY_AFTER_MS;
      return undefined;
    }
  };
}
