// Claude inside the claude.ai artifact viewer. When the domain runs there
// (the browser prototype), Wisp can think with the viewer's own Claude
// through the page's `sample` capability: the viewer is asked once before
// the first message, and every call spends their own Claude usage. Anywhere
// else this finds nothing and Wisp sticks to keywords.

import { CommunityFacts, MOODS, REACTION_EMOJI, TRICKS, personaPrompt, readThought, situationPrompt } from "@wisp/shared";
import type { SoloBrain } from "./domain";

interface Sample {
  json(input: string, options?: { modelTier?: "quick" | "default" | "complex"; cache?: boolean }): Promise<unknown>;
}

declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
  }
}

const FACTS: CommunityFacts = { name: "Bich ass bitchess", prefix: "!", groups: [], commands: [] };

/** Codes after which asking again is pointless for the rest of the visit. */
const FOR_GOOD = ["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"];

export async function viewerBrain(): Promise<SoloBrain | undefined> {
  if (!window.claude?.use) return undefined;
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
