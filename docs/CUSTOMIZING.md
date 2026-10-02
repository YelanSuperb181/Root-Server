# Making it yours

Two kinds of changes:

- **Per community**, by its admins, on Blitz's App settings page in Root: which channels Blitz posts in, which roles it hands out, who's staff, what's switched on. Nothing to rebuild. See the [setup guide](SETUP-GUIDE.md#install-it-and-set-it-up).
- **For every community**, in the code, by you. After a change:

```bash
cd blitz
npm run check     # builds everything and runs the tests
```

Then restart `npm run server` to try it, and `npm run upload` to send the new version to Root.

| File | Change it to… |
| --- | --- |
| [`blitz/root-manifest.json`](../blitz/root-manifest.json) | change what's on the settings page, or the permissions Blitz asks for |
| [`blitz/server/src/config.ts`](../blitz/server/src/config.ts) | tune defaults: prefix, XP per message, auto-mod limits, birthday time, the brain |
| [`blitz/server/src/content/lines.ts`](../blitz/server/src/content/lines.ts) | Blitz's welcome lines, level-up lines, birthday lines and 8-ball answers |
| [`blitz/shared/src/brain.ts`](../blitz/shared/src/brain.ts) | Blitz's personality, for its brain |
| [`blitz/shared/src/physics.ts`](../blitz/shared/src/physics.ts) | how Blitz moves in its domain |
| [`blitz/client/src/`](../blitz/client/src/) | the domain window: its look (`style.css`) and how Blitz is drawn (`domain.ts`) |

## Recipes

### Add a setting to the settings page

Settings are declared in `root-manifest.json` under `settings.groups`: each item has a `key`, a `title`, a `description` and a type (`channel`, `roleOrMember`, `checkbox`, `number`, `text`). The server reads them through [`core/settings.ts`](../blitz/server/src/core/settings.ts); add a getter there for the new one. Anything a community hasn't set yet comes back empty, so give every setting a sensible "off" or default.

### Change the quote wall's reaction

`starboard.emoji` in `config.ts`. It needs both the [shortcode name](https://github.com/iamcal/emoji-data) and the character, like `{ code: "star", glyph: "⭐" }`. How many reactions it takes is a setting each community picks.

### Change when birthdays are announced

`daily.hourUtc` in `config.ts`, as a UTC hour (0-23). 16 is 9am in Los Angeles and noon in New York (summer time). Blitz reschedules itself on the next start.

### Block words

Add them to `automod.blockedWords` in `config.ts`. Matching is whole-word and case-insensitive; end a word with `*` to also match longer forms (`scam*` catches "scammer"). Staff are never filtered.

### Change Blitz's lines

Edit [`content/lines.ts`](../blitz/server/src/content/lines.ts). `{user}` becomes a mention and `{community}` the community's name; one line is picked at random each time.

### Use a different command prefix

`prefix` in `config.ts`, for example `"?"` if another bot already uses `!`.

### Change how Blitz moves in its domain

The numbers at the top of [`physics.ts`](../blitz/shared/src/physics.ts). Distances are fractions of the domain's radius (the rim is at 1), times are in seconds:

| Setting | What it does |
| --- | --- |
| `ORB_RADIUS` | How big Blitz is |
| `MAX_FLING` | The fastest throw counts as this fast |
| `FLING_COAST` | How long a hard throw flies before Blitz drifts back to the middle |
| `IMPACT_MIN_FREE` / `IMPACT_MIN_HELD` | How hard a hit on the rim must be to ripple and bonk, thrown / while held |
| `POKE_SPEED` | How hard a poke pushes |
| `SLEEP_AFTER` | Seconds without a touch before Blitz dozes off |
| `OPEN_FOR` | Seconds without a touch before a burst bubble re-forms |
| `BURST_SPEED`, `BURST_COAST` | How hard the bursting bubble launches Blitz, and for how long |
| `STRAIN_BASE`, `STRAIN_PUSH`, `STRAIN_HEAL` | How fast the wall cracks while Blitz is pinned to it (about two seconds of hard shoving), and how fast it heals |
| `SPRING`, `BOUNCE_FREE`, `BOUNCE_HELD` | How tightly Blitz follows your pointer, and how bouncy the rim is |

The server and every window run this same file, so rebuild and re-upload everything after a change (`npm run package`). `npm test` checks that Blitz still can't escape the domain and that the wall takes about as long to burst as it should.

### Change the space rocks

Out in the universe, the rocks come from [`rocks.ts`](../blitz/shared/src/rocks.ts). Space is cut into square patches and each patch gets its rocks from a hash of where it is, so every screen has the same rocks without anything being sent.

| Setting | What it does |
| --- | --- |
| `ROCK_CELL` | How big a patch is. Smaller means more rocks, closer together |
| `ROCK_CLEAR` | How much empty space is left around where the bubble burst |
| `ROCK_MAX_R` | How big the biggest rocks get (also used to look for nearby rocks, so keep it at least as big as any rock) |
| the `count` line in `cellRocks` | How many rocks a patch gets (now: none in a quarter of patches, at most two). Two in one patch always keep their distance |
| `BOUNCE_ROCK` in `physics.ts` | How bouncy the rocks are |

`npm test` checks that the rocks are the same every time, never drift into each other, that Blitz bounces off them, and that it never ends up inside one. How they look is in [`rockart.ts`](../blitz/client/src/rockart.ts) (shapes, colors, craters, crystals).

### Change Blitz's personality (its brain)

With Claude as Blitz's brain, who Blitz is lives in `personaPrompt` in [`brain.ts`](../blitz/shared/src/brain.ts): how it talks, what it knows about its world, and how it should answer. It's the same in every community; it also reads each community's name, channels and "About this community" setting. It's plain writing; change it like you'd brief a friend. Keep the "How to answer" part, since Blitz's server relies on those fields.

In `config.ts` under `brain`:

| Setting | What it does |
| --- | --- |
| `model` | Which Claude model answers (`claude-opus-5-5` by default) |
| `effort` | How hard it thinks first: `"low"` is quick and cheap, `"medium"`/`"high"` are slower and more thoughtful |
| `maxPerHour` | A cap on answers across the community; keywords after that |
| `contextMessages`, `memory` | How much of the channel, and of its own past exchanges, Blitz reads |
| `replyCooldownSeconds` | At most one chat reply per channel this often |

Channels a community marks private in Blitz's settings are never sent to Claude. Each community can also describe itself in the "About this community" setting, which Blitz's brain reads.

### Teach Blitz new words (the keyword fallback)

[`mood.ts`](../blitz/shared/src/mood.ts) has the lists. `FEELINGS` maps words and emoji to a mood (checked top to bottom, first match wins), `REQUESTS` maps words to tricks ("spin", "dance"), and `LINES` holds what Blitz says back for each mood. `MOOD_EMOJI` is the reaction it leaves in chat; use the shortcode names Root uses for reactions (`two_hearts`, `sparkles`). Add a case to `blitz/server/test/mood.test.ts` for anything you add, so a later change can't quietly break it.

### Quiet Blitz down in chat

In `config.ts` under `domain`: `replyInChat: false` keeps the emoji reactions but drops the little lines back, `replyCooldownSeconds` spaces them out, and `listen: false` turns chat reactions off entirely. Communities keep messages out of the domain by marking channels private.
