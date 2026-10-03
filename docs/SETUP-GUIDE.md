# Running Blitz: the step-by-step guide

This takes you from this repository to Blitz running in Root: first in your private test community, then in Root's cloud, where any community can install it.

**You'll need:** a Root account and the Root **desktop** app (the developer features aren't on mobile), [Node.js](https://nodejs.org) 20 or newer, and this repository on your computer.

- [Register Blitz](#register-blitz)
- [Try it in your test community](#try-it-in-your-test-community)
- [Upload it](#upload-it)
- [Install it and set it up](#install-it-and-set-it-up)
- [Give Blitz its brain (optional)](#give-blitz-its-brain-optional)
- [What Blitz can do, and why](#what-blitz-can-do-and-why)
- [Troubleshooting](#troubleshooting)

---

## Register Blitz

Blitz is a Root **App**: a bot with a screen of its own (its domain). Apps are registered in the **Root Developer Portal**; Root's developer docs walk through it: [docs.rootapp.com](https://docs.rootapp.com).

1. Turn on **Developer Mode** in Root's settings, then open the **Developer Portal**.
2. Create a new **App** project called **Blitz**. (Not a Bot project: a plain bot can't have the domain.)
3. On the project's page, note its **App ID** and generate a **DEV_TOKEN**. The first time, Root also creates a private **test community** for you, named after the project (like `Blitz-test`). You'll find it under **+** → **Your communities**.

> Never share your DEV_TOKEN; whoever has it can act as Blitz.

## Try it in your test community

In a terminal, in the `blitz` folder:

```bash
npm install          # installs the Root SDK and the domain's tools
npm run configure    # asks for the App ID and DEV_TOKEN, and saves them in server/.env
npm run check        # builds everything and runs the tests
npm run server       # runs Blitz on your computer, in your test community
```

Wait for **Blitz is up in the community "…"**, then open that community in Root:

1. Type `!help` in any text channel. Blitz answers with its commands.
2. Open Blitz's **App settings** in that community and try picking a welcome channel, a quote wall and so on. `!settings` shows what's set.
3. Say "hey blitz" and watch it react.

**The domain:** in a second terminal (also in `blitz/`), run `npm run client`. The domain opens in your browser with your own Blitz to play with. In the Root bar at the top of the page, pick yourself under **Current User**; when you type to Blitz, it asks the Blitz running in the first terminal what to say. (Root's app shows the domain itself only once Blitz is installed from the store.)

Leave `npm run server` running while you test; closing it turns Blitz off.

## Upload it

While `npm run server` runs, Blitz lives on your computer. To keep it running 24/7, upload it to Root's cloud:

```bash
npm run upload
```

The first time, it asks for the **publishing token** from your Blitz project in the Developer Portal (a different token from the DEV_TOKEN) and keeps it in `blitz/server/.env`. Then it builds Blitz, packages it under the next version number (Root refuses a version it already has, so it counts up by itself), and uploads it. Your token is blanked out of everything it prints. If Root turns the token down, run it again and paste a fresh one.

The package is a clean copy staged in `blitz/deploy/`: the built server and domain plus only the packages the server needs, never your sources or `server/.env`. If it ever finds a `.env` in there, it stops instead of uploading your tokens.

After uploading, the Developer Portal shows the version as ready to publish. Root asks for your developer organization to be **certified** before the first release; contact [Root support](https://www.rootapp.com/support) for that.

## Install it and set it up

1. **Install Blitz** from Root's app directory, like any App: [Install Apps and Bots](https://support.rootapp.com/docs/leader/apps/install-apps/). Root shows the permissions Blitz asks for (see [below](#what-blitz-can-do-and-why)) before you approve.
2. **Find its domain.** Installing an App gives it a channel of its own; that's **Blitz's domain**. Rename it and move it wherever you like. `!blitz` links to it.
3. **Open Blitz's App settings** and pick what you want. Everything is optional, and anything left empty is simply off:

   | Setting | What it does |
   | --- | --- |
   | Welcome channel | Where Blitz greets new members |
   | Level-up channel | Where level-ups go (empty: where they happened) |
   | Quote wall | Where messages that get enough 🗣️ reactions are saved |
   | Birthday channel | Where Blitz wishes people happy birthday |
   | Suggestions channel | Where `!suggest` posts ideas for votes |
   | Staff log | Where reports, moderation, shield catches, auto-mod removals, inbox transcripts, joins and leaves are noted |
   | Message log | Where edited and deleted messages are shown, with what they said |
   | Private channels | Channels Blitz stays out of: no XP, no quotes, never shown in its domain or sent to its brain |
   | Role for new members | Given to everyone who joins |
   | Birthday role | Worn for the day on someone's birthday |
   | Roles people can pick | Roles members can give themselves with `!role` |
   | Staff | Who can use staff commands, besides the owner and roles that can manage the community, kick or ban |
   | Welcome message | Your own welcome; `{user}`, `{name}`, `{community}` and `{members}` are filled in |
   | Turn off levels, Stardust, the inbox, auto-mod or cool-offs | All on until you tick them |
   | Turn off domain links | Stops the 🔮 link to Blitz's domain under its replies to commands |
   | Block invite links, Blocked words, Stricter filters | What else auto-mod removes (words separated by commas; `scam*` catches any ending; stricter filters add shouting, emoji floods and walls of text) |
   | Guardian: Turn off the scam shield, Turn off the raid shield | Both on until you tick them |
   | Guardian: Joins that mean a raid | How many joins in a minute raise the raid shield (8 by default) |
   | Guardian: Newcomer link wait | Minutes before new members can post links (10 by default; 0 for no wait) |
   | Guardian: Warnings before a mute, kick, ban | The warning ladder (a mute at 3 by default; kick and ban off until you set them) |
   | Guardian: Don't notify members about moderation | Members are told about their warnings, mutes, kicks and bans (and how to appeal) until you tick this |
   | Reactions for the quote wall | How many 🗣️ a message needs (2 by default) |

   For the roles: Blitz can only hand out roles below its own in **Settings → Roles**.
4. Type `!settings` to check, and `!help` to see everything Blitz can do.
5. **Make your own commands** for the questions people always ask: `!addcmd rules …`, `!addcmd faq …`, `!addcmd links …`. Anyone can then type `!rules`, and Blitz's brain will point people to them.

## Give Blitz its brain (optional)

Out of the box Blitz reacts to messages with keywords: it gets the mood right most of the time, but it can't really answer anyone. Give it an Anthropic API key and Claude becomes its brain: it reads what people say to it, keeps up with the conversation, answers in its own voice and acts it out in the domain.

1. **Create a key** at [console.anthropic.com](https://console.anthropic.com) (Settings → API keys). The key belongs to whoever's Anthropic account it is, and so does the bill.
2. **Paste it into Blitz's App settings in Root**, under **Blitz's brain**. Save, and Blitz picks it up right away; no restart needed.
3. **Optionally, fill in "About this community"**: a sentence or two about what your community is and its vibe. Blitz uses it to fit in.
4. **Try it:** say "hey blitz, what can you do?" in any channel.
5. **Optionally, tick "Let Blitz's brain help moderate"** (also under **Blitz's brain**): reports get a summary, a severity and a suggestion for the team; blocked-word hits are double-checked in context before they're removed; `!tldr` catches people up on a channel; and the team can **Ask Blitz** questions about the community in its menu (or with `!ask`). The team always decides: the brain never warns, mutes or bans anyone.

Things to know:

- **Cost:** Blitz uses Claude Opus 5.5 at low effort, so most answers take a few seconds and cost around a cent each. Blitz answers at most 200 messages an hour per community (`brain.maxPerHour` in `config.ts`) and falls back to keywords after that. You can also set a spend limit in the Anthropic console.
- **Privacy:** messages that mention Blitz, plus the last 12 messages in that channel, are sent to Anthropic's API. With "Let Blitz's brain help moderate" ticked, so are a reported message and the conversation around it, a message caught for a blocked word with the few before it, the channel being caught up on with `!tldr`, and whatever Ask Blitz looks up for the team. Blitz keeps no record of them; its memory lasts only while it runs. Channels marked private are never sent. Let your community know before you turn it on. Details: [PRIVACY.md](../PRIVACY.md).
- **Who can see the key:** anyone who can manage Blitz's App settings in the community. Use a key made just for Blitz, so you can revoke it on its own.
- **While developing:** you can put `ANTHROPIC_API_KEY=...` in `blitz/server/.env` instead.
- If Claude declines a message or can't be reached, Blitz quietly falls back to keywords for that message.

---

## What Blitz can do, and why

These are the permissions in [`root-manifest.json`](../blitz/root-manifest.json). Root shows them when you install Blitz.

| Permission | Used for |
| --- | --- |
| View channels and read history | Hearing commands and people talking to it; the quote wall |
| Post, mention, react | Answers, welcomes, polls, level-ups, quotes; reacting when someone talks to Blitz |
| Delete others' messages | The scam and raid shields, auto-mod, mutes, lockdowns, slowmode and `!clear` |
| Manage roles | Only to give the roles you pick: the role for new members, the birthday role, the roles people can pick and level reward roles |
| Kick, ban, manage bans | When your staff use `!kick`, `!ban` or `!unban` (or accept a ban appeal), and when the warning ladder reaches a kick or ban step, if you set one (they're off until you do) |

Blitz never creates, renames or deletes channels or roles.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| `Unable to find .env with a DEV_TOKEN` | Run `npm run configure` in the `blitz` folder and paste your DEV_TOKEN. |
| `Manifest validation error: id is not an app id`, or "Blitz doesn't know its App ID yet" | Run `npm run configure` and paste the App ID from the Developer Portal. |
| In testing, Blitz starts fine but never answers | Look at the line **Blitz is up in the community "…"** and type in *that* community (your test community, not one you made yourself). When Blitz sees a command it logs **heard !help**. If the log says **Blitz can't read the chat**, Root didn't give it its permissions: make sure you have the latest version (`npm run server` starts the dev host with `root-manifest.dev.json` to work around a dev host bug), then stop Blitz (Ctrl+C) and start it again. |
| The dev host says the data belongs to a different community | You switched to a token for another community. Delete `blitz/server/rootsdk.sqlite3` and start again. |
| The upload is refused because of the version | Run `npm run upload` again: it uses the next version each time. |
| Blitz doesn't welcome people, save quotes or announce birthdays | Those are off until a channel is picked in Blitz's App settings. `!settings` shows what's set. |
| Blitz can't give a role | In **Settings → Roles**, drag Blitz's role above the roles it should hand out. |
| `!report` says there's no staff log | Pick a **Staff log** channel in Blitz's settings, so reports have somewhere to go. |
| `!kick` or `!ban` says it has no permission | Blitz's role needs to be above the person's roles, and Blitz needs the kick and ban permissions (approve them when you install or update it). |
| `They're on the team too` | Staff can only act on people ranked below them. Ask an admin or the owner. |
| `🔒 … is for the team only` | Staff commands need the owner, a role that can manage the community, kick or ban, or someone on the Staff list in Blitz's settings. |
| Blitz in the domain only answers with short canned lines | It couldn't reach Blitz's server (or the community has no API key), so it reads your mood from keywords. Inside Root: is Blitz installed? In development: is `npm run server` still running? |
| `!blitz` says the domain isn't set up | Blitz didn't get its App channel. Make sure it was registered as an App and reinstall it. |
| Blitz only answers with short canned lines | It has no brain yet, or the key isn't working. Blitz's log says "Claude rejected Blitz's API key" if the key is wrong. |
| Blitz takes a few seconds to answer | That's Claude thinking; the domain shows a thought bubble meanwhile. |
| `Root is rate limiting me` | Root allows about five changes per second. Blitz queues and retries automatically; wait a moment and try again. |

Still stuck? Root's developer docs: [docs.rootapp.com](https://docs.rootapp.com).
