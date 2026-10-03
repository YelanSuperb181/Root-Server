// The scam shield: spots the links that steal accounts. Fake Nitro and Steam
// gifts, lookalike sites (dlscord, steamcommunlty), links dressed up as one
// site that go to another, and "free gift" bait with a link. Pure, so it's
// unit tested without Root.

export interface FoundLink {
  /** The address as written (with https:// added if it had none). */
  url: string;
  /** Its host, lowercase, without "www.". */
  host: string;
  /** For a [text](address) link: the text shown instead of the address. */
  shown?: string;
}

export interface ScamVerdict {
  /** "high": almost surely a scam (the sender's account may be hacked). "medium": suspicious enough to remove. */
  confidence: "high" | "medium";
  /** Friendly sentence for the member. */
  reason: string;
  /** What gave it away, for the staff log. */
  signal: string;
  host: string;
}

/** Brands scammers dress up as, with the sites that really are theirs. */
const BRANDS: Record<string, readonly string[]> = {
  discord: ["discord.com", "discord.gg", "discord.gift", "discordapp.com", "discordapp.net", "discord.media", "discord.new", "discord.co", "discordstatus.com", "dis.gd", "discord.dev", "discord.js.org", "discordjs.dev"],
  nitro: ["discord.com", "discord.gift"],
  steam: ["steampowered.com", "steamcommunity.com", "steamgames.com", "steamstatic.com", "steamusercontent.com", "s.team", "steamdeck.com", "steamdb.info", "steamcharts.com"],
  steamcommunity: ["steamcommunity.com"],
  steampowered: ["steampowered.com"],
  roblox: ["roblox.com", "rbxcdn.com", "rblx.co"],
  epicgames: ["epicgames.com", "unrealengine.com", "fortnite.com"],
  rootapp: ["rootapp.com"],
  paypal: ["paypal.com", "paypal.me"],
  twitch: ["twitch.tv"],
  youtube: ["youtube.com", "youtu.be"],
  minecraft: ["minecraft.net", "mojang.com"],
  riotgames: ["riotgames.com", "leagueoflegends.com", "playvalorant.com"],
  metamask: ["metamask.io"],
  opensea: ["opensea.io"],
  github: ["github.com", "github.io", "githubusercontent.com"],
};

/** Words that turn "a link mentioning Discord" into "a fake gift page". */
const BAIT = ["gift", "gifts", "nitro", "free", "claim", "airdrop", "giveaway", "promo", "promotion", "drop", "drops", "reward", "rewards", "bonus", "verify", "verification", "login", "auth", "oauth", "trade", "offer", "skins", "case", "wallet", "mint", "event", "boost", "premium"];

/** Endings that throwaway scam sites favor. */
const CHEAP_TLDS = ["ru", "xyz", "top", "click", "icu", "shop", "site", "online", "cc", "pw", "tk", "ml", "ga", "cf", "gq", "live", "fun", "rest", "monster", "cyou", "sbs", "cfd", "buzz", "gift", "link", "store", "su", "best", "lol"];

/** Lines scam messages use, on their own or with a link. */
const BAIT_PHRASES = [
  /\bfree\s+(?:discord\s+)?nitro\b/i,
  /\bnitro\s+(?:for\s+)?free\b/i,
  /\b(?:steam|discord)\s+(?:gift|giveaway)\b/i,
  /\$\s?\d+\s*(?:steam|gift)/i,
  /\bclaim\s+(?:your|it|the)\b.*\b(?:gift|nitro|reward|prize|bonus)\b/i,
  /\b(?:i'?m|im)\s+(?:giving\s+away|leaving\s+cs|quitting)\b/i,
  /\baccidentally\s+reported\s+you\b/i,
  /\b(?:airdrop|free\s+mint)\b/i,
  /\bwho\s+is\s+first\?\s*:\)/i,
];

/** Where a scam gets cut short: "bit.ly" links hide the real address. */
const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rb.gy", "shorturl.at", "tiny.cc", "rebrand.ly", "ow.ly", "t.ly", "u.to", "clck.ru", "qr.ae"];

