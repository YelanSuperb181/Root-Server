# 🌱 Root Server Kit

Everything you need to move your community from Discord to [Root](https://www.rootapp.com) with a polished, lively space ready on day one.

- **A designed community.** 6 channel groups, 29 channels, 29 roles, an onboarding gate, role pickers, permissions and starter posts, all in one editable [blueprint](bot/src/blueprint/layout.ts).
- **Sprout 🌱, a Root Bot that builds it for you.** Type `!setup` and Sprout creates the whole thing in about two minutes. Then it keeps the place lively: welcomes, levels, a hall of fame, daily questions, birthdays, polls, suggestions and light auto-moderation.
- **A step-by-step move guide**, including announcement templates for your old Discord.

```
📌 START HERE           💬 COMMUNITY            🎯 INTERESTS           🔊 VOICE
  #welcome                #general               #gaming                🔊 lounge
  #rules ✅ (the door)    #introductions         #creative-corner       🔊 gaming-room
  #announcements          #daily-question 🌞     #tech-talk             🔊 music-and-chill
  #events                 #show-and-tell         #music                 🔊 focus-room
  #roles 🎭               #memes                 #movies-and-shows      🔊 stage 🎤
                          #celebrations 🎉       #food-and-drink
💡 FEEDBACK AND HELP      #hall-of-fame ⭐                              🛡️ STAFF (private)
  #suggestions            #bot-commands 🤖                               #staff-chat
  #help-desk                                                             #mod-log · 🔒 staff-room
```

Full details: [docs/SERVER-LAYOUT.md](docs/SERVER-LAYOUT.md) (every channel, role, permission and role picker).

## What makes it good

| | |
| --- | --- |
| 🚪 **Onboarding gate** | Newcomers land in **Start Here**, read the rules and react ✅ to unlock everything. Drive-by spam bots never reach your chats, and every new member gets a warm, randomized welcome in `#general` and a push notification pointing them to the rules. |
| 🎭 **Role pickers** | React-to-pick panels for interests (pingable, so `@Gamer anyone up for a match?` works), notification pings, pronouns and seven name colors. All roles are also self-assignable from members' profile cards, Root's native way. |
| 🌿 **Levels** | XP for chatting (once a minute, so spam doesn't pay), level-up shout-outs in `#celebrations`, and role rewards: **Regular** at 5, **Veteran** at 15 and **Legend** at 30. `!rank`, `!top`, and `!setxp` to carry levels over from Discord. |
| ⭐ **Hall of Fame** | Three ⭐ reactions from other members send a message to `#hall-of-fame` forever, with a live star count. |
| 🌞 **Question of the Day** | 115 hand-picked conversation starters, one per day, plus your team's own queue (`!qotd add`). |
| 🎂 **Birthdays** | `!birthday July 14`, then a shout-out and the **Birthday Star** role for 24 hours. No birth year is ever asked for. |
| 📊 **Polls** | `!poll 1h Pizza or tacos? \| Pizza \| Tacos`: reaction votes, auto-close and a results card with bars. |
| 💡 **Suggestions** | Type an idea in `#suggestions` and it becomes a numbered card with 👍/👎. The team marks it ✅ approved, 🛠️ in progress, 🚀 done or ❌ declined, and the author gets notified. |
| 🛡️ **Auto-mod** | Removes mass mentions, invite links, floods, copy-paste spam and your blocked words, explains why to the member, logs it in `#mod-log` and pings mods if someone keeps at it. |
| 🎤 **Stage and focus rooms** | Event voice where only hosts speak, and a co-working room for quiet company. |
| 🛠️ **Safe, repeatable setup** | `!setup` previews first and only ever *creates*. It never deletes or renames, matches what you already have by name, and reports what it couldn't do. Re-run it anytime to fill gaps. |

## Quick start

> **New to Root bots?** Follow the full walkthrough in **[docs/SETUP-GUIDE.md](docs/SETUP-GUIDE.md)**. The short version:

1. **Create your Root community** (a fresh one is best).
2. **Register Sprout** in the Root Developer Portal and paste its App ID into [`bot/root-manifest.json`](bot/root-manifest.json).
3. **Build it:**
   ```bash
   cd bot
   npm install
   npm test          # validates the blueprint and runs the unit tests
   npm run build
   ```
4. **Try it in your test community:** put your `DEV_TOKEN` in `bot/.env`, run `npm run bot`, and type `!setup` (then `!setup confirm`) in any channel.
5. **Go live:** package and upload Sprout, install it in your real community, and run `!setup confirm` there.
6. **Invite your people** with the [announcement templates](docs/SETUP-GUIDE.md#7-bring-everyone-over).

Prefer to build it by hand? [docs/SERVER-LAYOUT.md](docs/SERVER-LAYOUT.md) lists every channel, role and permission. If you build by hand with the same names, Sprout picks everything up when you install it later.

## Make it yours

Everything lives in three files. Change them, run `npm test`, then `!setup` again; it adds only what's new.

| File | What's in it |
| --- | --- |
| [`bot/src/blueprint/layout.ts`](bot/src/blueprint/layout.ts) | Channels, groups, roles, colors and permissions |
| [`bot/src/blueprint/content.ts`](bot/src/blueprint/content.ts) | The welcome guide, rules, role pickers and channel how-tos |
| [`bot/src/config.ts`](bot/src/config.ts) | Command prefix, onboarding gate, XP and level rewards, star threshold, daily-post time, auto-mod rules |

See **[docs/CUSTOMIZING.md](docs/CUSTOMIZING.md)** for recipes like adding a hobby channel, turning off the gate or changing the bot's name.

## Commands

The everyday ones: `!help` · `!rank` · `!top` · `!birthday` · `!poll` · `!suggest` · `!8ball` · `!roll` · `!flip` · `!choose`

For the team: `!announce` · `!event` · `!qotd` · `!approve` / `!decline` / `!wip` / `!done` · `!clear` · `!say` · `!setxp` · `!setup`

Full reference: **[docs/COMMANDS.md](docs/COMMANDS.md)**.

## Project layout

```
bot/
├── root-manifest.json        App ID, version and the permissions Sprout asks for
├── src/
│   ├── blueprint/            ⭐ the community design (layout, content, rules, validation, setup planner)
│   ├── config.ts             ⭐ tunables
│   ├── content/              question pool, welcome lines, 8-ball answers
│   ├── core/                 rate-limited API calls, commands, storage, IDs, jobs
│   ├── features/             setup, welcome, roles, levels, starboard, qotd, birthdays, polls, suggestions, automod, staff, fun
│   ├── logic/                pure helpers (parsing, XP math, automod checks, polls, dates)
│   └── main.ts               wiring
├── test/                     unit tests (node:test)
└── scripts/render-layout.ts  generates docs/SERVER-LAYOUT.md
docs/                         setup guide, commands, customizing, layout
```

Built on the official [Root SDK](https://docs.rootapp.com) (`@rootsdk/server-bot` 0.21). Root runs the bot for you once it's uploaded: no server to rent, and each community gets its own private data store.
