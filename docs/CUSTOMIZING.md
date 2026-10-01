# Making it yours

The whole server is defined in a few files. After any change:

```bash
cd bot
npm test          # catches typos: unknown roles, bad channel names, broken references
npm run build
npm run docs      # optional: regenerates docs/SERVER-LAYOUT.md
```

Then restart Wisp (or upload a new version, remembering to bump the version number) and run `!setup` in Root. Setup **only adds** what's missing. It never deletes, renames or re-permissions things that already exist, so it's safe to run as often as you like.

| File | Change it to… |
| --- | --- |
| [`bot/src/blueprint/layout.ts`](../bot/src/blueprint/layout.ts) | add, remove or rename categories, channels and roles; change colors and permissions |
| [`bot/src/blueprint/content.ts`](../bot/src/blueprint/content.ts) | rewrite the pinned how-to notes |
| [`bot/src/config.ts`](../bot/src/config.ts) | tune features: prefix, quote wall, XP, birthdays, auto-mod, where things post |
| [`bot/src/content/lines.ts`](../bot/src/content/lines.ts) | Wisp's welcome lines, level-up lines and 8-ball answers |

## Recipes

### Add a mailbox for someone new

In `bot/src/blueprint/mailboxes.local.ts` (kept off GitHub; copy it from `mailboxes.local.example.ts` if you don't have it yet), add a line:

```ts
{ key: "mail-sam", name: "sam-the-new-guy", type: "text", topic: "🌻 Sam's mailbox." },
```

Keys just need to be unique; names can only use letters, digits and single hyphens (a Root rule; `npm test` checks it). Then `!setup confirm`.

### Rename things

Rename freely **in Root**: Wisp remembers everything by ID, not by name. To rename in the template too (so the docs and a future fresh setup match), change `name` but keep the `key` the same.

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

`daily.hourUtc` in `config.ts`, as a UTC hour (0-23). 16 is 9am in Los Angeles and noon in New York (summer time). Wisp reschedules itself on the next start.

### Block words

Add them to `automod.blockedWords` in `config.ts`. Matching is whole-word and case-insensitive; end a word with `*` to also match longer forms (`scam*` catches "scammer"). The Bitchiest Bitch and admins are never filtered.

### Change Wisp's personality

Edit [`content/lines.ts`](../bot/src/content/lines.ts). `{user}` becomes a mention and `{community}` the server's name; one line is picked at random each time.

### Use a different command prefix

`prefix` in `config.ts`, for example `"?"` if another bot already uses `!`.

## How permissions work

Each category and channel can have **access rules**: per-role "allow" or "deny" switches that sit on top of a role's normal permissions. The template uses presets from [`permissions.ts`](../bot/src/blueprint/permissions.ts):

| Preset | Effect |
| --- | --- |
| `READ_ONLY` | Can read and react, but not post |
| `CAN_POST` | Can post (and pin); used for the Bitchiest Bitch in read-only channels |
| `HIDE` / `SHOW` | Can't / can see the channel |
| `LISTEN_ONLY` / `CAN_SPEAK` | Voice: can't / can talk and stream |

A channel with its own `access` stops sharing its category's permissions (Root ignores channel rules otherwise), so Wisp copies the category's rules onto it first and then adds the channel's own. [`rules.ts`](../bot/src/blueprint/rules.ts) has the logic and [`blueprint.test.ts`](../bot/test/blueprint.test.ts) shows the expected results.

There's also an optional **onboarding gate** (`onboarding.gate` in `config.ts`): categories marked `membersOnly: true` stay hidden until a newcomer reacts ✅ on a rules post. It's off, since this is a friend group.

Admins have full control and see everything regardless of rules.
