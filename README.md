# ✨ Bich ass bitchess, on Root

The Discord server, moved to [Root](https://www.rootapp.com): same categories, same channels, same roles, plus **Wisp**, a bot that builds the whole thing with one command and then hangs around being useful.

```
IMPORTANT!!!               ZE SOCIAL PLACE        BITCH MAILING SERVICE      BITCHES PLAYING MINECRAFT
  #announcements ‼️          #bitches-yapping ✨     #to-all-bitches 📬          #minecraft-chat
  #polls 📊                  #games 🎮               + a mailbox per person     #minecraft-pics 📷
  #freakiest-freakstars 👅   #fm-bot 🎶                                         #minecraft-coords 🗺️
  #jockie-music-status 🎵    #bot-commands 💡       YAP... WITH YOUR VOICES      #realm-finance 💸
  #dyno-status 🤖            #availability            #music 💫
  #birthdays 🎂                                       🔊 bitches-endlessly-     BITCHES PLAYING TERRARIA
  #personality-types 🧬    OTHER                         bitching 🌟              #yappity-yap 🫧
  #quotes 🗣️                 #the-vent-aka-hell 👁️                              #info 😳

Roles: Bitchiest Bitch · Bitches · Birthday Bitch
```

Root channel names can only use letters, digits and hyphens, so each channel's emoji moves to the start of its description. Every channel, role and permission is listed in [docs/SERVER-LAYOUT.md](docs/SERVER-LAYOUT.md).

## What Wisp does

| | |
| --- | --- |
| 🛠️ **Builds the server** | `!setup` previews, `!setup confirm` builds every category, channel and role in a couple of minutes. It only ever creates (never deletes or renames), matches anything that already exists by name, and can be re-run anytime. |
| 🗣️ **Quote wall** | React 🗣️ on anything someone says. At 2 reactions (not counting whoever said it) Wisp saves it to `#quotes` with a live count. `!quote` pulls a random one back up. Nothing from `#the-vent-aka-hell` is ever quoted. |
| 🎂 **Birthdays** | `!birthday July 14`, then a shout-out in `#birthdays` and the **Birthday Bitch** role for 24 hours. No birth year is ever asked for. |
| 📊 **Polls** | `!poll 1h Movie night? \| Shrek \| Shrek 2`: reaction votes, auto-close and a results card. |
| ✨ **Levels** | XP for chatting (once a minute, so spam doesn't count), `!rank` and `!top`. Level-ups are announced in `#bot-commands`. The vent and bot channels earn nothing. |
| 👋 **Welcomes** | New people get **Bitches** automatically and a welcome in `#bitches-yapping`. |
| 🤖 **Takes over for Dyno** | Light auto-mod (floods, copy-paste spam, mass mentions) with a log of joins, leaves and removals in `#dyno-status`. |
| 🎲 **Toys** | `!8ball`, `!roll`, `!flip`, `!choose`. |
| 📣 **For the Bitchiest Bitch** | `!announce`, `!say`, `!clear`, and `!setxp` to carry Discord levels over. |

## Wisp's domain (next up)

Summon Wisp with `!wisp` and it posts a link that opens **its domain**: a round, glowing window where Wisp floats, drifts, gets dragged and flung, and bounces off the rim. Everyone in the domain sees the same Wisp. **[Try the prototype](https://claude.ai/artifact/JjoXEpCC6r2eeme9ZjCi57)**.

On Root, this needs Wisp to become a **Root App** (a bot with its own screen) instead of a plain bot. An App lives in its own channel; Root doesn't let anything float on top of its own interface. The plan:

1. Turn the bot into an App, keeping everything it already does.
2. Add an app channel, `#wisps-domain`, for the domain screen (the prototype's code becomes its client).
3. Sync Wisp between everyone watching through the App's live connection, and add `!wisp` to summon the link.

## Quick start

> Full walkthrough: **[docs/SETUP-GUIDE.md](docs/SETUP-GUIDE.md)**.

1. **Create a fresh Root community.**
2. **Register Wisp** in the Root Developer Portal and paste its App ID into [`bot/root-manifest.json`](bot/root-manifest.json).
3. **Build it:**
   ```bash
   cd bot
   npm install
   npm test          # validates the template and runs the unit tests
   npm run build
   ```
4. **Try it in your test community:** put your `DEV_TOKEN` in `bot/.env`, run `npm run bot`, and type `!setup` (then `!setup confirm`) in any channel.
5. **Go live:** package and upload Wisp, install it in the real community, and run `!setup confirm` there.

## Before you build: the mailboxes

This repository is public, so the personal mailbox channels (one per person, named after them) aren't in it. They live in `bot/src/blueprint/mailboxes.local.ts`, a file git never uploads:

1. Copy [`mailboxes.local.example.ts`](bot/src/blueprint/mailboxes.local.example.ts) to `mailboxes.local.ts` in the same folder.
2. Add one line per person, using the exact channel names from Discord.

Without that file, setup creates only `#to-all-bitches` in that category.

Two smaller differences from Discord: there's one `#bot-commands` instead of two (without the emoji their names were identical), and Discord's built-in Events and Server Boosts don't exist on Root.

## Make it yours

| File | What's in it |
| --- | --- |
| [`bot/src/blueprint/layout.ts`](bot/src/blueprint/layout.ts) | Categories, channels, roles, colors and permissions |
| [`bot/src/blueprint/content.ts`](bot/src/blueprint/content.ts) | The pinned how-to posts Wisp puts in its channels |
| [`bot/src/config.ts`](bot/src/config.ts) | Prefix, quote emoji and threshold, levels, birthdays, auto-mod, where things get posted |
| [`bot/src/content/lines.ts`](bot/src/content/lines.ts) | Wisp's welcome lines, level-up lines and 8-ball answers |

Change them, run `npm test`, then `!setup` again; it only adds what's new. Recipes: **[docs/CUSTOMIZING.md](docs/CUSTOMIZING.md)**. All commands: **[docs/COMMANDS.md](docs/COMMANDS.md)**.

## Project layout

```
bot/
├── root-manifest.json        App ID, version and the permissions Wisp asks for
├── src/
│   ├── blueprint/            ⭐ the server template (layout, posts, permissions, validation, setup planner)
│   ├── config.ts             ⭐ settings
│   ├── content/              Wisp's lines, 8-ball answers, a question pool (question of the day is off)
│   ├── core/                 rate-limited API calls, commands, storage, IDs, jobs
│   ├── features/             setup, welcome, quote wall, levels, birthdays, polls, automod, staff, fun
│   ├── logic/                pure helpers (parsing, XP math, automod checks, polls, dates)
│   └── main.ts               wiring
├── test/                     unit tests (node:test)
└── scripts/render-layout.ts  generates docs/SERVER-LAYOUT.md
docs/                         setup guide, commands, customizing, layout
```

Built on the official [Root SDK](https://docs.rootapp.com) (`@rootsdk/server-bot` 0.21). Root runs the bot for you once it's uploaded, and each community gets its own private data store.
