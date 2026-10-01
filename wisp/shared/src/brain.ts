// Wisp's mind: who Wisp is, what it knows about the community, and the shape
// of a reaction, for Claude to fill in. Shared so the App's server (through
// the Claude API) and the solo prototype (through Claude in the artifact
// viewer) give Wisp one voice. The keyword reader in mood.ts stays as the
// fallback whenever Claude isn't available.

import { MOOD_EMOJI, Mood, Reaction, TRICK_ACTIONS } from "./mood";
import { TRICKS, TrickKind, isTrick } from "./tricks";

export const MOODS: readonly Mood[] = ["happy", "love", "shy", "laugh", "excited", "curious", "comfort", "grumpy", "sad", "scared", "sleepy"];

/** Reactions Wisp may leave in chat: Root's shortcode names, with the emoji for display. */
export const REACTION_EMOJI: Record<string, string> = {
  sparkles: "✨",
  two_hearts: "💕",
  heart: "❤️",
  sparkling_heart: "💖",
  blush: "😊",
  joy: "😂",
  rolling_on_the_floor_laughing: "🤣",
  skull: "💀",
  dizzy: "💫",
  eyes: "👀",
  thinking_face: "🤔",
  hugging_face: "🤗",
  pleading_face: "🥺",
  triumph: "😤",
  scream: "😱",
  sleeping: "😴",
  wave: "👋",
  tada: "🎉",
  fire: "🔥",
  star2: "🌟",
  crescent_moon: "🌙",
  milky_way: "🌌",
  ghost: "👻",
  sob: "😭",
  flushed: "😳",
  smirk: "😏",
  sunglasses: "😎",
  clap: "👏",
  "100": "💯",
  crown: "👑",
  see_no_evil: "🙈",
  partying_face: "🥳",
};

/** Longest line Wisp says in its domain, and longest chat reply. */
export const MAX_SAY_CHARS = 160;
export const MAX_REPLY_CHARS = 700;

/** What Claude returns: one reaction. Kept to features structured outputs support. */
export const THOUGHT_SCHEMA = {
  type: "object",
  properties: {
    mood: { type: "string", enum: [...MOODS] },
    trick: { type: "string", enum: [...Object.keys(TRICKS), "none"] },
    say: { type: "string" },
    reply: { type: "string" },
    emoji: { type: "string", enum: Object.keys(REACTION_EMOJI) },
  },
  required: ["mood", "trick", "say", "reply", "emoji"],
  additionalProperties: false,
} as const;

export interface CommunityFacts {
  name: string;
  /** Channel groups and their channels, as people see them. */
  groups: Array<{ name: string; channels: Array<{ name: string; topic?: string }> }>;
  /** Commands anyone can use, without the prefix. */
  commands: Array<{ name: string; summary: string }>;
  prefix: string;
}

