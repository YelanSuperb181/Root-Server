# Making it yours

The whole community is defined in three files. After any change:

```bash
cd bot
npm test          # catches typos: unknown roles, bad channel names, broken references
npm run build
npm run docs      # optional: regenerates docs/SERVER-LAYOUT.md
```

Then restart Sprout (or upload a new version, remembering to bump the version number) and run `!setup` in Root. Setup **only adds** what's missing. It never deletes, renames or re-permissions things that already exist, so it's safe to run as often as you like.

| File | Change it to… |
| --- | --- |
| [`bot/src/blueprint/layout.ts`](../bot/src/blueprint/layout.ts) | add, remove or rename channels, groups and roles; change colors and permissions |
| [`bot/src/blueprint/content.ts`](../bot/src/blueprint/content.ts) | rewrite the welcome guide and rules; change the role pickers |
| [`bot/src/config.ts`](../bot/src/config.ts) | tune features: prefix, gate, XP, stars, daily time, auto-mod |
| [`bot/src/content/`](../bot/src/content/) | add questions of the day, welcome lines, 8-ball answers |

## Recipes

### Describe your community in the welcome post

Open `content.ts`, find the post with `key: "welcome"`, and replace the "This is a friendly corner of the internet…" line with a sentence about your community. Run `!setup refresh` to update the post in place.

### Add a hobby channel with a pingable role

Say you want a book club:

1. In `layout.ts`, add a channel to the `interests` group:
   ```ts
   { key: "books", name: "book-club", type: "text", topic: "📚 What are you reading? Monthly picks and spoiler-free reviews." },
   ```
2. Add a role in the Interests section:
   ```ts
   { key: "bookworm", name: "Bookworm", category: "interest", description: "Always reading something.", mentionable: true, selfAssignable: true },
   ```
3. In `content.ts`, add it to the `interests` picker (the emoji needs both its [shortcode name](https://github.com/iamcal/emoji-data) and the character):
   ```ts
   { emoji: emoji("books", "📚"), role: "bookworm" },
   ```
4. `npm test`, build, restart, then `!setup confirm` (creates the channel and role) and `!setup refresh` (adds 📚 to the picker).

### Rename things

Rename freely **in Root**: Sprout remembers everything by ID, not by name. To rename in the blueprint too (so the docs and a future fresh setup match), change `name` but keep the `key` the same. Channel names can only use letters, digits and single hyphens (a Root rule; `npm test` checks it).

### Turn off the onboarding gate

In `config.ts`, set `onboarding.gate: false`. New members then see everything right away and get welcomed when they join. Best done **before** your first `!setup`. If setup already ran, also open each members-only group's permissions in Root and remove the rule that stops EVERYONE from viewing it.

### Change when the daily question posts

`daily.hourUtc` in `config.ts`, as a UTC hour (0-23). 16 is 9am in Los Angeles, noon in New York and 6pm in Berlin (summer time). Sprout reschedules itself on the next start.

### Change the level rewards

Edit `levels.rewards` in `config.ts`. Each reward needs a role in `layout.ts` with `category: "level"`. Set `stackRewards: true` if members should keep every reward instead of only their highest.

### Change the star threshold or where level-ups are announced

`starboard.threshold`, and `levels.announceIn` (a channel key, or `null` to announce in the channel where it happened).

### Block words

Add them to `automod.blockedWords` in `config.ts`. Matching is whole-word and case-insensitive; end a word with `*` to also match longer forms (`scam*` catches "scammer"). Staff are never filtered.

### Allow invite links

`automod.blockInviteLinks: false`.

### Add your own daily questions

Add lines to [`content/questions.ts`](../bot/src/content/questions.ts), or queue them live with `!qotd add …` (queued questions go first).

### Rename the bot

Change `botName` in `config.ts` (used in messages and the docs). The name members see on the bot's profile comes from the Root Developer Portal, so change it there too.

### Use a different command prefix

`prefix` in `config.ts`, for example `"?"` if another bot already uses `!`.

## How permissions work

Each group and channel can have **access rules**: per-role "allow" or "deny" switches that sit on top of a role's normal permissions. The blueprint uses a few presets from [`permissions.ts`](../bot/src/blueprint/permissions.ts):

| Preset | Effect |
| --- | --- |
| `READ_ONLY` | Can read and react, but not post |
| `CAN_POST` | Can post (and pin), used for staff in read-only channels |
| `HIDE` / `SHOW` | Can't / can see the channel |
| `LISTEN_ONLY` / `CAN_SPEAK` | Voice: can't / can talk and stream |

Groups marked `membersOnly: true` get the onboarding gate: hidden from EVERYONE, shown to **Member** and **Moderator**. A channel with its own `access` stops sharing its group's permissions (Root ignores channel rules otherwise), so Sprout copies the group's rules onto it first and then adds the channel's own. [`rules.ts`](../bot/src/blueprint/rules.ts) has the logic and [`blueprint.test.ts`](../bot/test/blueprint.test.ts) shows the expected results.

Admins have full control and see everything regardless of rules.