const MARKDOWN_LINK = /\[([^\]]{0,300})\]\(\s*<?([^)\s>]+)>?\s*\)/g;
const BARE_LINK = /\b((?:https?:\/\/|www\.)[^\s<>()[\]"']+)/gi;

/** The host of an address, lowercase and without "www." (undefined if it isn't a web address). */
export function hostOf(address: string): string | undefined {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(address) ? address : `https://${address}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  return host.includes(".") ? host : undefined;
}

/** Every web link in a message: [shown](address) links and bare addresses, plus attachments' addresses. */
export function findLinks(text: string, extra: readonly string[] = []): FoundLink[] {
  const links: FoundLink[] = [];
  const seen = new Set<string>();
  const add = (address: string, shown?: string) => {
    const clean = address.replace(/[.,!?;:]+$/, "");
    const host = hostOf(clean);
    if (!host) return;
    const key = `${clean}|${shown ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ url: /^https?:\/\//i.test(clean) ? clean : `https://${clean}`, host, shown });
  };
  let rest = text;
  for (const m of text.matchAll(MARKDOWN_LINK)) {
    if (/^root:\/\//i.test(m[2])) continue;
    add(m[2], m[1]);
    rest = rest.replace(m[0], " ");
  }
  for (const m of rest.matchAll(BARE_LINK)) add(m[1]);
  for (const address of extra) if (/^https?:\/\//i.test(address)) add(address);
  return links;
}

/** "steamcommunity.com" from "trade.steamcommunity.com"; "bbc.co.uk" from "news.bbc.co.uk". */
export function siteOf(host: string): string {
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const second = parts[parts.length - 2];
  const top = parts[parts.length - 1];
  const keep = top.length === 2 && ["co", "com", "org", "net", "gov", "ac", "edu", "ne", "or"].includes(second) ? 3 : 2;
  return parts.slice(-keep).join(".");
}

function isOfficial(host: string, sites: readonly string[]): boolean {
  return sites.some((s) => host === s || host.endsWith(`.${s}`));
}

const OFFICIAL_ANY = Object.values(BRANDS).flat();

/** Folds the swaps lookalikes use (0 for o, rn for m, vv for w…) so "dlscord" and "steamcommunlty" line up with the real names. */
export function foldLookalikes(word: string): string {
  return word
    .toLowerCase()
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/cl/g, "d")
    .replace(/[0]/g, "o")
    .replace(/[1l|!]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4@]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t");
}

/** Edit distance (a swap of two neighbours, like "dicsord", counts as one edit), capped: anything past `cap` is cap + 1. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      best = Math.min(best, v);
    }
    if (best > cap) return cap + 1;
  }
  return Math.min(d[a.length][b.length], cap + 1);
}

/** Brands whose names are distinctive enough that a near miss means an imitation (not "steam", which is one letter from "stream"). */
const FUZZY_BRANDS = ["discord", "steamcommunity", "steampowered", "roblox", "epicgames", "paypal", "minecraft", "riotgames", "metamask", "opensea", "youtube"];

/**
 * The brand a word imitates (a near miss, not the name itself), if any.
 * `exact`: the word is the brand once lookalike letters are folded back
 * (dlscord, disc0rd); otherwise it's just a letter or two off (dicsord).
 */
export function imitatedBrand(word: string): { brand: string; exact: boolean } | undefined {
  if (word.length < 5) return undefined;
  const folded = foldLookalikes(word);
  for (const brand of Object.keys(BRANDS)) {
    if (word === brand) continue;
    if (folded === brand) return { brand, exact: true };
  }
  for (const brand of FUZZY_BRANDS) {
    if (word === brand || folded === brand) continue;
    const allowed = brand.length >= 9 ? 2 : 1;
    if (Math.abs(folded.length - brand.length) <= allowed && editDistance(folded, brand, allowed) <= allowed) return { brand, exact: false };
  }
  return undefined;
}

const titleCase = (brand: string) =>
  ({ discord: "Discord", nitro: "Discord", steam: "Steam", steamcommunity: "Steam", steampowered: "Steam", epicgames: "Epic Games", rootapp: "Root", paypal: "PayPal", riotgames: "Riot", metamask: "MetaMask", opensea: "OpenSea", github: "GitHub", youtube: "YouTube" })[brand] ??
  brand[0].toUpperCase() + brand.slice(1);

/** Checks one link. */
export function checkLink(link: FoundLink, messageText: string): ScamVerdict | undefined {
  const { host } = link;
  if (isOfficial(host, OFFICIAL_ANY)) {
    // A real site can still be the decoy: "[discord.com/gifts](real-site)" is checked below via the shown text.
    if (!link.shown) return undefined;
  }
  const site = siteOf(host);
  const tld = host.split(".").pop() ?? "";
  const tokens = host.split(/[.-]/).filter(Boolean);
  let pathAndQuery = "";
  try {
    const u = new URL(link.url);
    pathAndQuery = decodeURIComponent(u.pathname + u.search).toLowerCase();
  } catch {
    // Already parsed by hostOf, so this doesn't happen.
  }
  const words = new Set([...tokens, ...pathAndQuery.split(/[^a-z0-9]+/).filter(Boolean)]);
  const bait = BAIT.some((b) => words.has(b));
  const cheap = CHEAP_TLDS.includes(tld);

  // 1. Text that shows one site while the link goes to another.
  if (link.shown) {
    const shownHost = hostOf(link.shown.trim());
    if (shownHost && siteOf(shownHost) !== site) {
      const pretends = Object.entries(BRANDS).find(([, sites]) => isOfficial(shownHost, sites));
      // youtube.com shown for a youtu.be link is the same company.
      if (pretends && isOfficial(host, pretends[1])) return undefined;
      return {
        confidence: pretends ? "high" : "medium",
        reason: pretends ? `that link pretends to go to ${titleCase(pretends[0])} but doesn't` : "that link shows one address but goes somewhere else",
        signal: `masked link: shows ${shownHost}, goes to ${host}`,
        host,
      };
    }
    if (isOfficial(host, OFFICIAL_ANY)) return undefined;
  }

  // 2. Lookalikes of a brand's name: dlscord, steamcommunlty, disc0rd-gift.
  for (const token of tokens.slice(0, -1)) {
    const near = imitatedBrand(token);
    if (near) {
      const sure = near.exact || bait || cheap;
      return {
        confidence: sure ? "high" : "medium",
        reason: `that link imitates ${titleCase(near.brand)}: it looks like a fake site`,
        signal: `lookalike of ${near.brand}: ${host}`,
        host,
      };
    }
  }

  // 3. A brand's name on someone else's site, with gift bait or a throwaway ending.
  const brandToken = tokens.slice(0, -1).find((t) => t in BRANDS);
  if (brandToken && !isOfficial(host, BRANDS[brandToken])) {
    if (bait || cheap) {
      return {
        confidence: "high",
        reason: `that link pretends to be ${titleCase(brandToken)}: it's a fake page`,
        signal: `${brandToken} name on ${host}${bait ? " with gift words" : ""}${cheap ? ` (.${tld})` : ""}`,
        host,
      };
    }
  }

  // 4. Names that run the brand into another word: "discordnitro.app", "steamgift-free.com".
  const brandInside = tokens.slice(0, -1).find((t) => Object.keys(BRANDS).some((b) => t !== b && t.includes(b) && BAIT.some((w) => t.includes(w))));
  if (brandInside) {
    return { confidence: "high", reason: "that link is a fake gift page", signal: `gift bait in ${host}`, host };
  }

  // 5. Punycode lookalikes (xn--) of anything, and gift bait behind a shortener or a throwaway site.
  const baitText = BAIT_PHRASES.some((p) => p.test(messageText));
  if (tokens.some((t) => t.startsWith("xn--"))) {
    return { confidence: baitText ? "high" : "medium", reason: "that link uses lookalike letters to hide where it goes", signal: `punycode host ${host}`, host };
  }
  if (baitText && (SHORTENERS.includes(site) || cheap || bait)) {
    return { confidence: "high", reason: "that looks like a fake gift scam", signal: `gift bait with ${host}`, host };
  }
  return undefined;
}

/** The scam shield's verdict on a message (its text plus any attachment or link addresses). */
export function checkScam(text: string, extra: readonly string[] = []): ScamVerdict | undefined {
  let best: ScamVerdict | undefined;
  for (const link of findLinks(text, extra).slice(0, 20)) {
    const v = checkLink(link, text);
    if (v && (!best || (v.confidence === "high" && best.confidence !== "high"))) best = v;
    if (best?.confidence === "high") break;
  }
  return best;
}

/** Whether a message has any web link at all (for the newcomer link guard). */
export function hasLink(text: string, extra: readonly string[] = []): boolean {
  return findLinks(text, extra.filter((u) => /^https?:\/\//i.test(u))).length > 0;
}