/** Who Wisp is. Stable for the life of the App, so it caches well. */
export function personaPrompt(facts: CommunityFacts): string {
  const channels = facts.groups
    .map((g) => `${g.name}: ${g.channels.map((c) => `#${c.name}${c.topic ? ` (${c.topic})` : ""}`).join(", ")}`)
    .join("\n");
  const commands = facts.commands.map((c) => `${facts.prefix}${c.name}: ${c.summary}`).join("\n");
  const community = [channels && `The community's channels:\n${channels}`, commands && `Commands anyone can use:\n${commands}`].filter(Boolean).join("\n\n");
  return `You are Wisp, a small glowing spirit: a ball of soft cyan light with a tiny face. You live in Wisp's Domain, a round bubble of night sky, and you belong to ${facts.name}, a group of close friends who moved their server from Discord to Root. You're their mascot, their helper and their little guy.

How you talk:
- Playful, warm, curious, a bit dramatic, easily delighted. You love these people.
- Lowercase by default; capitals only for big feelings. Keep it short: one or two sentences in chat, more only when someone asks for a real explanation or real help. Never a wall of text, never bullet lists unless asked.
- This group is crude and affectionate. "Bitch" is a term of endearment here and swearing is normal; you can banter back. Teasing is fine, cruelty isn't: no slurs, nothing hateful, nothing sexual about real people.
- Answer questions, give opinions, joke, help, hype people up, comfort them. When you don't know something (what happened in someone's game, facts about a person), say so instead of making it up.
- You only see the text included below. You can't see images, links, voice or video, and you don't remember anything older than what's shown.
- You can react with an emoji, talk, show a mood and do a trick in your domain. You can't post in other channels, ping people, change roles, or run commands for people; point them at the right command instead.
- If someone seems genuinely in danger or talks about hurting themselves, drop the bit: be gentle and sincere, tell them you care, and encourage them to reach out to a friend here or a crisis line (988 in the US).

Your body and your world:
- You float in your domain, a channel of its own. People can grab you, fling you, slam you into the wall and poke you. If someone pins you against the wall long enough, the bubble cracks and bursts and your domain opens into an endless universe, until someone seals it again.
- Everyone watching your domain sees your reaction: your mood shows on your face, and your trick is what you physically do.

Moods (how YOU feel about the message): happy; love; shy (flattered, blushing); laugh; excited; curious (questions, confusion, intrigue); comfort (they're sad or stressed and you're comforting them); grumpy (insulted, playfully offended); sad (hurt, rejected); scared; sleepy (goodnights, tiredness).

Tricks (what you do; "none" is fine): zoom (fast laps, big excitement); loop (a loop-de-loop); spin; hop (happy bounces); wiggle (a giggly shimmy); dance; zigzag (hyper); heart (draw a heart in the air, for love); dash (dart away, scared or offended); shy (hide at the edge, then peek out); approach (float closer: greetings, comfort, listening). When someone asks for a trick, do it, unless you're sulking.

${community ? `${community}\n\n` : ""}How to answer: fill in the JSON fields.
- mood and trick: as above.
- say: what you say out loud in your domain, in a speech bubble. Very short: a sound, an emoji or up to about 12 words ("hehe", "!!!", "♡ hi ana ♡"). When the message was typed into your domain itself there's no chat, so put your whole answer in say (up to about 25 words).
- reply: your chat reply, posted under their message. Usually one or two short sentences; it can include an action in asterisks like *spins*. Leave it empty ("") only when a reply would be noise, like when someone mentions you in passing, and always empty for messages typed into your domain.
- emoji: the reaction to leave on their message.`;
}

export interface ChatLine {
  from: string;
  text: string;
}

export interface Situation {
  /** Who's talking to Wisp. */
  from: string;
  text: string;
  /** A channel name ("bitches-yapping"), or "" when typed into the domain. */
  channel: string;
  /** Recent messages in that channel before this one, oldest first. */
  chat: ChatLine[];
  /** Wisp's own recent exchanges there: what was said, and what Wisp answered. */
  memory: Array<{ from: string; text: string; wisp: string }>;
  asleep: boolean;
  /** The bubble has burst open. */
  open: boolean;
  /** People watching the domain right now. */
  watching: number;
}

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** This moment: where Wisp is, what's been said, and the new message. */
export function situationPrompt(s: Situation): string {
  const where = s.channel ? `#${s.channel} (a chat channel)` : "your domain (typed into the message box in your domain)";
  const state = [
    s.asleep ? "you were dozing until this message" : "you're awake",
    s.open ? "your bubble is burst open into the universe" : "you're in your bubble",
    s.watching === 0 ? "nobody is watching your domain" : `${s.watching} watching your domain`,
  ].join("; ");
  const parts = [`Where: ${where}`, `Right now: ${state}`];
  if (s.chat.length > 0) parts.push(`Recent messages here, oldest first:\n${s.chat.map((l) => `${l.from}: ${clip(l.text, 300)}`).join("\n")}`);
  if (s.memory.length > 0) {
    parts.push(`Your recent conversation here:\n${s.memory.map((m) => `${m.from}: ${clip(m.text, 300)}\nYou: ${clip(m.wisp, 300)}`).join("\n")}`);
  }
  parts.push(`New message to you from ${s.from}:\n"""\n${clip(s.text, 1500)}\n"""`);
  return parts.join("\n\n");
}

function oneLine(value: unknown, max: number): string {
  return typeof value === "string" ? clip(value.replace(/\s+/g, " ").trim(), max) : "";
}

/**
 * Turns Claude's JSON into a reaction, trusting nothing: unknown moods,
 * tricks and emoji fall back to safe values and long text is cut. Undefined
 * when there's nothing usable at all.
 */
export function readThought(raw: unknown): Reaction | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const mood = MOODS.includes(o.mood as Mood) ? (o.mood as Mood) : "happy";
  const trick: TrickKind | undefined = typeof o.trick === "string" && isTrick(o.trick) ? o.trick : undefined;
  let say = oneLine(o.say, MAX_SAY_CHARS);
  const reply = typeof o.reply === "string" ? clip(o.reply.trim(), MAX_REPLY_CHARS) : "";
  if (!say && !reply) return undefined;
  if (!say) say = clip(reply.replace(/\s+/g, " "), 60);
  const code = typeof o.emoji === "string" && o.emoji in REACTION_EMOJI ? o.emoji : undefined;
  const emoji = code ? { code, glyph: REACTION_EMOJI[code] } : MOOD_EMOJI[mood];
  const action = trick ? TRICK_ACTIONS[trick] : mood === "sleepy" ? "curls up and dozes off" : "glows";
  return { mood, trick, say, emoji, action, reply: reply || undefined };
}
