# ✨ Blitz

**Blitz** is a Root App for any community: a glowing little spirit that hangs out in your chat and does the useful work too. It moderates (warnings, mutes, kicks, bans, auto-mod, reports and logs), answers your community's FAQs with its own commands, sets reminders, hands out roles, collects suggestions, keeps levels, a quote wall and birthdays, and has a domain of its own where everyone can drag it around, fling it into the walls and burst its bubble into space.

It doesn't come with a server template and never creates channels or roles. It fits whatever your community already has: you point it at your channels and roles on its settings page in Root, and anything you leave empty is simply off.

## What Blitz does

| | |
| --- | --- |
| 🔮 **Its domain** | Blitz's own channel: a round, glowing bubble where it floats, zooms around and does tricks. Drag it, fling it, slam it, poke it, or pin it to the wall until the bubble shatters and opens into an endless universe full of drifting space rocks to fling it into. Everyone who opens the domain gets their own Blitz, just for them. |
| 💬 **Talk to it** | Say "blitz" in any chat (or @mention it, or reply to it) and Blitz answers: with Claude as its brain it reads the conversation, replies in its own voice, reacts with an emoji, and acts out how it feels in the domain while everyone watches. |
| ✨ **Levels** | XP for chatting (once a minute, so spam doesn't count), `!rank` and `!top`. Level-ups are announced where they happen, or in a channel you pick. |
| 🗣️ **Quote wall** | Pick a quote wall channel, and anything that gets 🗣️ reactions (2 by default, not counting whoever said it) is saved there with a live count. `!quote` pulls a random one back up. |
| 🎂 **Birthdays** | `!birthday July 14`, then a shout-out in the birthday channel you pick and, if you pick one, a birthday role for the day. No birth year is ever asked for. |
| 👋 **Welcomes** | A welcome in the channel you pick (Blitz's own, or yours with `{user}` and `{community}`), and a role for every newcomer if you pick one. |
| 🔨 **Moderation** | `!warn`, `!mute 30m`, `!kick`, `!ban 7d`, each saved as a numbered case, so `!history @someone` shows everything that's happened. Mutes need no special role: Blitz removes a muted member's messages itself. Staff can only act on people ranked below them. |
| 🛡️ **Auto-mod** | Removes floods, copy-paste spam, mass mentions, your community's blocked words and (if you like) invite links, and notes it in the staff log. |
| 🚩 **Reports and logs** | `!report` lets anyone quietly flag a problem to the team. The staff log collects reports, moderation, joins and leaves; the message log shows edited and deleted messages with what they said. |
| 📌 **Your own commands** | `!addcmd rules Be kind, no spam…` and anyone can type `!rules`. Great for rules, FAQs, links and how-tos. Blitz's brain knows them too. |
| ⏰ **Reminders** | `!remind 2h take the pizza out`: Blitz pings you back in the same channel. |
| 🎭 **Pick-a-role** | List roles people can give themselves (pronouns, games, ping roles); `!role gamer` toggles one. |
| 💡 **Suggestions** | `!suggest a movie night` posts the idea for 👍/👎 votes; the team answers with `!approve` or `!deny`. |
| 📊 **Polls** | `!poll 1h Movie night? \| Shrek \| Shrek 2`: reaction votes, auto-close and a results card. |
| 🎲 **Toys** | `!8ball`, `!roll`, `!flip`, `!choose`. |
| 📣 **For staff** | `!announce`, `!event`, `!say`, `!clear`, `!setxp`, `!userinfo`, and `!settings` to see how Blitz is set up. |

## Setting Blitz up in a community

Install Blitz, then open its **App settings** in Root. Everything is optional:

| Setting | What it does |
| --- | --- |
| Welcome channel | Where Blitz greets new members. Empty: no welcomes. |
| Level-up channel | Where level-ups go. Empty: where they happened. |
| Quote wall | Where 🗣️-ed messages are saved. Empty: no quote wall. |
| Birthday channel | Where Blitz wishes happy birthday. Empty: no birthdays. |
| Suggestions channel | Where `!suggest` posts ideas. Empty: no suggestions. |
| Staff log | Reports, moderation, auto-mod removals, joins and leaves. Empty: no log (and no `!report`). |
| Message log | Edited and deleted messages, with what they said. Empty: no message log. |
| Private channels | Channels Blitz stays out of: no XP, no quotes, never shown in its domain or sent to its brain. Good for vent or staff channels. |
| Role for new members | Given to everyone who joins. |
| Birthday role | Worn for the day on someone's birthday. |
| Roles people can pick | Roles members can give themselves with `!role`. |
| Staff | Who can use staff commands. The owner, and roles that can manage the community, kick or ban, always can. |
| Welcome message | Your own welcome: `{user}`, `{name}`, `{community}` and `{members}` are filled in. Empty: Blitz's greetings. |
| Turn off levels, Turn off auto-mod | Tick them if you'd rather not have levels or auto-mod. |
| Turn off domain links | Blitz adds a 🔮 link to its domain under its replies to commands (and spins in the domain); tick this to stop it. |
| Block invite links, Blocked words | What else auto-mod removes. Words are separated by commas; `scam*` catches any ending. |
| Reactions for the quote wall | How many 🗣️ a message needs. |
| Anthropic API key, About this community | Blitz's brain (see below), and a sentence or two that tells it what your community is like. |

Blitz needs permission to read and post messages, react, delete messages (for auto-mod, mutes and `!clear`), manage roles (only to hand out the roles you pick), and kick and ban (only when your staff use `!kick` or `!ban`). Type `!settings` to see what's set.

## Blitz's domain

Type `!blitz` anywhere and Blitz replies with a link into its domain. Inside:

- **Drag** to carry Blitz around. It trails after your pointer like it's on a string.
- **Let go mid-swing** to fling it. It coasts, bounces off the rim, then drifts back to the middle.
- **Slam it into the wall**, thrown or still in your hand: the rim ripples, Blitz squashes and goes `> <`. Hit it hard enough and it sees stars.
- **Tap** to poke it. Poke it a few times fast and it gets the giggles; keep going and it gets grumpy. Rest your pointer on it to pet it.
- **Talk to it** with the message box under the domain. A thought bubble shows while it thinks.
- **Hold it against the wall… if you dare.** The wall bulges, cracks spread from where Blitz is pressing, and Blitz strains and sweats. Let go and the cracks slowly heal. Keep pushing for a couple of seconds and the bubble shatters: everything slows for a heartbeat, glass flies, the window breaks away and the universe opens out from where the bubble was, filling the screen (fullscreen, where Root allows it).
- **Out in the universe** there are no walls: deep space in layers that slide past as the camera follows Blitz (nebulae, galaxies, a ringed planet, shooting stars it turns to watch). Fling Blitz and it streaks off with the stars blurring behind it, then settles wherever it lands; carry it to the edge of the screen to travel.
- **Space rocks** drift and tumble everywhere out there, lit by Blitz's glow as it passes, a few glittering with crystal. Fling Blitz into one and it bonks off with a puff of dust and chips ("BONK").
- **Seal the bubble** (the only button up top out in space) folds the universe back in and the window gathers around it; it also re-forms on its own after two quiet minutes.
- Leave it alone and it does tricks on its own: loop-de-loops, spins, hops, zooming laps, the odd heart drawn in the air. After a while it dozes off. Any touch wakes it.

### Talking to Blitz

With an Anthropic API key in Blitz's App settings (see the [setup guide](docs/SETUP-GUIDE.md#give-blitz-its-brain-optional)), Claude is Blitz's brain. It reads your message along with the last few messages in the channel and Blitz's recent conversation there, then decides how Blitz feels, which trick it does, what it says in the domain and what it replies in chat. You can ask it things ("blitz where do i post my art?", "blitz settle this: is a hotdog a sandwich"), tease it, hype it up or vent to it. It knows the community's channels and commands, matches the vibe of the chat, and drops the bit when someone sounds genuinely not okay. Tell it about your community in the "About this community" setting and it'll fit right in.

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

In chat, Blitz leaves a matching emoji on your message and replies (with the keyword fallback: a little canned line, at most once every 25 seconds per channel). In the domain, type to your Blitz: your message flies over to it, a thought bubble shows while it thinks, then it reacts.

**Privacy:** with a key set, messages that mention Blitz, plus the last 12 messages in that channel, are sent to Anthropic's API to work out the answer. Nothing is stored by Blitz; its memory lives only while it runs. Channels you mark private are never sent; Blitz reacts there with keywords only. The full details are in the [privacy policy](PRIVACY.md).

Each person's Blitz lives entirely in their own domain window, so it's always smooth, whatever the connection. The only thing it asks Blitz's server for is a thought, when you type to it (if the server can't be reached, it reads your mood from keywords instead). **[Try it in your browser](https://claude.ai/artifact/JjoXEpCC6r2eeme9ZjCi57)**: there, Blitz thinks with Claude only for the page's creator (it asks once); everyone else gets the keyword Blitz. In Root, the brain is whatever key is in the App's settings, which only people who can manage the App can change.

Root Apps live inside their own channel, so the domain is a channel rather than a window over the rest of Root. Bursting the bubble is how it gets as big as Root lets it.

## Building and running Blitz yourself

> Step by step: **[docs/SETUP-GUIDE.md](docs/SETUP-GUIDE.md)**.

```bash
cd blitz
npm install
npm run configure   # paste the App ID and DEV_TOKEN from Root's Developer Portal; saved in server/.env
npm run check       # builds everything and runs the tests
npm run server      # runs Blitz in your test community
npm run client      # in a second window: the domain in your browser
npm run upload      # puts Blitz in Root's cloud (asks for your publishing token once)
```

## Make it yours

| File | What's in it |
| --- | --- |
| [`blitz/root-manifest.json`](blitz/root-manifest.json) | The settings page each community sees, and the permissions Blitz asks for |
| [`blitz/server/src/config.ts`](blitz/server/src/config.ts) | Defaults for every community: prefix, XP per message, auto-mod limits, the brain's model and budget |
| [`blitz/server/src/content/lines.ts`](blitz/server/src/content/lines.ts) | Blitz's welcome lines, level-up lines, birthday lines and 8-ball answers |
| [`blitz/shared/src/brain.ts`](blitz/shared/src/brain.ts) | Blitz's personality: what Claude is told about who Blitz is and how it talks |
| [`blitz/shared/src/mood.ts`](blitz/shared/src/mood.ts) | The keyword fallback: words Blitz reacts to, its canned lines, and its chat emoji |
| [`blitz/shared/src/physics.ts`](blitz/shared/src/physics.ts) | How Blitz moves in its domain: drift, drag, bounce, slam, how fast the wall cracks |
| [`blitz/shared/src/rocks.ts`](blitz/shared/src/rocks.ts) | The space rocks: how many, how big, how far apart |
| [`blitz/shared/src/tricks.ts`](blitz/shared/src/tricks.ts) | Blitz's tricks: loops, spins, zooms, the heart |
| [`blitz/client/src/style.css`](blitz/client/src/style.css) | The domain window's look |

Recipes: **[docs/CUSTOMIZING.md](docs/CUSTOMIZING.md)**. All commands: **[docs/COMMANDS.md](docs/COMMANDS.md)**. Privacy policy: **[PRIVACY.md](PRIVACY.md)**. Terms: **[TERMS.md](TERMS.md)**.

## Project layout

```
blitz/
├── root-manifest.json          ⭐ the settings page each community sees, and the permissions Blitz asks for
├── stage.js                    gathers a clean copy to upload (npm run package), without sources or .env
├── upload.js                   builds, packages and uploads Blitz in one go (npm run upload)
├── configure.js                asks for the App ID and DEV_TOKEN and saves them in server/.env (npm run configure)
├── dev-manifest.js             works around Root's dev host dropping Blitz's permissions (npm run server)
├── networking/src/domain.proto the domain's live messages (grab, drag, throw, poke, state)
├── shared/src/                 run identically by the server and every window:
│   ├── physics.ts              Blitz's physics, the wall cracking, the burst and open space
│   ├── rocks.ts                the space rocks: where they are and how they drift
│   ├── tricks.ts               loops, spins, zooms, hops, the heart
│   ├── brain.ts                Blitz's persona and the answer format Claude fills in
│   └── mood.ts                 the keyword fallback for reading what people say
├── server/                     the App's server: everything that happens in chat, plus Blitz's brain
│   ├── src/
│   │   ├── config.ts           ⭐ defaults for every community
│   │   ├── domain/             Blitz's brain (Claude), its memory, chat answers, domain thoughts and !blitz
│   │   ├── content/            Blitz's welcome, level-up and birthday lines, 8-ball answers
│   │   ├── core/               rate-limited API calls, commands, storage, jobs, each community's settings
│   │   ├── features/           welcome, quote wall, levels, birthdays, polls, auto-mod, staff, fun, !help and !settings
│   │   ├── logic/              pure helpers (parsing, XP math, automod checks, polls, dates)
│   │   └── main.ts             wiring
│   └── test/                   unit tests (node:test)
└── client/                     the domain window, shown in Blitz's channel: faces, effects, cracks, the shatter, the universe and its rocks
docs/                           setup guide, commands, customizing
```

Built on the official [Root SDK](https://docs.rootapp.com) 0.21 (`@rootsdk/server-app` and `@rootsdk/client-app`), with Claude (`@anthropic-ai/sdk`) as Blitz's brain. Root runs Blitz for you once it's uploaded, and each community gets its own private data store.
