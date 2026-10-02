# ✨ Bich ass bitchess, on Root

The Discord server, moved to [Root](https://www.rootapp.com): same categories, same channels, same roles, plus **Blitz**, a Root App that builds the whole thing with one command, hangs around being useful, and has a glowing little domain of its own you can drag it around in.

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

## What Blitz does

| | |
| --- | --- |
| 🔮 **Its domain** | Blitz's own channel: a round, glowing bubble where it floats, zooms around and does tricks. Drag it, fling it, slam it, poke it, or pin it to the wall until the bubble shatters and opens into an endless universe full of drifting space rocks to fling it into. Everyone inside sees the same Blitz, live. |
| 💬 **Talk to it** | Say "blitz" in any chat (or @mention it, or reply to it) and Blitz actually answers: with Claude as its brain it reads the conversation, replies in its own voice, reacts with an emoji, and acts out how it feels in the domain while everyone watches. |
| 🛠️ **Builds the server** | `!setup` previews, `!setup confirm` builds every category, channel and role in a couple of minutes. It only ever creates (never deletes or renames), matches anything that already exists by name, and can be re-run anytime. |
| 🗣️ **Quote wall** | React 🗣️ on anything someone says. At 2 reactions (not counting whoever said it) Blitz saves it to `#quotes` with a live count. `!quote` pulls a random one back up. Nothing from `#the-vent-aka-hell` is ever quoted. |
| 🎂 **Birthdays** | `!birthday July 14`, then a shout-out in `#birthdays` and the **Birthday Bitch** role for 24 hours. No birth year is ever asked for. |
| 📊 **Polls** | `!poll 1h Movie night? \| Shrek \| Shrek 2`: reaction votes, auto-close and a results card. |
| ✨ **Levels** | XP for chatting (once a minute, so spam doesn't count), `!rank` and `!top`. Level-ups are announced in `#bot-commands`. The vent and bot channels earn nothing. |
| 👋 **Welcomes** | New people get **Bitches** automatically and a welcome in `#bitches-yapping`. |
| 🤖 **Takes over for Dyno** | Light auto-mod (floods, copy-paste spam, mass mentions) with a log of joins, leaves and removals in `#dyno-status`. |
| 🎲 **Toys** | `!8ball`, `!roll`, `!flip`, `!choose`. |
| 📣 **For the Bitchiest Bitch** | `!announce`, `!say`, `!clear`, and `!setxp` to carry Discord levels over. |

## Blitz's domain

Type `!blitz` anywhere and Blitz replies with a link into its domain. Inside:

- **Drag** to carry Blitz around. It trails after your pointer like it's on a string.
- **Let go mid-swing** to fling it. It coasts, bounces off the rim, then drifts back to the middle.
- **Slam it into the wall**, thrown or still in your hand: the rim ripples, Blitz squashes and goes `> <`. Hit it hard enough and it sees stars.
- **Tap** to poke it. Poke it a few times fast and it gets the giggles; keep going and it gets grumpy. Rest your pointer on it to pet it.
- **Talk to it** with the message box under the domain. A thought bubble shows while it thinks.
- **Hold it against the wall… if you dare.** The wall bulges, cracks spread from where Blitz is pressing, and Blitz strains and sweats. Let go and the cracks slowly heal. Keep pushing for a couple of seconds and the bubble shatters: everything slows for a heartbeat, glass flies, the window breaks away and the universe opens out from where the bubble was, filling the screen (fullscreen, where Root allows it).
- **Out in the universe** there are no walls: deep space in layers that slide past as the camera follows Blitz (nebulae, galaxies, a ringed planet, shooting stars it turns to watch). Fling Blitz and it streaks off with the stars blurring behind it, then settles wherever it lands; carry it to the edge of the screen to travel.
- **Space rocks** drift and tumble everywhere out there, lit by Blitz's glow as it passes, a few glittering with crystal. Fling Blitz into one and it bonks off with a puff of dust and chips ("BONK"). The rocks are in the same place on every screen, so everyone sees the same crash.
- **Seal the bubble** (the only button up top out in space) folds the universe back in and the window gathers around it; it also re-forms on its own after two quiet minutes.
- Leave it alone and it does tricks on its own: loop-de-loops, spins, hops, zooming laps, the odd heart drawn in the air. After a while it dozes off. Any touch wakes it.

### Talking to Blitz

With an Anthropic API key in Blitz's App settings (see the [setup guide](docs/SETUP-GUIDE.md#6-give-blitz-its-brain-optional)), Claude is Blitz's brain. It reads your message along with the last few messages in the channel and Blitz's recent conversation there, then decides how Blitz feels, which trick it does, what it says in the domain and what it replies in chat. You can ask it things ("blitz where do i post minecraft screenshots?", "blitz settle this: is a hotdog a sandwich"), tease it, hype it up or vent to it. It knows the channels and commands, keeps the group's crude-but-affectionate vibe, and drops the bit when someone sounds genuinely not okay.

Without a key, or if Claude can't be reached, Blitz falls back to reading the mood from keywords. Either way it acts it out. Some of what it picks up on:

| Say something like… | Blitz… |
| --- | --- |
| "hi blitz", "hey" | lights up and comes to say hi: "hii!!" |
| "i love you blitz", "<3" | heart eyes, hearts everywhere, draws a heart in the air |
| "blitz ur so cute" | blushes and hides behind the edge of its bubble |
| "lmao", "😭" | laughs |
| "BLITZ LETS GOOO" | star eyes, zooms laps around the domain |
| "blitz i'm sad" | floats over for a hug |
| "blitz you're stupid" | puffs up, goes red and darts away: "hmph!" |
| "boo!" | gets scared |
| "gn blitz" | yawns and falls asleep |
| "blitz spin", "do a loop", "dance", "zoomies" | does the trick (unless it's sulking) |

In chat, Blitz leaves a matching emoji on your message and replies (with the keyword fallback: a little canned line, at most once every 25 seconds per channel). In the domain, everyone sees your message arrive at the top and fly over to Blitz, a thought bubble while it thinks, then its reaction.

**Privacy:** with a key set, messages that mention Blitz, plus the last 12 messages in that channel, are sent to Anthropic's API to work out the answer. Nothing is stored by Blitz; its memory lives only while it runs. `#the-vent-aka-hell` is never sent and never shows up in the domain; Blitz reacts there with keywords only. Change any of this under `brain` and `domain` in [`config.ts`](blitz/server/src/config.ts).

One person holds Blitz at a time; everyone else sees who's carrying it. If Blitz's server can't be reached (or you open the domain outside Root), it runs solo: the same Blitz, just yours. **[Try it in your browser](https://claude.ai/artifact/JjoXEpCC6r2eeme9ZjCi57)**: there, Blitz thinks with Claude only for the page's creator (it asks once); everyone else gets the keyword Blitz. In Root, the brain is whatever key is in the App's settings, which only people who can manage the App can change.

Root Apps live inside their own channel, so the domain is a channel rather than a window over the rest of Root. Bursting the bubble is how it gets as big as Root lets it.

## Quick start

> Full walkthrough: **[docs/SETUP-GUIDE.md](docs/SETUP-GUIDE.md)**.

1. **Create a fresh Root community.**
2. **Register Blitz** as an **App** in the Root Developer Portal and generate a `DEV_TOKEN` for it.
3. **Build it:**
   ```bash
   cd blitz
   npm install
   npm run configure # paste the App ID and DEV_TOKEN; saved in server/.env
   npm run build     # networking, physics, server and the domain client
   npm test          # validates the template and runs the unit tests
   ```
4. **Try it in your test community:** run `npm run server`, and type `!setup` (then `!setup confirm`) in any channel. In a second terminal, `npm run client` serves the domain for Root's dev mode.
5. **Go live:** `npm run package`, upload `blitz.rootpkg`, install Blitz in the real community, and run `!setup confirm` there.

## Before you build: the mailboxes

This repository is public, so the personal mailbox channels (one per person, named after them) aren't in it. They live in `blitz/server/src/blueprint/mailboxes.local.ts`, a file git never uploads:

1. Copy [`mailboxes.local.example.ts`](blitz/server/src/blueprint/mailboxes.local.example.ts) to `mailboxes.local.ts` in the same folder.
2. Add one line per person, using the exact channel names from Discord.

Without that file, setup creates only `#to-all-bitches` in that category.

Two smaller differences from Discord: there's one `#bot-commands` instead of two (without the emoji their names were identical), and Discord's built-in Events and Server Boosts don't exist on Root.

## Make it yours

| File | What's in it |
| --- | --- |
| [`blitz/server/src/blueprint/layout.ts`](blitz/server/src/blueprint/layout.ts) | Categories, channels, roles, colors and permissions |
| [`blitz/server/src/blueprint/content.ts`](blitz/server/src/blueprint/content.ts) | The pinned how-to posts Blitz puts in its channels |
| [`blitz/server/src/config.ts`](blitz/server/src/config.ts) | Prefix, quote emoji and threshold, levels, birthdays, auto-mod, where things get posted |
| [`blitz/server/src/content/lines.ts`](blitz/server/src/content/lines.ts) | Blitz's welcome lines, level-up lines and 8-ball answers |
| [`blitz/shared/src/physics.ts`](blitz/shared/src/physics.ts) | How Blitz moves in its domain: drift, drag, bounce, slam, how fast the wall cracks |
| [`blitz/shared/src/rocks.ts`](blitz/shared/src/rocks.ts) | The space rocks: how many, how big, how far apart, how much room around the bubble |
| [`blitz/shared/src/brain.ts`](blitz/shared/src/brain.ts) | Blitz's personality: what Claude is told about who Blitz is and how it talks |
| [`blitz/shared/src/mood.ts`](blitz/shared/src/mood.ts) | The keyword fallback: words Blitz reacts to, its canned lines, and its chat emoji |
| [`blitz/shared/src/tricks.ts`](blitz/shared/src/tricks.ts) | Blitz's tricks: loops, spins, zooms, the heart |
| [`blitz/client/src/style.css`](blitz/client/src/style.css) | The domain window's look |

Change them, run `npm run build && npm test`, then `!setup` again; it only adds what's new. Recipes: **[docs/CUSTOMIZING.md](docs/CUSTOMIZING.md)**. All commands: **[docs/COMMANDS.md](docs/COMMANDS.md)**. Privacy policy: **[PRIVACY.md](PRIVACY.md)**. Terms: **[TERMS.md](TERMS.md)**.

## Project layout

```
blitz/
├── root-manifest.json          App ID, version and the permissions Blitz asks for
├── stage.js                    gathers a clean copy to upload (npm run package), without sources or .env
├── configure.js                asks for the App ID and DEV_TOKEN and saves them in server/.env (npm run configure)
├── dev-manifest.js             works around Root's dev host dropping Blitz's permissions (npm run server)
├── networking/src/domain.proto the domain's live messages (grab, drag, throw, poke, state)
├── shared/src/                 run identically by the server and every window:
│   ├── physics.ts              Blitz's physics, the wall cracking, the burst and open space
│   ├── rocks.ts                the space rocks: where they are and how they drift
│   ├── tricks.ts               loops, spins, zooms, hops, the heart
│   ├── brain.ts                Blitz's persona and the answer format Claude fills in
│   └── mood.ts                 the keyword fallback for reading what people say
├── server/                     the App's server: everything that happens in chat, plus the shared Blitz
│   ├── src/
│   │   ├── blueprint/          ⭐ the server template (layout, posts, permissions, validation, setup planner)
│   │   ├── config.ts           ⭐ settings
│   │   ├── domain/             the one true Blitz, its tricks and the burst; its brain (Claude), memory, chat answers and !blitz
│   │   ├── content/            Blitz's lines, 8-ball answers, a question pool (question of the day is off)
│   │   ├── core/               rate-limited API calls, commands, storage, IDs, jobs
│   │   ├── features/           setup, welcome, quote wall, levels, birthdays, polls, automod, staff, fun
│   │   ├── logic/              pure helpers (parsing, XP math, automod checks, polls, dates)
│   │   └── main.ts             wiring
│   ├── test/                   unit tests (node:test)
│   └── scripts/render-layout.ts  generates docs/SERVER-LAYOUT.md
└── client/                     the domain window, shown in Blitz's channel: faces, effects, cracks, the shatter, the universe and its rocks
docs/                           setup guide, commands, customizing, layout
```

Built on the official [Root SDK](https://docs.rootapp.com) 0.21 (`@rootsdk/server-app` and `@rootsdk/client-app`), with Claude (`@anthropic-ai/sdk`) as Blitz's brain. Root runs Blitz for you once it's uploaded, and each community gets its own private data store.
