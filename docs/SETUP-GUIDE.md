# Moving to Root: the step-by-step guide

This takes you from "we're on Discord" to the same server on Root with Blitz running in it. Plan for about an hour the first time, most of it reading.

**You'll need:** a Root account and the Root **desktop** app (some developer and import features aren't on mobile), [Node.js](https://nodejs.org) 20 or newer, and this repository on your computer.

- [1. Create the Root community](#1-create-the-root-community)
- [2. Register Blitz](#2-register-blitz)
- [3. Build and try it in your test community](#3-build-and-try-it-in-your-test-community)
- [4. Upload Blitz and install it](#4-upload-blitz-and-install-it)
- [5. Run setup in the real community](#5-run-setup-in-the-real-community)
- [6. Give Blitz its brain (optional)](#6-give-blitz-its-brain-optional)
- [7. Finishing touches](#7-finishing-touches)
- [8. Bring everyone over](#8-bring-everyone-over)
- [Troubleshooting](#troubleshooting)

---

## 1. Create the Root community

First, list everyone's mailbox channel in `blitz/server/src/blueprint/mailboxes.local.ts` (see the [README](../README.md#before-you-build-the-mailboxes)). It stays on your computer and is never uploaded to GitHub.

Then pick one of two routes:

- **Fresh (recommended):** in Root, select **+** in the tab bar, then **Create community**. Blitz's `!setup` builds everything.
- **Import, then fill gaps:** Root can [import your Discord server template](https://support.rootapp.com/docs/leader/community/import-discord-template/) (in Discord: Server Settings → Server Template). That copies categories, channels and roles. Blitz's `!setup` then recognizes them by name, emoji and all, adds what's missing, and leaves the rest alone. This only works if the names in `mailboxes.local.ts` match Discord exactly; otherwise you get a second copy of each mailbox.

A brand-new Root community comes with an **Admin** role (yours) and a default `#general`. Setup leaves `#general` alone; delete it afterwards if you don't want it.

## 2. Register Blitz

Blitz is a Root **App**: a bot with a screen of its own (its domain). Apps are registered in the **Root Developer Portal**; Root's developer docs walk through it with screenshots: [docs.rootapp.com](https://docs.rootapp.com).

1. Turn on **Developer Mode** in Root's settings, then open the **Developer Portal**.
2. Create a new **App** project called **Blitz**. (Not a Bot project: a plain bot can't have the domain.)
3. Note the project's **App ID** and generate a **DEV_TOKEN** for it. Root creates a private **test community** for you the first time you generate a token. Blitz runs there while you develop, so you can try everything without touching the real server.
4. In a terminal in the `blitz` folder, run `npm install` and then `npm run configure`. It asks you to paste the App ID and the token, and saves both in `blitz/server/.env`. Run it again any time to change them. (You can also write the file yourself from [`blitz/server/.env.example`](../blitz/server/.env.example): `DEV_TOKEN=...` and `BLITZ_APP_ID=...`.)

> `.env` is in `.gitignore`. Never commit or share your token; whoever has it can act as Blitz.

## 3. Build and try it in your test community

```bash
cd blitz
npm install      # installs the Root SDK and the domain's tools
npm run build    # networking, physics, server and the domain client
npm test         # checks the template and runs the unit tests
npm run server   # starts Blitz on your computer, connected to your test community
```

Leave that terminal running and open your **test community** in Root:

1. In any channel, type **`!setup`**. Blitz replies with a preview of what it will create. Nothing has changed yet.
2. Type **`!setup confirm`**. Blitz builds everything in a minute or two, then replaces its progress message with a report.
3. Look around: try `!help`, `!rank`, `!poll Lunch? | Pizza | Salad`, `!birthday July 14`, and react 🗣️ on a message from a second account.

**The domain:** in a second terminal (also in `blitz/`), run `npm run client`. It opens the domain in your browser, and Root's dev tools connect it to the Blitz running in the first terminal. Open it in two tabs and drag Blitz in one: the other should follow. If the domain says it's running solo, it couldn't reach the server.

Want to change something? Edit the template or config (see [CUSTOMIZING.md](CUSTOMIZING.md)), run `npm run build && npm test`, restart `npm run server`, and run `!setup` again. It only adds what's new.

## 4. Upload Blitz and install it

While `npm run server` runs, Blitz lives on your computer. To keep it running 24/7, upload it to Root's cloud; Root's developer docs cover publishing in detail.

1. **Upload it** from the `blitz` folder:
   ```bash
   npm run upload
   ```
   The first time, it asks for the **publishing token** from your Blitz project in the Developer Portal (a different token from `DEV_TOKEN`) and keeps it in `blitz/server/.env`. Then it builds Blitz, packages it under the next version number (Root refuses a version it already has, so it counts up by itself), and uploads it. Your token is blanked out of everything it prints. If Root turns the token down, run it again and paste a fresh one.

   The package is a clean copy staged in `blitz/deploy/`: the built server and domain plus only the packages the server needs, never your sources or `server/.env`. If it ever finds a `.env` in there, it stops instead of uploading your tokens.

   **Blitz is private.** The package is locked to communities owned by you. Blitz learns who you are while it runs on your computer (`npm run server` notes the owner of your test community, which Root makes you), so run that at least once before uploading. If anyone else installs Blitz, it does nothing in their community except say it's a private App: no setup, no levels, nothing saved. While you test on your computer, it's never locked.

   (By hand instead: `npm run package` writes `blitz.rootpkg`, then `npx rootsdk upload package -f blitz.rootpkg -a YOUR_PUBLISHING_TOKEN`. Bump `"version"` in `root-manifest.json` before each upload, and note that this way prints the token.)
2. **Install Blitz in the real community** from Root's app directory, like any App or Bot: [Install Apps and Bots](https://support.rootapp.com/docs/leader/apps/install-apps/). Root shows the permissions Blitz asks for (see [below](#what-blitz-can-do-and-why)) before you approve.

   Installing an App gives it a channel of its own: that's **Blitz's domain**. Rename it to `blitz-domain` and drag it into **Ze Social Place** (or wherever you like). `!blitz` links to it under whatever name it has.

## 5. Run setup in the real community

Same as in the test community: `!setup` to preview, then `!setup confirm`.

When it's done, the report lists what was created, the finishing touches below, and any **heads up** items: things Root didn't let a bot do, which you can finish by hand in a few clicks.

Later, `!setup status` shows what's in place, and `!setup permissions` re-applies the template's permissions if something was changed by hand.

## 6. Give Blitz its brain (optional)

Out of the box Blitz reacts to messages with keywords: it gets the mood right most of the time, but it can't really answer anyone. Give it an Anthropic API key and Claude becomes its brain: it reads what people say to it, keeps up with the conversation, answers in its own voice and acts it out in the domain.

1. **Create a key** at [console.anthropic.com](https://console.anthropic.com) (Settings → API keys). The key belongs to whoever's Anthropic account it is, and so does the bill.
2. **Paste it into Blitz's settings in Root.** Blitz adds a **Blitz's brain** section to its App settings in your community, with an **Anthropic API key** field. Save, and Blitz picks it up right away; no restart needed.
3. **Try it:** say "hey blitz, what can you do?" in any channel.

Things to know:

- **Cost:** Blitz uses Claude Opus 5.5 at low effort, so most answers take a few seconds and cost around a cent each. To cap spending, Blitz answers at most 200 messages an hour (`brain.maxPerHour` in `config.ts`) and falls back to keywords after that. You can also set a spend limit in the Anthropic console, for example on a workspace just for Blitz.
- **Privacy:** messages that mention Blitz, plus the last 12 messages in that channel, are sent to Anthropic's API. Blitz keeps no record of them; its memory lasts only while it runs. `#the-vent-aka-hell` is never sent (`brain.skipIn`). Let the group know before you turn it on.
- **Who can see the key:** anyone who can manage Blitz's App settings in the community. Use a key made just for Blitz, so you can revoke it on its own.
- **While developing:** put `ANTHROPIC_API_KEY=...` in `blitz/server/.env` (next to `DEV_TOKEN`) instead.
- If Claude declines a message or can't be reached, Blitz quietly falls back to keywords for that message.

## 7. Finishing touches

These need you, not the bot:

1. **Give out Bitchiest Bitch.** Open the person's profile and add the role. ([Manage members](https://support.rootapp.com/docs/leader/members-and-invites/manage-members/)) Everyone already in the community got **Bitches** from setup; newcomers get it when they join.
2. **Order the roles.** In **Settings → Roles**, drag **Bitchiest Bitch** up right below **Admin**. ([Manage roles](https://support.rootapp.com/docs/leader/roles-permissions/role-tasks/))
3. **Pick a home for system messages.** In community settings, set `#bitches-yapping` as the default channel. Root posts its own notices there (like "someone joined").
4. **Place the domain.** If you haven't yet, rename Blitz's channel to `blitz-domain` and move it into **Ze Social Place** (step 4).
5. **Make it look like yours.** Upload a community icon and banner.

## 8. Bring everyone over

Three posts for the Discord, ready to edit:

**A week before: the heads-up**
```
📣 We're moving to Root! ✨

Same channels, same chaos, new app. Voice, video and screen share are all there, plus Blitz: quote wall, birthdays, polls, levels.

🗓️ Moving day: <DATE>
🔗 Get Root early: https://www.rootapp.com
```

**Moving day: the invite**
```
✨ We're live on Root: <INVITE LINK>
Everything's where you left it. Say hi to Blitz in #bot-commands with !help, summon it with !blitz, and react 🗣️ on anything quote-worthy.
```

**A few days later: the last call**
```
⏰ This Discord goes read-only on <DATE>. Everything happens on Root now: <INVITE LINK>
Post your old level in #bot-commands and it'll be carried over.
```

Tips:
- **Carry levels over.** Ask people to post their old rank, then an admin runs `!setxp @someone level 12`.
- **Message history doesn't move.** Save anything precious (pinned messages, `#quotes`) before the Discord goes quiet.
- **Make the old server read-only** a week or two after the move rather than deleting it right away.

---

## What Blitz can do, and why

These are the permissions in [`root-manifest.json`](../blitz/root-manifest.json). Root shows them when you install Blitz.

| Permission | Used for |
| --- | --- |
| Manage roles | Creating the template's roles; giving Bitches to newcomers and Birthday Bitch on birthdays |
| Create channel groups | Creating the categories during setup |
| Channel full control | Creating channels and their permissions |
| View, read history, post, mention, react | Posting welcomes, how-to notes, polls and quotes; seeding reactions; reacting when someone talks to Blitz |
| Delete others' messages | Auto-mod and `!clear` |
| Manage pins | Pinning the how-to notes |

Blitz can't kick or ban. That stays with you. The domain needs no extra permissions: it lives in the channel Root gives the App.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| `Unable to find .env with a DEV_TOKEN` | Run `npm run configure` in the `blitz` folder and paste your DEV_TOKEN (step 2). |
| `Manifest validation error: id is not an app id`, or "Blitz doesn't know its App ID yet" | Run `npm run configure` and paste the App ID from the Developer Portal. |
| The upload is refused because of the version | Run `npm run upload` again: it uses the next version each time. |
| Blitz doesn't answer commands | Is it running (`npm run server`) or installed? Commands start with `!`. Blitz ignores other bots, so test from your own account. |
| In testing, Blitz starts fine but never answers `!setup` | Look at the line **Blitz is up in the community "…"**: type `!setup` in *that* community. Your DEV_TOKEN picks it, and Root names it after your project (like `Blitz-test`), so it's not the community you made yourself. When Blitz sees a command it logs **heard !setup**; if nothing shows, it's in a different community. If the log says **Blitz can't read the chat**, Root didn't give it its permissions: make sure you have the latest version (it starts the dev host with `root-manifest.dev.json` to work around a dev host bug), then stop Blitz (Ctrl+C) and run `npm run server` again. |
| Blitz says "is a private App made for another community" in your own community | The package was locked to a different account, or the community changed owner. Run `npm run server` in your own test community once (or list owners' user IDs as `BLITZ_OWNERS=...` in `blitz/server/.env`), then run `npm run upload` again. |
| `npm run upload` says Blitz doesn't know who you are yet | Run `npm run server` and wait for the line saying it noted you as the owner, stop it with Ctrl+C, then upload. |
| The dev host says the data belongs to a different community | You switched to a token for another community. Delete `blitz/server/rootsdk.sqlite3` and start again. |
| The domain says "just yours" (solo) | It couldn't reach Blitz's server. Inside Root: is Blitz installed and running? In development: is `npm run server` still running? Solo Blitz still works, it just isn't shared. |
| `!blitz` says the domain isn't set up | Blitz didn't get its App channel. Make sure it was installed as an App (step 2) and reinstall it. |
| `🔒 … is for admins only` | `!setup` needs the community owner or a role with Manage Community / Full Control. |
| "Created without its special permissions" in the report | Root didn't let a bot hand out those powers. Open the role in **Settings → Roles** and tick them ([layout doc](SERVER-LAYOUT.md) lists what each should have). |
| A channel or category got a slightly different name | Root rejected the original (for example `Important!!!`), so setup used a plain version. Rename it by hand if you like; Blitz remembers it by ID. |
| Nothing happens on `!setup confirm` a second time | Everything already exists. That's expected; setup never duplicates. |
| Blitz only answers with short canned lines | It has no brain yet, or the key isn't working. Check step 6; Blitz's log says "Claude rejected Blitz's API key" if the key is wrong. |
| Blitz takes a few seconds to answer | That's Claude thinking; the domain shows a thought bubble meanwhile. Set `brain.effort` to `"low"` (the default) if you raised it. |
| `Root is rate limiting me` | Root allows about five changes per second. Blitz queues and retries automatically; wait a moment and try again. |

Still stuck? Root's developer docs: [docs.rootapp.com](https://docs.rootapp.com).
