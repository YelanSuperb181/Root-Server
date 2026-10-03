import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScam, editDistance, findLinks, hasLink, imitatedBrand, siteOf } from "../src/logic/scams";
import { AutomodRules, checkContent, emojiCount, isShouting, isZalgo } from "../src/logic/automod";
import { RaidState, ladderStep, onJoin, raidActive, recordJoin, slowmodeWait } from "../src/logic/guardian";
import { userMention } from "../src/logic/text";

test("links are found bare, in [shown](address) form and from attachments", () => {
  const links = findLinks("look https://example.com/a, and [here](https://foo.bar/x) or www.site.org", ["https://cdn.root/x.png"]);
  assert.deepEqual(
    links.map((l) => [l.host, l.shown]),
    [
      ["foo.bar", "here"],
      ["example.com", undefined],
      ["site.org", undefined],
      ["cdn.root", undefined],
    ],
  );
  assert.equal(findLinks(userMention("Sam", "U1")).length, 0, "mentions aren't links");
  assert.equal(hasLink("no links here, just discord"), false);
});

test("sites: the part someone registered", () => {
  assert.equal(siteOf("trade.steamcommunity.com"), "steamcommunity.com");
  assert.equal(siteOf("news.bbc.co.uk"), "bbc.co.uk");
  assert.equal(siteOf("example.com"), "example.com");
});

test("edit distance counts a swap as one edit", () => {
  assert.equal(editDistance("dicsord", "discord"), 1);
  assert.equal(editDistance("discrd", "discord"), 1);
  assert.equal(editDistance("kitten", "sitting"), 3);
  assert.equal(editDistance("abcdef", "uvwxyz", 2), 3, "capped");
});

test("lookalike names are spotted, innocent near misses aren't", () => {
  assert.deepEqual(imitatedBrand("dlscord"), { brand: "discord", exact: true });
  assert.deepEqual(imitatedBrand("disc0rd"), { brand: "discord", exact: true });
  assert.deepEqual(imitatedBrand("steamcommunlty"), { brand: "steamcommunity", exact: true });
  assert.deepEqual(imitatedBrand("stearncommunity"), { brand: "steamcommunity", exact: true });
  assert.deepEqual(imitatedBrand("dicsord"), { brand: "discord", exact: false });
  for (const fine of ["stream", "switch", "intro", "discord", "github", "steam"]) assert.equal(imitatedBrand(fine), undefined, fine);
});

test("the scam shield catches fake gifts and lookalike sites", () => {
  const high = (text: string) => assert.equal(checkScam(text)?.confidence, "high", text);
  high("free nitro for everyone https://discord-gift.com/claim/abc");
  high("https://dlscord.com/nitro");
  high("trade me https://steamcommunlty.com/tradeoffer/new");
  high("https://discordnitro.app/promo");
  high("steam gift $50 https://bit.ly/3xYz who is first? :)");
  high("[discord.com/gifts/abc](https://nitro-drop.xyz/abc)");
  high("https://steam-rewards.ru/login");
});

test("the scam shield leaves real sites and ordinary links alone", () => {
  const none = (text: string) => assert.equal(checkScam(text), undefined, text);
  none("https://discord.com/invite/abc");
  none("https://discord.gift/AbCdEf123");
  none("watch https://youtu.be/dQw4w9WgXcQ");
  none("[youtube.com](https://youtu.be/dQw4w9WgXcQ)");
  none("guide: https://discord.js.org/docs");
  none("https://store.steampowered.com/app/620");
  none("my stream https://twitch.tv/someone and https://example.com/stream");
  none("the steam deck is great https://www.theverge.com/steam-deck-review");
  none("https://github.com/rootapp/sdk");
  none("free pizza friday!");
});

test("a link dressed up as another site is caught", () => {
  const v = checkScam("[https://example.com](https://other.net/page)");
  assert.equal(v?.confidence, "medium");
  assert.match(v?.signal ?? "", /masked/);
  assert.equal(checkScam("[example.com](https://www.example.com/page)"), undefined, "same site");
});

const rules: AutomodRules = { maxMentions: 8, spam: { messages: 7, seconds: 8 }, duplicates: { count: 4, seconds: 30 }, blockInviteLinks: false, blockedWords: [] };

test("glitch text is caught even without the strict filters", () => {
  const zalgo = "h̸̢̛̺͓e̴͍̪̎l̵̰̈́͝l̶̨̛o̷̭̿ ẃ̴̲o̸̳͝r̷̗̀l̵̙̂d̸̠̈́";
  assert.equal(isZalgo(zalgo), true);
  assert.equal(isZalgo("café naïve résumé"), false);
  assert.equal(checkContent(zalgo, rules)?.kind, "zalgo");
});

test("shouting, emoji floods and walls only count with the strict filters on", () => {
  const shout = "WHY IS NOBODY ANSWERING ME IN HERE";
  assert.equal(isShouting(shout), true);
  assert.equal(isShouting("OK LOL"), false, "too short to be shouting");
  assert.equal(checkContent(shout, rules), undefined);
  assert.equal(checkContent(shout, { ...rules, strict: true })?.kind, "caps");
  const emoji = "🎉".repeat(16);
  assert.equal(emojiCount(emoji + " :party: :wave:"), 18);
  assert.equal(checkContent(emoji, { ...rules, strict: true })?.kind, "emoji");
  assert.equal(checkContent("line\n".repeat(40), { ...rules, strict: true })?.kind, "wall");
});

test("raids: a burst of joins turns raid mode on once, and it holds", () => {
  const times: number[] = [];
  let state: RaidState = { until: 0, joined: [] };
  let starts = 0;
  for (let i = 0; i < 10; i++) {
    const n = recordJoin(times, 1000 + i * 2000);
    const r = onJoin(state, `u${i}`, n, 8, 1000 + i * 2000);
    state = r.state;
    if (r.started) starts++;
  }
  assert.equal(starts, 1);
  assert.equal(raidActive(state, 30_000), true);
  assert.ok(state.joined.includes("u9"));
  assert.equal(raidActive(state, 30_000 + 16 * 60_000), false, "it ends on its own");
  assert.equal(raidActive({ until: 0, joined: [], manual: true }, 1e12), true, "a manual raid waits for !raid off");
});

test("raids: joins spread out never trigger it", () => {
  const times: number[] = [];
  let state: RaidState = { until: 0, joined: [] };
  for (let i = 0; i < 30; i++) state = onJoin(state, `u${i}`, recordJoin(times, i * 20_000), 8, i * 20_000).state;
  assert.equal(raidActive(state, 30 * 20_000), false);
});

test("slowmode says how long to wait", () => {
  assert.equal(slowmodeWait(undefined, 30_000, 100), 0);
  assert.equal(slowmodeWait(1000, 30_000, 11_000), 20_000);
  assert.equal(slowmodeWait(1000, 30_000, 40_000), 0);
});

test("the warning ladder: mutes that grow, a kick once, then a ban", () => {
  const ladder = { muteAt: 3, kickAt: 5, banAt: 7 };
  assert.equal(ladderStep(2, ladder), undefined);
  assert.deepEqual(ladderStep(3, ladder), { action: "mute", ms: 3_600_000 });
  assert.deepEqual(ladderStep(4, ladder), { action: "mute", ms: 6 * 3_600_000 });
  assert.deepEqual(ladderStep(5, ladder), { action: "kick" });
  assert.equal(ladderStep(6, ladder)?.action, "mute");
  assert.deepEqual(ladderStep(7, ladder), { action: "ban" });
  assert.equal(ladderStep(9, { muteAt: 0, kickAt: 0, banAt: 0 }), undefined, "off");
});
