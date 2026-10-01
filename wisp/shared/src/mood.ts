// How Wisp feels about what someone just said to it. Plain word and emoji
// spotting, nothing clever: it only has to be right often enough to be fun.
// The server uses it for messages from chat; a solo domain uses it for what
// you type into the domain.

import { TrickKind } from "./tricks";

export type Mood =
  | "happy"
  | "love"
  | "shy"
  | "laugh"
  | "excited"
  | "curious"
  | "comfort"
  | "grumpy"
  | "sad"
  | "scared"
  | "sleepy";

export interface Reaction {
  mood: Mood;
  /** What Wisp does about it. None when it droops or dozes off instead. */
  trick?: TrickKind;
  /** Wisp's little line, shown in a speech bubble. */
  say: string;
  /** The reaction Wisp leaves on the message in chat. */
  emoji: { code: string; glyph: string };
  /** What Wisp did, for a chat reply ("does a loop-de-loop"). */
  action: string;
}

type Feeling = Mood | "greet" | "thanks" | "bye";

/** Checked in this order; the first that matches is how Wisp feels. */
const FEELINGS: Array<[Feeling, RegExp]> = [
  ["sleepy", /\b(good ?night|gn|nini|night night|sleepy|sleep|tired|nap|bedtime|go to bed)\b|😴|💤/],
  ["sad", /\b(i hate you|hate you|hate u|go away|leave me alone|don'?t like you|nobody likes you|shoo)\b|👎/],
  ["grumpy", /\b(stupid|dumb|idiot|ugly|annoying|cringe|shut up|stfu|fuck you|fuck off|fuck u|sucks?|loser|smelly|bad (boy|girl|wisp)|worst)\b|🖕|😠|😡|🤬/],
  ["love", /\b(i love you|i love u|ily|ilysm|love you|love u|luv you|luv u|marry me|kiss|mwah)\b|<3|❤|💕|💖|💗|💘|💞|😍|🥰|😘|♥/],
  ["comfort", /\b(sad|depressed|crying|cry|lonely|upset|bad day|miss you|i miss|sigh|ugh|not ok|not okay)\b|😢|😞|😔|💔|🥲/],
  ["scared", /\b(boo+|scary|spooky|ghost|monster|scared|creepy|jumpscare)\b|👻|😱|🎃/],
  ["shy", /\b(cute|cutie|adorable|pretty|beautiful|good (boy|girl|wisp|bean|job)|sweet|precious|baby|bestie|smart|cool|awesome|amazing|the best|proud of you|so good)\b|🥺|😊|☺/],
  ["laugh", /\b(lol+|lmao+|lmfao+|rofl|(ha){2,}h?|(he){2,}h?|xd+|funny|im dead|i'm dead)\b|😂|🤣|💀|😭/],
  ["greet", /\b(hi+|hey+|hello+|hiya|howdy|yo|sup|wassup|what'?s up|gm|good morning|morning)\b|👋/],
  ["thanks", /\b(thanks|thank you|thank u|ty|thx|tysm)\b|🙏/],
  ["bye", /\b(bye+|cya|see ya|goodbye|later|ttyl)\b/],
  ["excited", /\b(yay+|omg+|let'?s go+|lets go+|wo+h?o+|pog|poggers|hype|wow+|yippee)\b|🎉|🥳|✨|🔥/],
  ["curious", /\?\s*$|\b(why|what|how|who|where|when)\b/],
];

/** Asked-for tricks. They win over the mood's own trick (unless Wisp is sulking or sleepy). */
const REQUESTS: Array<[TrickKind, RegExp]> = [
  ["spin", /\b(spin|spinny|twirl)\b/],
  ["zoom", /\b(zoom+|zoomies|fly|race)\b/],
  ["loop", /\b(loop|loops|flip|backflip|loop de loop)\b/],
  ["dance", /\b(dance|dancing|boogie|groove)\b/],
  ["hop", /\b(jump|hop|bounce|boing)\b/],
  ["heart", /\b(heart|hearts)\b/],
  ["zigzag", /\b(zigzag|zig zag)\b/],
  ["approach", /\b(come here|come|c'?mere)\b/],
  ["shy", /\b(hide|peekaboo|peek a boo)\b/],
];

const LINES: Record<Feeling, string[]> = {
  happy: ["hehe!", "yay!", "✨", "mhm!"],
  greet: ["hii!!", "hello hello!", "oh! hi!", "hiya ✨", "heyyy"],
  thanks: ["anytime!! ✨", "hehe, of course!", "for you? always"],
  bye: ["byee!! ✨", "see you soon!", "come back soon!"],
  love: ["♡♡♡", "aaaa ily too", "♡ !!", "*melts*"],
  shy: ["hehe…", "stoppp", "eep >///<", "*blushes*"],
  laugh: ["hahaha!", "hehehehe", "pfft—", "ahaha!"],
  excited: ["WHEEE!!", "LET'S GOOO", "!!!", "yippee!"],
  curious: ["hm?", "ooh?", "you called?", "yes?"],
  comfort: ["there, there", "*hugs*", "i'm here ♡", "*nuzzles*"],
  grumpy: ["hmph!", "rude!!", "meanie >:(", "*puffs up*"],
  sad: ["oh…", "*sniff*", "…okay", "*droops*"],
  scared: ["eep!", "AAA", "!!!", "*hides*"],
  sleepy: ["*yawn*", "nini…", "zzz…", "g'night ♡"],
};

const MOOD_OF: Record<Feeling, Mood> = {
  happy: "happy",
  greet: "happy",
  thanks: "happy",
  bye: "happy",
  love: "love",
  shy: "shy",
  laugh: "laugh",
  excited: "excited",
  curious: "curious",
  comfort: "comfort",
  grumpy: "grumpy",
  sad: "sad",
  scared: "scared",
  sleepy: "sleepy",
};

const TRICK_OF: Record<Feeling, TrickKind[]> = {
  happy: ["hop", "loop", "wiggle"],
  greet: ["approach", "hop"],
  thanks: ["hop", "loop"],
  bye: ["wiggle", "loop"],
  love: ["heart"],
  shy: ["shy"],
  laugh: ["hop", "wiggle"],
  excited: ["zoom", "zigzag"],
  curious: ["approach"],
  comfort: ["approach"],
  grumpy: ["dash"],
  sad: [],
  scared: ["dash"],
  sleepy: [],
};

export const MOOD_EMOJI: Record<Mood, { code: string; glyph: string }> = {
  happy: { code: "sparkles", glyph: "✨" },
  love: { code: "two_hearts", glyph: "💕" },
  shy: { code: "blush", glyph: "😊" },
  laugh: { code: "joy", glyph: "😂" },
  excited: { code: "dizzy", glyph: "💫" },
  curious: { code: "eyes", glyph: "👀" },
  comfort: { code: "hugging_face", glyph: "🤗" },
  grumpy: { code: "triumph", glyph: "😤" },
  sad: { code: "pleading_face", glyph: "🥺" },
  scared: { code: "scream", glyph: "😱" },
  sleepy: { code: "sleeping", glyph: "😴" },
};

const ACTIONS: Record<TrickKind, string> = {
  zoom: "zooms around in circles",
  loop: "does a loop-de-loop",
  spin: "spins",
  hop: "hops happily",
  wiggle: "wiggles",
  dance: "dances",
  zigzag: "zigzags all over the place",
  heart: "draws a heart in the air",
  dash: "darts away",
  shy: "hides, then peeks out",
  approach: "floats closer",
};

/** Mentions, links and Wisp's own name don't say anything about the mood. */
export function cleanForReading(text: string): string {
  return text
    .replace(/\[[^\]]*\]\([^)\s]*\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\bwisp(y|ie|ies|s)?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pick<T>(list: readonly T[], rand: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

function isShouting(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  return (letters.length >= 6 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.7) || /!{3,}/.test(text);
}

/** Reads a message sent to Wisp and decides how it reacts. */
export function readMessage(raw: string, rand: () => number = Math.random): Reaction {
  const text = cleanForReading(raw).toLowerCase();
  // Shouting counts Wisp's name too: "HELLO WISP" is shouting.
  const shouting = isShouting(raw.replace(/\[[^\]]*\]\([^)\s]*\)/g, " "));
  let feeling: Feeling = "curious";
  const matched = FEELINGS.find(([, re]) => re.test(text));
  if (matched) feeling = matched[0];
  else if (shouting) feeling = "excited";
  else if (text.length > 0) feeling = "happy";
  // Shouting something happy is extra happy.
  if ((feeling === "happy" || feeling === "greet") && shouting) feeling = "excited";

  const mood = MOOD_OF[feeling];
  const requested = REQUESTS.find(([, re]) => re.test(text))?.[0];
  const sulking = mood === "grumpy" || mood === "sad" || mood === "sleepy";
  const own = TRICK_OF[feeling];
  const trick = requested && !sulking ? requested : own.length > 0 ? pick(own, rand) : undefined;
  let action = trick ? ACTIONS[trick] : mood === "sleepy" ? "curls up and dozes off" : "droops a little";
  if (trick === "approach" && mood === "comfort") action = "floats over for a hug";
  return { mood, trick, say: pick(LINES[feeling], rand), emoji: MOOD_EMOJI[mood], action };
}
