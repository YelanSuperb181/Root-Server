# Making it yours

The whole server is defined in a few files. After any change:

```bash
cd blitz
npm run build
npm test          # catches typos: unknown roles, bad channel names, broken references
npm run docs      # optional: regenerates docs/SERVER-LAYOUT.md
```

Then restart Blitz (or upload a new version, remembering to bump the version number) and run `!setup` in Root. Setup **only adds** what's missing. It never deletes, renames or re-permissions things that already exist, so it's safe to run as often as you like.

| File | Change it to… |
| --- | --- |
| [`blitz/server/src/blueprint/layout.ts`](../blitz/server/src/blueprint/layout.ts) | add, remove or rename categories, channels and roles; change colors and permissions |
| [`blitz/server/src/blueprint/content.ts`](../blitz/server/src/blueprint/content.ts) | rewrite the pinned how-to notes |
| [`blitz/server/src/config.ts`](../blitz/server/src/config.ts) | tune features: prefix, quote wall, XP, birthdays, auto-mod, where things post |
| [`blitz/server/src/content/lines.ts`](../blitz/server/src/content/lines.ts) | Blitz's welcome lines, level-up lines and 8-ball answers |
| [`blitz/shared/src/physics.ts`](../blitz/shared/src/physics.ts) | how Blitz moves in its domain |
| [`blitz/client/src/`](../blitz/client/src/) | the domain window: its look (`style.css`) and how Blitz is drawn (`domain.ts`) |

## Recipes

### Add a mailbox for someone new

In `blitz/server/src/blueprint/mailboxes.local.ts` (kept off GitHub; copy it from `mailboxes.local.example.ts` if you don't have it yet), add a line:

```ts
{ key: "mail-sam", name: "sam-the-new-guy", type: "text", topic: "🌻 Sam's mailbox." },
```

Keys just need to be unique; names can only use letters, digits and single hyphens (a Root rule; `npm test` checks it). Then `!setup confirm`.

### Rename things

Rename freely **in Root**: Blitz remembers everything by ID, not by name. To rename in the template too (so the docs and a future fresh setup match), change `name` but keep the `key` the same.

### Change the quote wall

In `config.ts` under `starboard`:
- `threshold`: how many reactions (not counting the author's own) it takes. Default 2.
- `emoji`: the reaction that counts. It needs both the [shortcode name](https://github.com/iamcal/emoji-data) and the character, like `{ code: "star", glyph: "⭐" }`.
- `ignore`: channels that can never be quoted. Keep `the-vent-aka-hell` in there.

### Give out roles for levels

Add a role to `layout.ts`:

```ts
{ key: "yapper", name: "Certified Yapper", color: "#5EB1EF", category: "level", description: "Reached level 10.", mentionable: false, selfAssignable: false },
```

then point a reward at it in `config.ts`: `rewards: [{ level: 10, role: "yapper" }]`. Set `stackRewards: true` if people should keep every reward instead of only their highest.

### Turn on the question of the day

Add a channel for it in `layout.ts` (or reuse one), then in `config.ts` set `questionOfTheDay.enabled: true` and `channel` to that channel's key. 115 questions are built in; the team can queue their own with `!qotd add`.

### Make a channel read-only

Give it the same `access` as `#announcements` in `layout.ts` (`access: staffPost`), then run `!setup permissions`.

### Change when birthdays are announced

`daily.hourUtc` in `config.ts`, as a UTC hour (0-23). 16 is 9am in Los Angeles and noon in New York (summer time). Blitz reschedules itself on the next start.

### Block words

Add them to `automod.blockedWords` in `config.ts`. Matching is whole-word and case-insensitive; end a word with `*` to also match longer forms (`scam*` catches "scammer"). The Bitchiest Bitch and admins are never filtered.

### Change Blitz's personality

Edit [`content/lines.ts`](../blitz/server/src/content/lines.ts). `{user}` becomes a mention and `{community}` the server's name; one line is picked at random each time.

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

### Change Blitz's personality (its brain)

With Claude as Blitz's brain, who Blitz is lives in `personaPrompt` in [`brain.ts`](../blitz/shared/src/brain.ts): how it talks, what it knows about its world, and how it should answer. It's plain writing; change it like you'd brief a friend. Keep the "How to answer" part, since Blitz's server relies on those fields.

In `config.ts` under `brain`:

| Setting | What it does |
| --- | --- |
| `model` | Which Claude model answers (`claude-opus-5-5` by default) |
| `effort` | How hard it thinks first: `"low"` is quick and cheap, `"medium"`/`"high"` are slower and more thoughtful |
| `maxPerHour` | A cap on answers across the community; keywords after that |
| `contextMessages`, `memory` | How much of the channel, and of its own past exchanges, Blitz reads |
| `replyCooldownSeconds` | At most one chat reply per channel this often |
| `skipIn` | Channels never sent to Claude |

### Teach Blitz new words (the keyword fallback)

[`mood.ts`](../blitz/shared/src/mood.ts) has the lists. `FEELINGS` maps words and emoji to a mood (checked top to bottom, first match wins), `REQUESTS` maps words to tricks ("spin", "dance"), and `LINES` holds what Blitz says back for each mood. `MOOD_EMOJI` is the reaction it leaves in chat; use the shortcode names Root uses for reactions (`two_hearts`, `sparkles`). Add a case to `blitz/server/test/mood.test.ts` for anything you add, so a later change can't quietly break it.

### Quiet Blitz down in chat

In `config.ts` under `domain`: `replyInChat: false` keeps the emoji reactions but drops the little lines back, `replyCooldownSeconds` spaces them out, `listen: false` turns chat reactions off entirely, and `quietIn` lists channels whose messages never show up in the domain (the vent, to start with).

## How permissions work

Each category and channel can have **access rules**: per-role "allow" or "deny" switches that sit on top of a role's normal permissions. The template uses presets from [`permissions.ts`](../blitz/server/src/blueprint/permissions.ts):

| Preset | Effect |
| --- | --- |
| `READ_ONLY` | Can read and react, but not post |
| `CAN_POST` | Can post (and pin); used for the Bitchiest Bitch in read-only channels |
| `HIDE` / `SHOW` | Can't / can see the channel |
| `LISTEN_ONLY` / `CAN_SPEAK` | Voice: can't / can talk and stream |

A channel with its own `access` stops sharing its category's permissions (Root ignores channel rules otherwise), so Blitz copies the category's rules onto it first and then adds the channel's own. [`rules.ts`](../blitz/server/src/blueprint/rules.ts) has the logic and [`blueprint.test.ts`](../blitz/server/test/blueprint.test.ts) shows the expected results.

There's also an optional **onboarding gate** (`onboarding.gate` in `config.ts`): categories marked `membersOnly: true` stay hidden until a newcomer reacts ✅ on a rules post. It's off, since this is a friend group.

Admins have full control and see everything regardless of rules.
