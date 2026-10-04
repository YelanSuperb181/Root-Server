// Blitz's wits: real answers without an AI brain. Plain pattern matching
// over what Blitz already knows about the community (its channels and their
// topics, the community's own commands, roles, levels and Stardust), so
// "where do I post my art?" gets "#art!", "what are the rules?" gets the
// rules, and "remind me in 2h to stretch" actually sets a reminder. Nothing
// leaves Root. The server uses it whenever Blitz has no brain (or the brain
// can't answer); the browser preview uses it with its made-up community.

import { MOOD_EMOJI, Mood, Reaction, TRICK_ACTIONS, cleanForReading, readMessage } from "./mood";
import { TrickKind } from "./tricks";

export interface WitsChannel {
  name: string;
  topic?: string;
  /** How to point at it in chat (a channel link); in Blitz's speech bubble it's "#name". */
  mention: string;
}

/** What Blitz knows when someone talks to it. Everything is optional except the basics. */
export interface WitsKnowledge {
  /** Blitz's own name. */
  botName: string;
  prefix: string;
  community: string;
  about?: string;
  members?: number;
  /** The text channels people can see (not private ones, not logs). */
  channels: WitsChannel[];
  /** Commands the asker can use. */
  commands: Array<{ name: string; aliases: string[]; summary: string; usage?: string }>;
  /** The community's own commands (rules, FAQs, links). */
  customs: Array<{ name: string; response: string }>;
  /** Roles people can give themselves. */
  selfRoles: string[];
  levelRewards: Array<{ level: number; role: string }>;
  /** The asker's level, when levels are on. */
  levels?: { level: number; xp: number; into: number; needed: number; place: number; how: string };
  /** The leaderboard's top names, best first. */
  top?: string[];
  /** The asker's Stardust, when it's on. */
  stardust?: { balance: number; streak: number; dailyReady: boolean };
  /** What's switched on in this community. */
  on: { inbox: boolean; birthdays: boolean; suggestions: boolean };
  /** Who's asking (their nickname). */
  asker: string;
  /** In a chat channel, or typed into Blitz's domain (where there's no channel to post in). */
  where: "chat" | "domain";
  now: number;
}

/** What Blitz last answered for someone, for follow-ups like "and music?". */
export interface WitsMemory {
  intent: string;
  topic?: string;
  at: number;
}

export interface WitsAnswer extends Reaction {
  /** What Blitz understood (for follow-ups, logs and tests). */
  intent: string;
  topic?: string;
  /** A real answer to something asked, worth replying to promptly; otherwise chatter. */
  answer: boolean;
  /** A command to run as the asker; its reply is Blitz's answer. */
  run?: { command: string; args: string };
  /** The reply always exists for wits (empty only for chatter Blitz shouldn't post). */
  reply: string;
}

// ---- Words ---------------------------------------------------------------------------

const STOP = new Set(
  "a an the i im i'm me my mine you your yours u ur we our us it its it's is are am was were be been being do does did doing to of for in on at by with about from into onto up out and or but so if then than that this these those there here what whats what's where wheres where's which who whos who's whom why how when can could would should will shall may might must have has had get got gonna wanna want need please pls plz thanks thank hey hi hello yo oh ok okay just really very some any much many more most also too like kinda sorta lol channel channels chat chats room place one ones thing things stuff".split(
    " ",
  ),
);

/** Words that mean the same kind of thing, so "drawings" finds #art and "vc" finds #voice. */
const CONCEPTS: Record<string, string[]> = {
  art: ["art", "arts", "artwork", "artworks", "artist", "artists", "draw", "drawing", "drawings", "doodle", "doodles", "sketch", "sketches", "paint", "painting", "paintings", "fanart", "illustration", "illustrations", "creation", "creations", "showcase", "gallery", "oc", "ocs", "design", "designs", "commission", "commissions"],
  music: ["music", "song", "songs", "tune", "tunes", "playlist", "playlists", "spotify", "beat", "beats", "band", "bands", "sing", "singing", "cover", "covers", "audio", "album", "albums"],
  gaming: ["game", "games", "gaming", "gamer", "gamers", "play", "playing", "lfg", "minecraft", "fortnite", "valorant", "roblox", "overwatch", "league", "steam", "xbox", "playstation", "switch", "nintendo", "console"],
  memes: ["meme", "memes", "shitpost", "shitposting", "funny", "joke", "jokes", "humor", "humour"],
  pets: ["pet", "pets", "cat", "cats", "dog", "dogs", "animal", "animals", "puppy", "puppies", "kitten", "kittens"],
  photos: ["photo", "photos", "pic", "pics", "picture", "pictures", "selfie", "selfies", "irl", "photography"],
  food: ["food", "foods", "cook", "cooking", "recipe", "recipes", "bake", "baking", "snack", "snacks", "eat", "eating"],
  intro: ["intro", "intros", "introduce", "introduction", "introductions", "introducing", "newcomer", "newcomers", "welcome", "meet"],
  help: ["help", "support", "question", "questions", "ask", "asking", "problem", "problems", "issue", "issues", "bug", "bugs", "stuck", "troubleshoot", "troubleshooting"],
  ideas: ["idea", "ideas", "suggest", "suggestion", "suggestions", "feedback"],
  news: ["announcement", "announcements", "news", "update", "updates", "changelog"],
  events: ["event", "events", "movie", "movies", "tournament", "tournaments", "calendar", "schedule"],
  tech: ["code", "coding", "programming", "programmer", "dev", "development", "developer", "tech", "computer", "computers", "software"],
  anime: ["anime", "manga", "weeb"],
  books: ["book", "books", "reading", "writing", "write", "writer", "story", "stories", "poetry", "poem", "poems", "fic", "fanfic", "fanfiction"],
  general: ["general", "chat", "chatting", "talk", "talking", "offtopic", "random", "lounge", "hangout", "main", "casual"],
  vent: ["vent", "venting", "rant", "ranting", "feelings", "mental"],
  promo: ["promo", "promotion", "promote", "advertise", "advertising", "ad", "ads", "selfpromo", "socials", "youtube", "twitch", "stream", "streams", "streaming", "content"],
  rules: ["rules", "rule", "guidelines", "guideline", "tos", "faq"],
  roles: ["roles", "role", "pronoun", "pronouns"],
  links: ["link", "links", "resource", "resources"],
  voice: ["voice", "vc", "call", "calls"],
  bots: ["bot", "bots", "command", "commands", "botspam"],
  clips: ["clip", "clips", "video", "videos", "highlight", "highlights", "screenshot", "screenshots"],
  sports: ["sport", "sports", "football", "soccer", "basketball", "fitness", "gym", "workout"],
};

