// Claude inside the claude.ai artifact viewer. When the domain runs there
// (the browser prototype) and the viewer is the page's creator, Blitz can
// think with their Claude through the page's `sample` capability: they're
// asked once before the first message, and every call spends their own
// Claude usage. Anyone else the page is shared with, and anywhere outside
// the viewer, gets Blitz's keyword reactions and never sees Claude's prompt.

import { CommunityFacts, MOODS, REACTION_EMOJI, TRICKS, personaPrompt, readThought, situationPrompt } from "@blitz/shared";
import type { Brain } from "./domain";

interface Sample {
  json(input: string, options?: { modelTier?: "quick" | "default" | "complex"; cache?: boolean }): Promise<unknown>;
}

interface Viewer {
  isOwner(): Promise<boolean>;
}

declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
  }
}

const FACTS: CommunityFacts = { name: "this community", prefix: "!", groups: [], commands: [] };

/** Codes after which asking again is pointless for the rest of the visit. */
const FOR_GOOD = ["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"];

export async function viewerBrain(): Promise<Brain | undefined> {
  if (!window.claude?.use) return undefined;
  const viewer = (await window.claude.use("user").catch(() => null)) as Viewer | null;
  if (!(await viewer?.isOwner().catch(() => false))) return undefined;
  const sample = (await window.claude.use("sample").catch(() => null)) as Sample | null;
  if (!sample) return undefined;
  const persona = personaPrompt(FACTS);
  const format = `Answer with only one JSON object with these fields: "mood" (one of ${MOODS.join(", ")}), "trick" (one of ${Object.keys(TRICKS).join(", ")}, none), "say", "reply", and "emoji" (one of ${Object.keys(REACTION_EMOJI).join(", ")}).`;
  let off = false;
  return async (situation) => {
    if (off) return undefined;
    try {
      const raw = await sample.json(`${persona}\n\n${situationPrompt(situation)}\n\n${format}`, { modelTier: "quick", cache: false });
      return readThought(raw);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code && FOR_GOOD.includes(code)) off = true;
      return undefined;
    }
  };
}
