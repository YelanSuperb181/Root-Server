# ✨ Bich ass bitchess, on Root

The Discord server, moved to [Root](https://www.rootapp.com): same categories, same channels, same roles, plus **Wisp**, a Root App that builds the whole thing with one command, hangs around being useful, and has a glowing little domain of its own you can drag it around in.

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
| 🔮 **Its domain** | Wisp's own channel: a round, glowing window where it floats, zooms around and does tricks. Drag it, fling it, slam it, poke it, or pin it to the wall until the bubble bursts into fullscreen. Everyone inside sees the same Wisp, live. |
| 💬 **Talk to it** | Say "wisp" in any chat (or @mention it, or reply to it) and Wisp reacts: an emoji on your message, a little line back, and in the domain everyone watches your message fly in and Wisp react to it. |
| 🛠️ **Builds the server** | `!setup` previews, `!setup confirm` builds every category, channel and role in a couple of minutes. It only ever creates (never deletes or renames), matches anything that already exists by name, and can be re-run anytime. |
| 🗣️ **Quote wall** | React 🗣️ on anything someone says. At 2 reactions (not counting whoever said it) Wisp saves it to `#quotes` with a live count. `!quote` pulls a random one back up. Nothing from `#the-vent-aka-hell` is ever quoted. |
| 🎂 **Birthdays** | `!birthday July 14`, then a shout-out in `#birthdays` and the **Birthday Bitch** role for 24 hours. No birth year is ever asked for. |
| 📊 **Polls** | `!poll 1h Movie night? \| Shrek \| Shrek 2`: reaction votes, auto-close and a results card. |
| ✨ **Levels** | XP for chatting (once a minute, so spam doesn't count), `!rank` and `!top`. Level-ups are announced in `#bot-commands`. The vent and bot channels earn nothing. |
| 👋 **Welcomes** | New people get **Bitches** automatically and a welcome in `#bitches-yapping`. |
| 🤖 **Takes over for Dyno** | Light auto-mod (floods, copy-paste spam, mass mentions) with a log of joins, leaves and removals in `#dyno-status`. |
| 🎲 **Toys** | `!8ball`, `!roll`, `!flip`, `!choose`. |
| 📣 **For the Bitchiest Bitch** | `!announce`, `!say`, `!clear`, and `!setxp` to carry Discord levels over. |

## Wisp's domain

Type `!wisp` anywhere and Wisp replies with a link into its domain. Inside:

- **Drag** to carry Wisp around. It trails after your pointer like it's on a string.
- **Let go mid-swing** to fling it. It coasts, bounces off the rim, then drifts back to the middle.
- **Slam it into the wall**, thrown or still in your hand: the rim ripples, Wisp squashes and goes `> <`. Hit it hard enough and it sees stars.
- **Tap** to poke it. Poke it a few times fast and it gets the giggles; keep going and it gets grumpy. Rest your pointer on it to pet it.
- **Talk to it** with the message box under the domain.
- **Hold it against the wall… if you dare.** The wall bulges, cracks spread from where Wisp is pressing, Wisp strains and sweats, and after a couple of seconds the bubble shatters: glass flies, the window falls away, and the domain fills the whole screen (fullscreen, where Root allows it). **Seal the bubble** puts it back; it also re-forms on its own after two quiet minutes.
- Leave it alone and it does tricks on its own: loop-de-loops, spins, hops, zooming laps, the odd heart drawn in the air. After a while it dozes off. Any touch wakes it.

### Talking to Wisp

Wisp reads the mood of what you say and acts it out. Some of what it picks up on:

| Say something like… | Wisp… |
| --- | --- |
| "hi wisp", "hey" | lights up and comes to say hi: "hii!!" |
| "i love you wisp", "<3" | heart eyes, hearts everywhere, draws a heart in the air |
| "wisp ur so cute" | blushes and hides behind the edge of its bubble |
| "lmao", "😭" | laughs |
| "WISP LETS GOOO" | star eyes, zooms laps around the domain |
| "wisp i'm sad" | floats over for a hug |
| "wisp you're stupid" | puffs up, goes red and darts away: "hmph!" |
| "boo!" | gets scared |
| "gn wisp" | yawns and falls asleep |
| "wisp spin", "do a loop", "dance", "zoomies" | does the trick (unless it's sulking) |

In chat, Wisp leaves a matching emoji on your message and, at most once every 25 seconds per channel, a little line back ("hii!! *floats closer*"). In the domain, everyone sees your message arrive at the top and fly over to Wisp. Messages from `#the-vent-aka-hell` never show up in the domain; Wisp only reacts to them in chat.

One person holds Wisp at a time; everyone else sees who's carrying it. If Wisp's server can't be reached (or you open the domain outside Root), it runs solo: the same Wisp, just yours. **[Try it in your browser](https://claude.ai/artifact/JjoXEpCC6r2eeme9ZjCi57)**.

Root Apps live inside their own channel, so the domain is a channel rather than a window over the rest of Root. Bursting the bubble is how it gets as big as Root lets it.

## Quick start

> Full walkthrough: **[docs/SETUP-GUIDE.md](docs/SETUP-GUIDE.md)**.

1. **Create a fresh Root community.**
2. **Register Wisp** as an **App** in the Root Developer Portal and paste its App ID into [`wisp/root-manifest.json`](wisp/root-manifest.json).
3. **Build it:**
   ```bash
   cd wisp
   npm install
   npm run build     # networking, physics, server and the domain client
   npm test          # validates the template and runs the unit tests
   ```
4. **Try it in your test community:** put your `DEV_TOKEN` in `wisp/server/.env`, run `npm run server`, and type `!setup` (then `!setup confirm`) in any channel. In a second terminal, `npm run client` serves the domain for Root's dev mode.
5. **Go live:** `npm run package`, upload `wisp.rootpkg`, install Wisp in the real community, and run `!setup confirm` there.

## Before you build: the mailboxes

This repository is public, so the personal mailbox channels (one per person, named after them) aren't in it. They live in `wisp/server/src/blueprint/mailboxes.local.ts`, a file git never uploads:

1. Copy [`mailboxes.local.example.ts`](wisp/server/src/blueprint/mailboxes.local.example.ts) to `mailboxes.local.ts` in the same folder.
2. Add one line per person, using the exact channel names from Discord.

Without that file, setup creates only `#to-all-bitches` in that category.

Two smaller differences from Discord: there's one `#bot-commands` instead of two (without the emoji their names were identical), and Discord's built-in Events and Server Boosts don't exist on Root.

## Make it yours

| File | What's in it |
| --- | --- |
| [`wisp/server/src/blueprint/layout.ts`](wisp/server/src/blueprint/layout.ts) | Categories, channels, roles, colors and permissions |
| [`wisp/server/src/blueprint/content.ts`](wisp/server/src/blueprint/content.ts) | The pinned how-to posts Wisp puts in its channels |
| [`wisp/server/src/config.ts`](wisp/server/src/config.ts) | Prefix, quote emoji and threshold, levels, birthdays, auto-mod, where things get posted |
| [`wisp/server/src/content/lines.ts`](wisp/server/src/content/lines.ts) | Wisp's welcome lines, level-up lines and 8-ball answers |
| [`wisp/shared/src/physics.ts`](wisp/shared/src/physics.ts) | How Wisp moves in its domain: drift, drag, bounce, slam, how fast the wall cracks |
| [`wisp/shared/src/mood.ts`](wisp/shared/src/mood.ts) | The words Wisp reacts to, its lines back, and its chat emoji |
| [`wisp/shared/src/tricks.ts`](wisp/shared/src/tricks.ts) | Wisp's tricks: loops, spins, zooms, the heart |
| [`wisp/client/src/style.css`](wisp/client/src/style.css) | The domain window's look |

Change them, run `npm run build && npm test`, then `!setup` again; it only adds what's new. Recipes: **[docs/CUSTOMIZING.md](docs/CUSTOMIZING.md)**. All commands: **[docs/COMMANDS.md](docs/COMMANDS.md)**.

## Project layout

```
wisp/
├── root-manifest.json          App ID, version and the permissions Wisp asks for
├── networking/src/domain.proto the domain's live messages (grab, drag, throw, poke, state)
├── shared/src/                 run identically by the server and every window:
│   ├── physics.ts              Wisp's physics, the wall cracking and the burst
│   ├── tricks.ts               loops, spins, zooms, hops, the heart
│   └── mood.ts                 how Wisp reads what people say to it
├── server/                     the App's server: everything that happens in chat, plus the shared Wisp
│   ├── src/
│   │   ├── blueprint/          ⭐ the server template (layout, posts, permissions, validation, setup planner)
│   │   ├── config.ts           ⭐ settings
│   │   ├── domain/             the one true Wisp, who's holding it, its tricks, the burst, chat reactions and !wisp
│   │   ├── content/            Wisp's lines, 8-ball answers, a question pool (question of the day is off)
│   │   ├── core/               rate-limited API calls, commands, storage, IDs, jobs
│   │   ├── features/           setup, welcome, quote wall, levels, birthdays, polls, automod, staff, fun
│   │   ├── logic/              pure helpers (parsing, XP math, automod checks, polls, dates)
│   │   └── main.ts             wiring
│   ├── test/                   unit tests (node:test)
│   └── scripts/render-layout.ts  generates docs/SERVER-LAYOUT.md
└── client/                     the domain window, shown in Wisp's channel: faces, effects, cracks, the shatter
docs/                           setup guide, commands, customizing, layout
```

Built on the official [Root SDK](https://docs.rootapp.com) 0.21 (`@rootsdk/server-app` and `@rootsdk/client-app`). Root runs Wisp for you once it's uploaded, and each community gets its own private data store.
