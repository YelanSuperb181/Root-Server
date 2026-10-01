// Copy this file to mailboxes.local.ts (git ignores that name, so the names
// stay off GitHub) and list one mailbox per person. Keys must be unique and
// start with "mail-"; names can only use letters, digits and single hyphens.
// Use the exact channel names from Discord so an imported template matches.

import type { ChannelSpec } from "./types";

export const mailboxes: ChannelSpec[] = [
  { key: "mail-alex", name: "alex-the-example", type: "text", topic: "📮 Alex's mailbox." },
  { key: "mail-sam", name: "sam-the-other-example", type: "text", topic: "🌻 Sam's mailbox." },
];
