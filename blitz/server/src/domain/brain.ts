// Blitz's brain on the server: asks Claude how Blitz reacts to a message.
// Returns undefined whenever Claude can't help (no API key, over the hourly
// budget, an error, a refusal), and the caller falls back to keywords.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { rootServer, GlobalSettings, GlobalSettingsEvent } from "@rootsdk/server-app";
import { CommunityFacts, Reaction, Situation, THOUGHT_SCHEMA, personaPrompt, readThought, situationPrompt } from "@blitz/shared";
import { config } from "../config";
import { errMessage, log } from "../core/log";

/** Where the key lives in Blitz's App settings (see root-manifest.json). */
const SETTINGS_GROUP = "brain";
const SETTINGS_KEY = "anthropicApiKey";

let persona = "";
let keyFromSettings: string | undefined;
let client: { key: string; api: Anthropic } | undefined;
const calls: number[] = [];

function readKey(settings: GlobalSettings | undefined): string | undefined {
  const value = settings?.[SETTINGS_GROUP]?.[SETTINGS_KEY];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Sets Blitz's persona and starts watching the App settings for the API key. */
export function initBrain(facts: CommunityFacts, settings: GlobalSettings | undefined): void {
  persona = personaPrompt(facts);
  keyFromSettings = readKey(settings);
  rootServer.globalSettings?.on(GlobalSettingsEvent.Update, (evt) => {
    keyFromSettings = readKey(evt.current);
    log("info", keyFromSettings ? "Blitz's brain has an API key" : "Blitz's brain has no API key; using keywords");
  });
  log("info", brainReady() ? `Blitz's brain is on (${config.brain.model})` : "Blitz's brain has no API key; using keywords");
}

/** What Blitz knows about the community changed (channels, its "About" setting): rebuild the persona. */
export function refreshFacts(facts: CommunityFacts): void {
  persona = personaPrompt(facts);
}

/** While developing: ANTHROPIC_API_KEY from the environment, or from server/.env next to DEV_TOKEN. */
function keyFromEnvironment(): string | undefined {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  for (const file of [join(process.cwd(), ".env"), join(process.cwd(), "server", ".env")]) {
    try {
      const line = readFileSync(file, "utf8")
        .split(/\r?\n/)
        .find((l) => l.trim().startsWith("ANTHROPIC_API_KEY="));
      const value = line?.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
      if (value) return value;
    } catch {
      // No .env there; that's normal once Blitz runs in Root's cloud.
    }
  }
  return undefined;
}

let envKey: string | undefined | null = null;

function api(): Anthropic | undefined {
  if (envKey === null) envKey = keyFromEnvironment();
  const key = keyFromSettings ?? envKey;
  if (!config.brain.enabled || !key) return undefined;
  if (client?.key !== key) {
    client = { key, api: new Anthropic({ apiKey: key, maxRetries: 1, timeout: config.brain.timeoutSeconds * 1000 }) };
  }
  return client.api;
}

export function brainReady(): boolean {
  return persona !== "" && api() !== undefined;
}

function withinBudget(): boolean {
  const now = Date.now();
  while (calls.length > 0 && now - calls[0] > 3_600_000) calls.shift();
  if (calls.length >= config.brain.maxPerHour) return false;
  calls.push(now);
  return true;
}

/**
 * Claude for Blitz's other jobs (moderation help, catch-ups, Ask Blitz),
 * sharing the same hourly budget. Undefined without a key or over budget.
 */
export function claudeFor(job: string): Anthropic | undefined {
  const claude = api();
  if (!claude) return undefined;
  if (!withinBudget()) {
    log("warn", `Blitz's brain hit its hourly limit; skipped ${job}`, { maxPerHour: config.brain.maxPerHour });
    return undefined;
  }
  return claude;
}

/** What Claude said, as text (refusals and empty answers come back as undefined). */
export function textOf(response: { content: Array<{ type: string; text?: string }>; stop_reason: string | null }): string | undefined {
  if (response.stop_reason === "refusal") return undefined;
  const text = response.content.flatMap((b) => (b.type === "text" && b.text ? [b.text] : [])).join("").trim();
  return text || undefined;
}

/** How Blitz reacts to this message, according to Claude. Undefined: use keywords. */
export async function think(situation: Situation): Promise<Reaction | undefined> {
  const claude = api();
  if (!claude || !persona) return undefined;
  if (!withinBudget()) {
    log("warn", "Blitz's brain hit its hourly limit; using keywords", { maxPerHour: config.brain.maxPerHour });
    return undefined;
  }
  try {
    const response = await claude.beta.messages.create({
      model: config.brain.model,
      max_tokens: 4000,
      // If Claude declines, the API retries on the model Anthropic recommends for that case.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: config.brain.effort, format: { type: "json_schema", schema: THOUGHT_SCHEMA } },
      system: [{ type: "text", text: persona, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: situationPrompt(situation) }],
    });
    if (response.stop_reason === "refusal") {
      log("info", "Claude declined a message for Blitz; using keywords");
      return undefined;
    }
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    return readThought(JSON.parse(text));
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) log("warn", "Claude rejected Blitz's API key; check Blitz's App settings");
    else if (err instanceof Anthropic.RateLimitError) log("warn", "Claude is rate limiting Blitz; using keywords for now");
    else if (err instanceof Anthropic.APIError) log("warn", "Claude API error; using keywords", { status: err.status, error: err.message });
    else log("warn", "couldn't read Claude's answer; using keywords", { error: errMessage(err) });
    return undefined;
  }
}
