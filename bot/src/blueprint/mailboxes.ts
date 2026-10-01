// Each person's mailbox channel in "Bitch Mailing Service". The real list
// names people and the repository is public, so it lives in
// mailboxes.local.ts, which git never uploads. To set it up, copy
// mailboxes.local.example.ts to mailboxes.local.ts and fill it in. Without
// it, setup creates only #to-all-bitches in that category.

import type { ChannelSpec } from "./types";

function loadLocal(): ChannelSpec[] {
  try {
    return (require("./mailboxes.local") as { mailboxes: ChannelSpec[] }).mailboxes;
  } catch (err) {
    const missing = (err as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND" && String((err as Error).message).includes("mailboxes.local");
    if (missing) return [];
    throw err;
  }
}

export const mailboxes: readonly ChannelSpec[] = loadLocal();