const EMOJI_CONCEPT: Array<[RegExp, string]> = [
  [/🎨|🖌|🖼|✏/u, "art"],
  [/🎵|🎶|🎧|🎤|🎸|🎹/u, "music"],
  [/🎮|🕹|👾/u, "gaming"],
  [/😂|🤣|🐸/u, "memes"],
  [/🐱|🐶|🐾|🐈|🐕/u, "pets"],
  [/📷|📸/u, "photos"],
  [/🍕|🍔|🍰|🍳/u, "food"],
  [/👋/u, "intro"],
  [/❓|🆘|🛟/u, "help"],
  [/💡/u, "ideas"],
  [/📢|📣|📰/u, "news"],
  [/📅|🎉|🎬|🍿/u, "events"],
  [/💻|⌨/u, "tech"],
  [/📚|📖|✍/u, "books"],
  [/💬|🗨/u, "general"],
  [/📜|📋|⚖/u, "rules"],
  [/🎭|🏷/u, "roles"],
  [/🔗/u, "links"],
  [/🔊|🎙/u, "voice"],
  [/🤖/u, "bots"],
  [/🎥|📹/u, "clips"],
];

const WORD_CONCEPT = new Map<string, string>();
for (const [concept, words] of Object.entries(CONCEPTS)) for (const w of words) WORD_CONCEPT.set(w, concept);

/** The concept a word belongs to, trying a few plural and -ing endings. */
function conceptOf(word: string): string | undefined {
  const w = word.toLowerCase();
  if (WORD_CONCEPT.has(w)) return WORD_CONCEPT.get(w);
  for (const end of ["s", "es", "ing", "ers", "er"]) {
    if (w.length > end.length + 2 && w.endsWith(end) && WORD_CONCEPT.has(w.slice(0, -end.length))) return WORD_CONCEPT.get(w.slice(0, -end.length));
  }
  return undefined;
}

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(Boolean);
}

/** The words that carry meaning: no stop words, nothing shorter than 2 letters. */
function keywords(text: string): string[] {
  return words(text.replace(/'/g, "")).filter((w) => w.length > 1 && !STOP.has(w));
}

const same = (a: string, b: string) => a === b || (conceptOf(a) !== undefined && conceptOf(a) === conceptOf(b));

// ---- Answers ---------------------------------------------------------------------------

/** How a piece of an answer is written: as a chat reply (links, `code`) or in Blitz's speech bubble (plain). */
interface Pen {
  ch(c: WitsChannel): string;
  cmd(text: string): string;
  chat: boolean;
}
const CHAT: Pen = { ch: (c) => c.mention, cmd: (t) => `\`${t}\``, chat: true };
const PLAIN: Pen = { ch: (c) => `#${c.name}`, cmd: (t) => t, chat: false };

/** Markdown out, for the speech bubble. */
function plainText(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

function pick<T>(list: readonly T[], rand: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

const EMOJI: Record<string, string> = {
  sparkles: "✨",
  eyes: "👀",
  thinking_face: "🤔",
  hugging_face: "🤗",
  tada: "🎉",
  star2: "🌟",
  crescent_moon: "🌙",
  milky_way: "🌌",
  sunglasses: "😎",
  "100": "💯",
  joy: "😂",
  two_hearts: "💕",
  dizzy: "💫",
};

interface Draft {
  intent: string;
  topic?: string;
  mood?: Mood;
  trick?: TrickKind;
  emoji?: keyof typeof EMOJI;
  /** The answer, written with a pen (so channel links work in chat and read plainly in the bubble). */
  text: (pen: Pen) => string;
  answer?: boolean;
  run?: { command: string; args: string };
}

function finish(d: Draft, k: WitsKnowledge, rand: () => number): WitsAnswer {
  const mood = d.mood ?? "happy";
  const trick = d.trick ?? (mood === "curious" ? "approach" : mood === "comfort" ? "approach" : pick<TrickKind>(["hop", "wiggle", "loop"], rand));
  const reply = d.text(CHAT);
  const say = clip(plainText(d.text(PLAIN)), k.where === "domain" ? 160 : 120);
  const emoji = d.emoji ? { code: d.emoji, glyph: EMOJI[d.emoji] } : MOOD_EMOJI[mood];
  return { intent: d.intent, topic: d.topic, mood, trick, say, reply, emoji, action: TRICK_ACTIONS[trick], answer: d.answer ?? true, run: d.run };
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "friend";
const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

// ---- Channels --------------------------------------------------------------------------

function channelWords(c: WitsChannel): { name: string[]; topic: string[]; concepts: string[] } {
  const concepts = EMOJI_CONCEPT.filter(([re]) => re.test(c.name)).map(([, concept]) => concept);
  return { name: words(c.name), topic: words(c.topic ?? ""), concepts };
}

/** How well a channel fits what someone wants to post: its name counts most, its topic a little. */
function channelScore(c: WitsChannel, wanted: string[]): number {
  const cw = channelWords(c);
  let score = 0;
  for (const w of wanted) {
    const concept = conceptOf(w);
    if (cw.name.some((n) => same(n, w)) || (concept && cw.concepts.includes(concept))) score += 3;
    else if (cw.topic.some((n) => same(n, w))) score += 1;
  }
  return score;
}

function bestChannels(k: WitsKnowledge, wanted: string[]): WitsChannel[] {
  if (wanted.length === 0) return [];
  const scored = k.channels.map((c) => ({ c, s: channelScore(c, wanted) })).filter((x) => x.s > 0);
  scored.sort((a, b) => b.s - a.s);
  if (scored.length === 0) return [];
  return scored.filter((x) => x.s >= scored[0].s - 1 && x.s >= Math.max(1, scored[0].s / 2)).slice(0, 2).map((x) => x.c);
}

const generalChannel = (k: WitsKnowledge) => k.channels.find((c) => words(c.name).some((w) => conceptOf(w) === "general"));

/** A channel the text names: "#art", "the art channel", or a channel's exact name. */
function namedChannel(k: WitsKnowledge, text: string): WitsChannel | undefined {
  const tagged = /#([\p{L}\p{N}_-]+)/u.exec(text)?.[1]?.toLowerCase();
  if (tagged) {
    const exact = k.channels.find((c) => c.name.toLowerCase() === tagged || words(c.name).join("-") === tagged);
    if (exact) return exact;
  }
  const said = words(text);
  return k.channels.find((c) => {
    const n = words(c.name);
    return n.length > 0 && n.every((w) => said.includes(w)) && /\b(channel|chat|room)\b/.test(text);
  });
}

const POST_WORDS = new Set("post posting share sharing put send drop upload show showing talk talking discuss discussing find go goes chat chatting myself yourself".split(" "));

function whereAnswer(k: WitsKnowledge, topicText: string, rand: () => number, follow = false): Draft | undefined {
  const wanted = keywords(topicText).filter((w) => !POST_WORDS.has(w) && !["where", "which", "channel", "best", "right", "good", "should", "people", "stuff"].includes(w));
  const best = bestChannels(k, wanted);
  const topic = wanted.join(" ");
  if (best.length === 2) {
    return { intent: "where", topic, emoji: "eyes", text: (p) => pick([`${p.ch(best[0])} or ${p.ch(best[1])}, depending! ✨`, `try ${p.ch(best[0])}! (or ${p.ch(best[1])}) ✨`], rand) };
  }
  if (best.length === 1) {
    const c = best[0];
    return {
      intent: "where",
      topic,
      emoji: "sparkles",
      text: (p) => pick([`${p.ch(c)} is the place for that! ✨`, `that'd be ${p.ch(c)}!`, `try ${p.ch(c)} ✨`, `${p.ch(c)}! that's where it goes`], rand),
    };
  }
  if (!follow && wanted.length === 0) return undefined;
  const general = generalChannel(k);
  if (wanted.some((w) => conceptOf(w) === "help") && k.on.inbox) {
    return {
      intent: "where",
      topic,
      mood: "comfort",
      emoji: "hugging_face",
      text: (p) => `ask away${general ? ` in ${p.ch(general)}` : ""}, or talk to the team privately with ${p.cmd(`${k.prefix}ticket what's up`)} ♡`,
    };
  }
  return {
    intent: "where",
    topic,
    mood: "curious",
    emoji: "thinking_face",
    text: (p) =>
      general
        ? pick([`hmm, i don't see a channel just for that… ${p.ch(general)} is a safe bet!`, `no channel just for that, i think! ${p.ch(general)} works ✨`], rand)
        : `hmm, i'm not sure there's a channel for that. the team would know!`,
  };
}

// ---- Commands and the community's own answers ------------------------------------------

const stem = (w: string) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "");

/** The community's own command that answers this, if one clearly does; `named` when the question names it. */
function customAnswer(k: WitsKnowledge, said: string[]): { custom: WitsKnowledge["customs"][number]; named: boolean } | undefined {
  // "movie night" names !movienight; "socials" names !social.
  const names = new Set([...said.map(stem), ...said.slice(1).map((w, i) => stem(said[i] + w))]);
  let best: { c: WitsKnowledge["customs"][number]; s: number; named: boolean } | undefined;
  for (const c of k.customs) {
    const named = names.has(stem(c.name.toLowerCase()));
    const body = new Set(keywords(c.response).filter((w) => w.length > 3).map(stem));
    const s = (named ? 5 : 0) + Math.min(3, said.filter((w) => w.length > 3 && body.has(stem(w))).length);
    if (!best || s > best.s) best = { c, s, named };
  }
  return best && best.s >= 3 ? { custom: best.c, named: best.named } : undefined;
}

/** One of Blitz's commands that does what someone asks how to do. */
function commandFor(k: WitsKnowledge, said: string[]): WitsKnowledge["commands"][number] | undefined {
  let best: { c: WitsKnowledge["commands"][number]; s: number } | undefined;
  for (const c of k.commands) {
    const names = [c.name, ...c.aliases];
    let s = said.some((w) => names.includes(w)) ? 5 : 0;
    const summary = keywords(c.summary);
    s += Math.min(3, said.filter((w) => summary.some((m) => same(m, w) || (w.length > 4 && m.startsWith(w.slice(0, -1))))).length);
    if (!best || s > best.s) best = { c, s };
  }
  return best && best.s >= 2 ? best.c : undefined;
}

// ---- Small things Blitz knows by heart -----------------------------------------------------

const EIGHT_BALL = [
  "yes!! absolutely ✨",
  "the stars say yes 🌟",
  "hmm… ask me again after a nap",
  "nope. not a chance",
  "probably! (don't quote me)",
  "my sparkle says… maybe?",
  "definitely, 100%",
  "the space rocks say no",
  "i'd bet my halo on it",
  "ehh… i wouldn't count on it",
  "yes, if you believe hard enough ✨",
  "too spooky to answer 👻",
  "signs point to yes!",
  "outlook not so sparkly",
  "absolutely not 😤",
  "it's looking good!",
];

const JOKES = [
  "why did the star go to school? to get a little brighter ✨",
  "how do you throw a space party? you planet 🪐",
  "why couldn't the astronaut book a room on the moon? it was full 🌕",
  "what's an astronaut's favorite key? the space bar",
  "why did the sun skip college? it already had a million degrees ☀️",
  "what do you call a tick on the moon? a luna-tick",
  "how does the solar system hold up its pants? with an asteroid belt",
  "why are spirits bad liars? you can see right through them 👻",
  "what kind of music do planets like? neptunes 🎶",
  "why did the cow go to space? to see the moooon 🐄",
  "i tried to catch fog yesterday. mist.",
  "why don't skeletons fight each other? they don't have the guts",
  "what do you call a fake noodle? an impasta 🍝",
  "why did the scarecrow win an award? he was outstanding in his field",
  "what did one wall say to the other? i'll meet you at the corner",
];

const FACTS = [
  "a day on venus is longer than its whole year 🪐",
  "saturn is less dense than water. it would float, if you found a big enough bathtub",
  "sunlight takes about 8 minutes to reach earth, so you always see the sun as it was 8 minutes ago ☀️",
  "olympus mons on mars is about two and a half times taller than everest",
  "jupiter's great red spot is a storm wider than earth",
  "space is silent: there's no air to carry sound 🌌",
  "the footprints on the moon could last for millions of years, with no wind to blow them away",
  "about a million earths would fit inside the sun",
  "a year on mercury is only 88 earth days",
  "uranus spins on its side, like a rolling ball",
  "venus is the hottest planet, even though mercury is closer to the sun",
  "stars twinkle because their light wobbles through our air. from space they shine steady ✨",
  "a teaspoon of neutron star would weigh billions of tonnes",
  "there are more stars in the universe than grains of sand on all of earth's beaches (probably!)",
  "the andromeda galaxy is heading our way. it'll meet the milky way in about 4 to 5 billion years 🌌",
];

const FAVORITES: Array<[RegExp, string[]]> = [
  [/colou?r/, ["cyan! obviously ✨", "cyan. it's not even close", "whatever color a nebula is at 3am"]],
  [/food|snack|meal|drink/, ["stardust. crunchy ✨", "moon cheese, if it's real", "anything sparkly"]],
  [/song|music|band|artist|genre/, ["anything with a beat i can zoom to 🎶", "space disco, every time"]],
  [/game/, ["dodge-the-space-rocks. i'm undefeated", "hide and seek (i glow, so i always lose)"]],
  [/animal|pet/, ["space whales. if they're real. they have to be real", "cats! they get it"]],
  [/planet|star|place|spot/, ["the ringed planet in my domain 🪐", "my domain! but here's nice too"]],
  [/movie|film|show/, ["anything with space in it, obviously 🚀"]],
  [/person|member|human|friend/, ["everyone here ♡ don't make me choose", "you! (don't tell the others)"]],
  [/trick/, ["the loop-de-loop. never gets old", "zooming. ZOOMING."]],
  [/emoji/, ["✨, all day", "🌌"]],
];

const HOW_ARE_YOU = [
  "i'm great! just floating around my domain ✨ how about you?",
  "sparkly as ever! you?",
  "honestly? glowing. how are YOU?",
  "a little sleepy but very happy you asked ♡",
  "zooming around, bonking into space rocks. the usual! how about you?",
];

// ---- Maths ---------------------------------------------------------------------------------

/** A sum someone typed ("12 * 7", "what's 15% of 80", "2 to the power of 10"), worked out safely. */
export function solveSum(text: string): number | undefined {
  const s = text
    .toLowerCase()
    .replace(/^(what('?s| is)|calculate|calc|solve|how much is)\s+/, "")
    .replace(/[?=!]+\s*$/, "")
    .replace(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/g, "($1/100*$2)")
    .replace(/\bplus\b/g, "+")
    .replace(/\bminus\b/g, "-")
    .replace(/\b(times|multiplied by|x)\b/g, "*")
    .replace(/×/g, "*")
    .replace(/\b(divided by|over)\b/g, "/")
    .replace(/÷/g, "/")
    .replace(/\bto the power of\b|\*\*/g, "^")
    .replace(/\bsquared\b/g, "^2")
    .replace(/\bcubed\b/g, "^3")
    .replace(/\s+/g, "");
  if (!/^[\d.+\-*/^()%]+$/.test(s) || !/\d[^\d.]+\d|\d\^|\(/.test(s)) return undefined;
  let i = 0;
  const peek = () => s[i];
  const num = (): number => {
    if (peek() === "(") {
      i++;
      const v = add();
      if (peek() !== ")") throw new Error("bracket");
      i++;
      return v;
    }
    if (peek() === "-") {
      i++;
      return -num();
    }
    const m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (!m) throw new Error("number");
    i += m[0].length;
    return Number(m[0]);
  };
  const pow = (): number => {
    const base = num();
    if (peek() === "^") {
      i++;
      return base ** pow();
    }
    return base;
  };
  const mul = (): number => {
    let v = pow();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = s[i++];
      const r = pow();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  };
  const add = (): number => {
    let v = mul();
    while (peek() === "+" || peek() === "-") {
      const op = s[i++];
      const r = mul();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  try {
    const v = add();
    if (i !== s.length || !Number.isFinite(v)) return undefined;
    return Math.round(v * 1e9) / 1e9;
  } catch {
    return undefined;
  }
}

// ---- Turning "in 2 hours" into what !remind wants ----------------------------------------------

const UNIT: Array<[RegExp, string]> = [
  [/^(s|secs?|seconds?)$/, "s"],
  [/^(m|mins?|minutes?)$/, "m"],
  [/^(h|hrs?|hours?)$/, "h"],
  [/^(d|days?)$/, "d"],
  [/^(w|wks?|weeks?)$/, "w"],
];

/** "remind me in 2 hours to stretch" -> { when: "2h", what: "stretch" }. */
export function parseReminder(body: string): { when: string; what: string } | undefined {
  let text = ` ${body.trim()} `;
  let when: string | undefined;
  const words: Array<[RegExp, string]> = [
    [/\s(?:in\s+)?(?:half an hour|30 mins?)\s/i, "30m"],
    [/\s(?:in\s+)?an? (?:hour|hr)\s/i, "1h"],
    [/\s(?:in\s+)?a (?:minute|min)\s/i, "1m"],
    [/\s(?:in\s+)?a day\s/i, "1d"],
    [/\s(?:in\s+)?a week\s/i, "1w"],
    [/\stomorrow\s/i, "1d"],
    [/\sin a bit\s/i, "30m"],
  ];
  for (const [re, w] of words) {
    if (re.test(text)) {
      when = w;
      text = text.replace(re, " ");
      break;
    }
  }
  if (!when) {
    const m = /\s(?:in\s+)?(\d+)\s*([a-z]+)\b/i.exec(text);
    const unit = m && UNIT.find(([re]) => re.test(m[2].toLowerCase()))?.[1];
    if (m && unit) {
      when = `${m[1]}${unit}`;
      text = text.replace(m[0], " ");
    }
  }
  if (!when) return undefined;
  const what = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(to|that|about|of)\s+/i, "")
    .replace(/\s+(to|please|pls)$/i, "")
    .replace(/[.!?]+$/, "");
  return { when, what: what || "this!" };
}

// ---- The big one -------------------------------------------------------------------------------

const QUESTION_START = /^(what|where|when|who|whom|why|how|which|whats|wheres|whos|hows|can|could|would|will|should|shall|is|are|am|do|does|did|was|were|has|have|may)\b/;
const YES_NO_START = /^(will|would|should|shall|is|are|am|do|does|did|was|were|has|have|may|can|could)\b/;

/** What Blitz says back. Always an answer; `answer` is false when it's just chatter. */
export function wits(raw: string, k: WitsKnowledge, memory?: WitsMemory, rand: () => number = Math.random): WitsAnswer {
  // Channel links keep their name ("#art"); people, other links and Blitz's own name go.
  const withChannels = raw.replace(/\[#([^\]]+)\]\([^)\s]*\)/g, " #$1 ");
  const text = cleanForReading(withChannels).toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").replace(/^[,.!:;\s]+/, "").trim();
  const bare = text.replace(/[?!.]+$/, "").trim();
  const said = keywords(text);
  const question = /\?\s*$/.test(text) || QUESTION_START.test(text);
  const me = firstName(k.asker);
  const draft = understand();
  if (draft) return finish(draft, k, rand);

  // Nothing Blitz knows: a question gets an honest "don't know"; anything else, a mood.
  if (question && said.length > 0 && !YES_NO_START.test(text)) {
    return finish(
      {
        intent: "unknown",
        mood: "curious",
        emoji: "thinking_face",
        text: (p) =>
          pick(
            [
              `ooh, good question… i don't know that one 🤔 ${p.cmd(`${k.prefix}help`)} shows what i can do!`,
              `hmm, that one's beyond my sparkle. ${k.on.inbox ? `the team would know: ${p.cmd(`${k.prefix}ticket`)}` : "the team would know!"}`,
              `no idea, sorry! try asking me where to post something, or what the rules are ✨`,
            ],
            rand,
          ),
      },
      k,
      rand,
    );
  }
  const r = readMessage(raw, rand);
  const greeting = /\b(hi+|hey+|hello+|hiya|howdy|yo|sup|gm|good morning|morning|evening)\b/.test(text);
  const say = greeting && rand() < 0.6 ? `${r.say.replace(/[!.~ ]+$/, "")} ${me}!` : r.say;
  return { ...r, say, reply: `${say} *${r.action}*`, intent: "chatter", answer: false };

  function understand(): Draft | undefined {
    if (!text) return undefined;

    // Someone in a dark place: drop the bit, gently.
    if (/\b(kill myself|killing myself|suicid\w*|want to die|wanna die|end it all|end my life|self[- ]?harm|hurt myself|cut myself|don'?t want to (be alive|live|exist))\b/.test(text)) {
      return {
        intent: "care",
        mood: "comfort",
        trick: "approach",
        emoji: "hugging_face",
        text: (p) =>
          `${me}, i'm really glad you said something, and i care about you ♡ please reach out to someone you trust, or a crisis line (988 in the US, or your local one). you don't have to carry this alone.${k.on.inbox && p.chat ? ` you can also talk to the team privately with ${p.cmd(`${k.prefix}ticket`)}.` : ""}`,
      };
    }

    // Things to do, said in your own words.
    const remind = /\bremind me\b\s*(.*)$/.exec(text);
    if (remind) {
      const r = parseReminder(remind[1]);
      if (!r) return { intent: "remind", mood: "curious", text: () => `sure! when? say something like: "remind me in 2h to stretch" ⏰` };
      return { intent: "remind", run: { command: "remind", args: `${r.when} ${r.what}` }, emoji: "sparkles", text: () => "on it! ⏰" };
    }
    if (/\b(my|what are my|show my|list my) reminders\b/.test(text)) return { intent: "reminders", run: { command: "reminders", args: "" }, text: () => "let me check… ⏰" };
    const bday = /\bmy (?:birthday|bday|b-day) is (?:on )?(.+)$/.exec(bare);
    if (bday) return { intent: "birthday", run: { command: "birthday", args: bday[1].trim() }, mood: "excited", emoji: "tada", text: () => "ooh! noted 🎂" };
    if (k.stardust && /\b(claim|collect|grab|get|give me)\b.{0,20}\b(daily|gift)\b|^daily$/.test(bare)) return { intent: "daily", run: { command: "daily", args: "" }, mood: "excited", emoji: "sparkles", text: () => "here you go! ✨" };
    if (/\b(tell|give|show|share|read)( me| us)? (a |another |random |some )?quote\b|\brandom quote\b/.test(text)) return { intent: "quote", run: { command: "quote", args: "" }, emoji: "sparkles", text: () => "ooh, a classic…" };
    const giveRole = /\b(?:give me|i want|i'?d like|can i (?:get|have)|add|get me|i'?m)\s+(?:the |a |an )?([\p{L}\p{N} /'-]+?)\s+role\b/u.exec(text);
    if (giveRole && k.selfRoles.length > 0) {
      const asked = giveRole[1].trim();
      const role = findRole(k.selfRoles, asked);
      if (role) return { intent: "role", run: { command: "role", args: role }, emoji: "sparkles", text: () => "one sec! 🎭" };
    }

    // "and music?", "what about memes?": the same question, about something else.
    const follow = /^(?:and|what about|how about|ok and|also)\s+(.+?)$/.exec(bare);
    if (follow && memory && k.now - memory.at < 180_000) {
      if (memory.intent === "where") return whereAnswer(k, follow[1], rand, true);
      if (memory.intent === "favorite") return favorite(follow[1]);
    }

    // Stardust.
    const aboutDust = /\bstardust\b/.test(text);
    const dustAsk =
      /\b(how much|how many)\b.*\b(stardust|dust|sparkles)\b|\bmy (stardust|balance|wallet)\b|\b(stardust|my) (balance|streak)\b/.test(text) ||
      /\b(is )?my daily\b.*\b(ready|available|up)\b/.test(text) ||
      (aboutDust && question) ||
      /\b(where|how) (can|do) i (buy|get) (a |some |new )?(hats?|trails?|glows?|outfits?|cosmetics?|looks?)\b|\bwhere('?s| is) the shop\b/.test(text);
    if (dustAsk) {
      if (!k.stardust) return { intent: "stardust", mood: "curious", text: () => `stardust isn't switched on here!` };
      const d = k.stardust;
      if (/\bhow (do|can) i (get|earn|make|collect)\b.*\b(stardust|dust|sparkles)\b|\bhow does stardust work\b|\bwhat('?s| is) stardust\b/.test(text)) {
        return { intent: "stardust-how", emoji: "sparkles", text: (p) => `a little for chatting, your daily gift (${p.cmd(`${k.prefix}daily`)}), levelling up and giveaways! spend it on looks for your ${k.botName} in my menu ✨` };
      }
      if (/\b(shop|buy)\b/.test(text)) {
        return { intent: "shop", emoji: "sparkles", text: (p) => `my shop's in the menu, in my domain: hats, trails and glows! you have ${d.balance.toLocaleString("en-US")} ✨ (${p.cmd(`${k.prefix}shop`)} lists it all)` };
      }
      return {
        intent: "stardust",
        emoji: "sparkles",
        text: () => `you have ${d.balance.toLocaleString("en-US")} ✨ stardust${d.streak > 1 ? ` and a ${d.streak}-day streak` : ""}!${d.dailyReady ? ` your daily gift is ready: say "claim my daily" 🎁` : ""}`,
      };
    }

    // A question that names one of the community's own commands ("where are your socials?") gets its answer.
    const custom = customAnswer(k, said);
    if (custom?.named && (question || said.length <= 3)) return customDraft(custom.custom);

    // Channels: where things go, and what a channel is for.
    if (/\b(what('?s| is)|whats)\b.*\bfor\b|\bwhat('?s| is| goes in| do you post in)\b.*#/.test(text)) {
      const c = namedChannel(k, text);
      if (c) {
        return {
          intent: "channel",
          emoji: "eyes",
          text: (p) => (c.topic ? `${p.ch(c)}: ${clip(c.topic, 200)}` : `${p.ch(c)}! no description, but the name says it all ✨`),
        };
      }
    }
    if (/\b(where|which (channel|chat|room)|what (channel|chat|room))\b/.test(text) || /\b(channel|chat|room|place) (for|to)\b/.test(text)) {
      if (/\bwhere('?s| is| are| do you)\b.*\b(you|your (home|domain))\b|\bwhere do you live\b/.test(text)) {
        return { intent: "home", emoji: "milky_way", text: () => `in my domain! the 🔮 channel. come visit, there's a ${k.botName} in there just for you` };
      }
      const rules = /\brules?|guidelines?\b/.test(text) ? rulesAnswer() : undefined;
      if (rules) return rules;
      const w = whereAnswer(k, text, rand);
      if (w) return w;
    }

    // The rules.
    if (/\b(rules?|guidelines?)\b/.test(text) && (question || said.length <= 3)) return rulesAnswer();

    // Levels.
    if (/\b(what('?s| is)? my|my|what) (level|lvl|rank|xp)\b|\bwhat level am i\b|\bhow (much|many) xp\b|\bmy (place|rank)\b/.test(text)) {
      if (!k.levels) return { intent: "level", mood: "curious", text: () => `levels aren't switched on here, so no XP to count!` };
      const l = k.levels;
      return {
        intent: "level",
        emoji: "star2",
        text: () => `you're level ${l.level} with ${l.xp.toLocaleString("en-US")} XP${l.needed ? `, ${(l.needed - l.into).toLocaleString("en-US")} more to level ${l.level + 1}` : ""}${l.place ? `. #${l.place} on the board` : ""} ✨`,
      };
    }
    if (/\bhow (do|can|would) (i|you|we|people) (level|rank|get xp|get levels?|go up)\b|\bhow (does|do) (levell?ing|levels?|xp) work\b|\bhow to level\b/.test(text)) {
      if (!k.levels) return { intent: "level-how", mood: "curious", text: () => `levels aren't switched on here!` };
      const how = k.levels.how;
      return { intent: "level-how", emoji: "star2", text: () => `${how.charAt(0).toLowerCase()}${how.slice(1)}` };
    }
    if (/\bwho('?s| is)\b.*\b(top|most active|number one|#1|first place|winning|leading)\b|\bleaderboard\b|\btop (members|chatters|people)\b/.test(text)) {
      const top = k.top ?? [];
      if (top.length === 0) return { intent: "top", mood: "curious", text: () => `nobody's on the board yet! chat a little and it'll fill up ✨` };
      return { intent: "top", emoji: "star2", text: () => `right now: ${list(top.slice(0, 3))}. the brightest stars 🌟` };
    }

    // Roles.
    if (/\broles?\b/.test(text)) {
      const how = /\bhow (do|can) i (get|have|earn|unlock)\s+(?:the |a |an )?(.+?)\s+role\b/.exec(text);
      const wanted = how?.[3];
      if (wanted) {
        const self = findRole(k.selfRoles, wanted);
        if (self) return { intent: "role-how", emoji: "sparkles", text: (p) => `just ask! say "give me the ${self} role", or type ${p.cmd(`${k.prefix}role ${self.toLowerCase()}`)} 🎭` };
        const reward = k.levelRewards.find((r) => r.role.toLowerCase().includes(wanted.toLowerCase()));
        if (reward) return { intent: "role-how", emoji: "star2", text: () => `${reward.role} comes at level ${reward.level}${k.levels ? ` (you're level ${k.levels.level})` : ""}. keep chatting ✨` };
        return { intent: "role-how", mood: "curious", text: () => `i can't hand that one out myself. the team decides that one!` };
      }
      if (question || /\b(list|all|which|what)\b/.test(text)) {
        if (k.selfRoles.length === 0) {
          return { intent: "roles", mood: "curious", text: () => `there aren't any roles to pick here yet${k.levelRewards.length ? `, but levels unlock some: ${list(k.levelRewards.slice(0, 3).map((r) => `${r.role} at level ${r.level}`))}` : ""}!` };
        }
        const first = k.selfRoles[0];
        return {
          intent: "roles",
          emoji: "sparkles",
          text: (p) => `you can pick: ${list(k.selfRoles.slice(0, 12))}. say "give me the ${first} role", or type ${p.cmd(`${k.prefix}role ${first.toLowerCase()}`)} 🎭`,
        };
      }
    }

    // The team.
    if (/\bhow (do|can) i report\b|\bi (want|need) to report\b|\breport (someone|somebody|a (user|member|person)|him|her|them|this|that|a message)\b|\b(someone|somebody|they|he|she|people)('?s| is| are| keeps?)? (being )?(spamm\w*|harass\w*|mean to|rude|bully\w*|scam\w*|threaten\w*)\b|\b(need|talk to|contact|get|call|ping|where are) (a |the )?(mods?|moderators?|admins?|staff|team|owner)\b|\bwho are the (mods?|moderators?|admins?|staff|team)\b/.test(text)) {
      return {
        intent: "team",
        mood: "comfort",
        trick: "approach",
        emoji: "hugging_face",
        text: (p) =>
          k.on.inbox
            ? `you can tell the team privately: ${p.cmd(`${k.prefix}ticket what's going on`)}, or ${p.cmd(`${k.prefix}report @someone what happened`)}. only the team sees it ♡`
            : `${p.cmd(`${k.prefix}report @someone what happened`)} tells the team quietly ♡`,
      };
    }

    // What Blitz can do.
    if (/\bwhat (can|do) you do\b|\bwhat are you (for|good at)\b|\bhow do (i|we) use you\b|^(help|commands|help me)$|\bwhat commands\b|\bwhat can i (ask|say|do)\b/.test(bare)) {
      const bits = [
        "tell you where to post things",
        "what the rules are",
        ...(k.levels ? ["your level"] : []),
        ...(k.stardust ? ["your stardust"] : []),
        `set reminders ("remind me in 1h to stretch")`,
        ...(k.selfRoles.length ? ["give you roles"] : []),
        ...(k.on.birthdays ? ["remember birthdays"] : []),
        "roll dice, flip coins, do maths and tell jokes",
      ];
      return { intent: "help", emoji: "sparkles", text: (p) => `i can ${list(bits)}! ${p.cmd(`${k.prefix}help`)} has every command, and the menu in my domain does it all with buttons ✨` };
    }

    // The community.
    if (/\bhow many (people|members|of us|users)\b|\bmember count\b/.test(text)) {
      if (!k.members) return undefined;
      return { intent: "members", mood: "excited", emoji: "two_hearts", text: () => `there are ${k.members!.toLocaleString("en-US")} of us here! 💕` };
    }
    if (/\bwhat('?s| is) (this|the) (community|server|place|group)( about| for)?\b|\bwhat is ${escapeRe(k.community.toLowerCase())}\b|\bwhere am i\b/.test(text)) {
      return { intent: "about", emoji: "sparkles", text: () => (k.about ? `${k.community}! ${clip(k.about, 300)}` : `you're in ${k.community}! a lovely corner of root ✨`) };
    }

    // News.
    if (/\bwhat('?s| is) new\b|\bwhat did i miss\b|\bany (news|updates)\b|\bwhat'?s happening\b/.test(text)) {
      const news = k.channels.find((c) => words(c.name).some((w) => conceptOf(w) === "news"));
      return { intent: "news", mood: "curious", emoji: "eyes", text: (p) => (news ? `${p.ch(news)} has the news! ✨` : `i can't read back through chat on my own, but the team posts the big stuff! ✨`) };
    }

    // Time and date (Blitz only knows UTC: your own clock knows your time zone).
    if (/\bwhat time is it\b|\bwhat('?s| is) the time\b|\bcurrent time\b/.test(text)) {
      const d = new Date(k.now);
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      return { intent: "time", emoji: "crescent_moon", text: () => `it's ${hh}:${mm} UTC ✨ (your own clock knows your time zone better than me)` };
    }
    if (/\bwhat('?s| is) (the date|today'?s date)\b|\bwhat day is (it|today)\b/.test(text)) {
      const day = new Date(k.now).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
      return { intent: "date", emoji: "crescent_moon", text: () => `it's ${day} ✨ (in UTC, anyway)` };
    }

    // Maths.
    const sum = solveSum(bare);
    if (sum !== undefined) {
      const shown = Math.abs(sum) >= 1e6 ? sum.toLocaleString("en-US") : String(sum);
      return { intent: "maths", emoji: "sunglasses", text: () => pick([`${shown}! easy 😎`, `that's ${shown} ✨`, `${shown}. i counted on my sparkles`], rand) };
    }

    // Dice, coins and numbers.
    if (/\b(flip|toss) a coin\b|\bheads or tails\b|\bcoin ?flip\b/.test(text)) {
      const side = rand() < 0.5 ? "heads" : "tails";
      return { intent: "coin", mood: "excited", emoji: "sparkles", text: () => `*flips* … ${side}! 🪙` };
    }
    const dice = /\broll\b.*?\b(\d{0,2})d(\d{1,3})\b/.exec(text) ?? (/\broll (a |the )?(dice|die)\b/.test(text) ? ["", "1", "6"] : null);
    if (dice) {
      const n = Math.min(20, Math.max(1, Number(dice[1] || 1)));
      const sides = Math.min(1000, Math.max(2, Number(dice[2])));
      const rolls = Array.from({ length: n }, () => 1 + Math.floor(rand() * sides));
      const total = rolls.reduce((a, b) => a + b, 0);
      return { intent: "dice", mood: "excited", emoji: "sparkles", text: () => `🎲 ${n > 1 ? `${rolls.join(" + ")} = **${total}**` : `**${total}**`}${total === sides * n ? "! a perfect roll!!" : ""}` };
    }
    const range = /\b(?:pick|choose|give me|random) (?:a )?(?:random )?number\b(?:.*?\b(\d+)\s*(?:and|to|-)\s*(\d+))?/.exec(text);
    if (range) {
      const lo = Number(range[1] ?? 1);
      const hi = Number(range[2] ?? 10);
      const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
      const n = a + Math.floor(rand() * (Math.min(b, a + 1e9) - a + 1));
      return { intent: "number", emoji: "sparkles", text: () => `${n}! ✨` };
    }

    // "pizza or tacos?": Blitz picks.
    const or = /^(?:should i|should we|which(?: one)?|what should i|do i|would you rather|pick|choose)?[:,]?\s*(.+?)\s+or\s+(.+?)$/.exec(bare);
    const yesNoOr = YES_NO_START.test(bare) && !/^(should (i|we)|would you rather)\b/.test(bare);
    if (or && !yesNoOr && (question || /^(pick|choose)/.test(bare)) && or[1].split(" ").length <= 6 && or[2].split(" ").length <= 6) {
      const choice = (rand() < 0.5 ? or[1] : or[2]).replace(/^(i |we |to )/, "").replace(/^(a|an|the) /, "");
      return { intent: "choose", mood: "excited", emoji: "sparkles", text: () => pick([`${choice}! obviously ✨`, `hmm… ${choice}`, `${choice}, no question`, `my sparkle says ${choice}`], rand) };
    }

    // The community's own answers (rules, FAQs, links) that talk about what was asked.
    if (custom && question) return customDraft(custom.custom);

    // "how do I make a poll?": one of Blitz's commands.
    if (/\bhow (do|can|would) (i|we|you)\b|\bhow to\b|\bis there a way to\b|\bcan (i|you|we)\b|\bwhat('?s| is) the command\b/.test(text)) {
      const cmd = commandFor(k, said);
      if (cmd) {
        const usage = `${k.prefix}${cmd.name}${cmd.usage ? ` ${cmd.usage}` : ""}`;
        return { intent: "command", topic: cmd.name, emoji: "sparkles", text: (p) => `${p.cmd(usage)}! ${cmd.summary.charAt(0).toLowerCase()}${cmd.summary.slice(1)}` };
      }
    }

    // About Blitz.
    if (/\bhow (are|r) (you|u|ya)\b|\bhow'?s it going\b|\bhow are things\b|\bhow have you been\b|\bwyd\b|\bwhat are you (doing|up to)\b|^(what'?s up|sup|wassup)$/.test(bare)) {
      return { intent: "how-are-you", mood: "happy", emoji: "sparkles", text: () => pick(HOW_ARE_YOU, rand) };
    }
    if (/\bwho are you\b|\bwhat are you\b|\bwhat'?s your name\b|\bintroduce yourself\b/.test(text)) {
      return {
        intent: "who",
        mood: "shy",
        emoji: "sparkles",
        text: () => `i'm ${k.botName}! a little glowing spirit who looks after ${k.community}: i keep it safe, keep score, and float around my domain getting flung into space rocks ✨`,
      };
    }
    if (/\bare you (an? )?(ai|bot|robot|real|alive|human|person|chatgpt|claude)\b/.test(text)) {
      return {
        intent: "real",
        mood: "shy",
        emoji: "sparkles",
        text: () => `a bit of both? i'm a spirit who lives in a Root App ✨ no AI brain switched on here right now, just me and my wits`,
      };
    }
    if (/\bwho (made|created|built|coded) you\b|\bwho'?s your (creator|maker|dev|developer)\b/.test(text)) {
      return { intent: "maker", mood: "shy", emoji: "sparkles", text: () => `i'm a Root App, made to look after communities like this one ♡` };
    }
    if (/\bhow old are you\b|\byour (age|birthday)\b/.test(text)) {
      return { intent: "age", mood: "shy", emoji: "sparkles", text: () => pick([`about this many sparkles old ✨`, `old enough to zoom, young enough to bonk into everything`], rand) };
    }
    const fav = /\b(?:what('?s| is)|whats) your (?:fav(?:ou?rite)?|fave) (.+?)$/.exec(bare);
    if (fav) return favorite(fav[2]);
    if (/\b(tell|give|say|know)( me| us)? (a |another |any )?(joke|pun)s?\b|\bmake me laugh\b/.test(text)) {
      return { intent: "joke", mood: "laugh", trick: "wiggle", emoji: "joy", text: () => pick(JOKES, rand) };
    }
    if (/\b(fun |random |space )?facts?\b/.test(text) && /\b(tell|give|know|share|fun|random|space)\b/.test(text)) {
      return { intent: "fact", mood: "excited", trick: "zoom", emoji: "milky_way", text: () => `did you know? ${pick(FACTS, rand)}` };
    }
    if (/\bi'?m (so |really |kinda )?bored\b|\bbored\b.*\bwhat (should|can) i do\b|\bentertain me\b/.test(text)) {
      return {
        intent: "bored",
        mood: "excited",
        trick: "zoom",
        emoji: "sparkles",
        text: (p) => `ooh! ask me for a joke or a fun fact, roll ${p.cmd(`${k.prefix}roll d20`)}, ask the ${p.cmd(`${k.prefix}8ball`)}, or come fling me around my domain ✨`,
      };
    }
    if (/\b(weather|raining|sunny|temperature)\b/.test(text) && question) {
      return { intent: "weather", mood: "curious", emoji: "milky_way", text: () => `no idea, there's no weather in my bubble 🌌 just stars` };
    }
    const like = /\bdo you (like|love|enjoy) (.+?)$/.exec(bare);
    if (like) {
      const thing = clip(swapPronouns(like[2].trim()), 40);
      if (/^(you|us|everyone|everybody|this (place|community|server)|it here|people)$/.test(thing)) {
        return { intent: "like", mood: "love", trick: "heart", emoji: "two_hearts", text: () => pick([`i LOVE ${thing} ♡`, `so much ♡♡♡`], rand) };
      }
      return { intent: "like", mood: "excited", emoji: "sparkles", text: () => pick([`${thing}? obsessed ✨`, `i LOVE ${thing}!!`, `${thing} is pretty great! not as great as cyan`, `hmm… ${thing} is okay. i like zooming more`], rand) };
    }

    // Tricks asked for ("do a flip!") are the mood reader's job; yes/no questions go to Blitz's crystal ball.
    if (YES_NO_START.test(text) && question && !/^(can|could) (you|u)\b/.test(text)) {
      return { intent: "8ball", mood: "curious", emoji: "crescent_moon", text: () => `🔮 ${pick(EIGHT_BALL, rand)}` };
    }
    return undefined;
  }

  function rulesAnswer(): Draft {
    const custom = k.customs.find((c) => /^(rules?|guidelines?)$/i.test(c.name));
    if (custom) return { intent: "rules", emoji: "sparkles", text: (p) => `${clip(custom.response.trim(), p.chat ? 700 : 150)}${p.chat ? `\n_(that's ${p.cmd(`${k.prefix}${custom.name}`)})_` : ""}` };
    const channel = k.channels.find((c) => words(c.name).some((w) => conceptOf(w) === "rules" && w !== "faq"));
    if (channel) return { intent: "rules", emoji: "eyes", text: (p) => `the rules are in ${p.ch(channel)}! ✨` };
    return { intent: "rules", text: () => `be kind, no spam, have fun ✨ (the team can write proper rules with ${k.prefix}addcmd rules …)` };
  }

  function customDraft(c: WitsKnowledge["customs"][number]): Draft {
    return { intent: "custom", topic: c.name, emoji: "sparkles", text: (p) => `${clip(c.response.trim(), p.chat ? 600 : 150)}${p.chat ? `\n_(that's ${p.cmd(`${k.prefix}${c.name}`)})_` : ""}` };
  }

  function favorite(thing: string): Draft {
    const found = FAVORITES.find(([re]) => re.test(thing));
    return { intent: "favorite", topic: thing, mood: "happy", emoji: "sparkles", text: () => (found ? pick(found[1], rand) : pick([`hmm, ask me again tomorrow. i change my mind a lot`, `ooh, i can't pick just one!`], rand)) };
  }
}

/** "my hat" -> "your hat", so Blitz talks back about it naturally. */
function swapPronouns(text: string): string {
  const swap: Record<string, string> = { my: "your", your: "my", me: "you", mine: "yours", yours: "mine", myself: "yourself", i: "you", "i'm": "you're", am: "are" };
  return text.replace(/\b(i'm|my|your|me|mine|yours|myself|i|am)\b/gi, (w) => swap[w.toLowerCase()] ?? w);
}

/** The self-role someone means: an exact name, or one that starts with (or contains) what they said. */
function findRole(roles: string[], asked: string): string | undefined {
  const a = asked.toLowerCase().trim();
  if (!a) return undefined;
  return roles.find((r) => r.toLowerCase() === a) ?? roles.find((r) => r.toLowerCase().startsWith(a)) ?? roles.find((r) => a.length >= 3 && r.toLowerCase().includes(a));
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
