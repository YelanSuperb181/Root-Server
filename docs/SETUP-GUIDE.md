# Moving to Root: the step-by-step guide

This takes you from "we're on Discord" to the same server on Root with Wisp running in it. Plan for about an hour the first time, most of it reading.

**You'll need:** a Root account and the Root **desktop** app (some developer and import features aren't on mobile), [Node.js](https://nodejs.org) 22 or newer, and this repository on your computer.

- [1. Create the Root community](#1-create-the-root-community)
- [2. Register Wisp](#2-register-wisp)
- [3. Build and try it in your test community](#3-build-and-try-it-in-your-test-community)
- [4. Upload Wisp and install it](#4-upload-wisp-and-install-it)
- [5. Run setup in the real community](#5-run-setup-in-the-real-community)
- [6. Finishing touches](#6-finishing-touches)
- [7. Bring everyone over](#7-bring-everyone-over)
- [Troubleshooting](#troubleshooting)

---

## 1. Create the Root community

First, list everyone's mailbox channel in `bot/src/blueprint/mailboxes.local.ts` (see the [README](../README.md#before-you-build-the-mailboxes)). It stays on your computer and is never uploaded to GitHub.

Then pick one of two routes:

- **Fresh (recommended):** in Root, select **+** in the tab bar, then **Create community**. Wisp's `!setup` builds everything.
- **Import, then fill gaps:** Root can [import your Discord server template](https://support.rootapp.com/docs/leader/community/import-discord-template/) (in Discord: Server Settings → Server Template). That copies categories, channels and roles. Wisp's `!setup` then recognizes them by name, emoji and all, adds what's missing, and leaves the rest alone. This only works if the names in `mailboxes.local.ts` match Discord exactly; otherwise you get a second copy of each mailbox.

A brand-new Root community comes with an **Admin** role (yours) and a default `#general`. Setup leaves `#general` alone; delete it afterwards if you don't want it.

## 2. Register Wisp

Root Bots are registered in the **Root Developer Portal**. Root's guide walks through it with screenshots: [Set up Root and your dev machine](https://docs.rootapp.com/docs/bot-docs/get-started/setup-root-and-dev-machine/).

1. Turn on **Developer Mode** in Root's settings, then open the **Developer Portal**.
2. Create a new **Bot** project called **Wisp**.
3. Copy the project's **App ID** into [`bot/root-manifest.json`](../bot/root-manifest.json), replacing `your-bot-id`.
4. Generate a **DEV_TOKEN** (My bots → Wisp → Settings → Generate new dev token) and save it in a new file `bot/.env` (copy [`bot/.env.example`](../bot/.env.example)):
   ```
   DEV_TOKEN=paste-your-token-here
   ```
   Root creates a private **test community** for you the first time you generate a token. Wisp runs there while you develop, so you can try everything without touching the real server.

> `.env` is in `.gitignore`. Never commit or share your token; whoever has it can act as Wisp.

## 3. Build and try it in your test community

```bash
cd bot
npm install      # installs the Root SDK
npm test         # checks the template and runs the unit tests
npm run build
npm run bot      # starts Wisp on your computer, connected to your test community
```

Leave that terminal running and open your **test community** in Root:

1. In any channel, type **`!setup`**. Wisp replies with a preview of what it will create. Nothing has changed yet.
2. Type **`!setup confirm`**. Wisp builds everything in a minute or two, then replaces its progress message with a report.
3. Look around: try `!help`, `!rank`, `!poll Lunch? | Pizza | Salad`, `!birthday July 14`, and react 🗣️ on a message from a second account.

Want to change something? Edit the template or config (see [CUSTOMIZING.md](CUSTOMIZING.md)), run `npm test && npm run build`, restart `npm run bot`, and run `!setup` again. It only adds what's new.

## 4. Upload Wisp and install it

While `npm run bot` runs, Wisp lives on your computer. To keep it running 24/7, upload it to Root's cloud. Root's guide: [Upload your code](https://docs.rootapp.com/docs/bot-docs/publish/upload/).

1. **Bump the version** in `root-manifest.json` (for example `1.0.0` → `1.0.1`). Root refuses a version it already has, so do this before every upload.
2. **Package it:**
   ```bash
   npm run package          # builds and writes wisp.rootpkg
   ```
3. **Upload it** with the publishing token from the Developer Portal (a different token from `DEV_TOKEN`):
   ```bash
   npx rootsdk upload package -f wisp.rootpkg -a YOUR_AUTH_TOKEN
   ```
4. **Install Wisp in the real community** from Root's app directory, like any App or Bot: [Install Apps and Bots](https://support.rootapp.com/docs/leader/apps/install-apps/). Root shows the permissions Wisp asks for (see [below](#what-wisp-can-do-and-why)) before you approve.

## 5. Run setup in the real community

Same as in the test community: `!setup` to preview, then `!setup confirm`.

When it's done, the report lists what was created, the finishing touches below, and any **heads up** items: things Root didn't let a bot do, which you can finish by hand in a few clicks.

Later, `!setup status` shows what's in place, and `!setup permissions` re-applies the template's permissions if something was changed by hand.

## 6. Finishing touches

These need you, not the bot:

1. **Give out Bitchiest Bitch.** Open the person's profile and add the role. ([Manage members](https://support.rootapp.com/docs/leader/members-and-invites/manage-members/)) Everyone already in the community got **Bitches** from setup; newcomers get it when they join.
2. **Order the roles.** In **Settings → Roles**, drag **Bitchiest Bitch** up right below **Admin**. ([Manage roles](https://support.rootapp.com/docs/leader/roles-permissions/role-tasks/))
3. **Pick a home for system messages.** In community settings, set `#bitches-yapping` as the default channel. Root posts its own notices there (like "someone joined").
4. **Make it look like yours.** Upload a community icon and banner.

## 7. Bring everyone over

Three posts for the Discord, ready to edit:

**A week before: the heads-up**
```
📣 We're moving to Root! ✨

Same channels, same chaos, new app. Voice, video and screen share are all there, plus Wisp: quote wall, birthdays, polls, levels.

🗓️ Moving day: <DATE>
🔗 Get Root early: https://www.rootapp.com
```

**Moving day: the invite**
```
✨ We're live on Root: <INVITE LINK>
Everything's where you left it. Say hi to Wisp in #bot-commands with !help, and react 🗣️ on anything quote-worthy.
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

## What Wisp can do, and why

These are the permissions in [`root-manifest.json`](../bot/root-manifest.json). Root shows them when you install the bot.

| Permission | Used for |
| --- | --- |
| Manage roles | Creating the template's roles; giving Bitches to newcomers and Birthday Bitch on birthdays |
| Create channel groups | Creating the categories during setup |
| Channel full control | Creating channels and their permissions |
| View, read history, post, mention, react | Posting welcomes, how-to notes, polls and quotes; seeding reactions |
| Delete others' messages | Auto-mod and `!clear` |
| Manage pins | Pinning the how-to notes |

Wisp can't kick or ban. That stays with you.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| `Unable to find .env with a DEV_TOKEN` | Create `bot/.env` with `DEV_TOKEN=...` from the Developer Portal (step 2). |
| `Manifest validation error: id is not an app id` | Put your App ID in `root-manifest.json` instead of `your-bot-id`. |
| The upload is refused because of the version | Bump `"version"` in `root-manifest.json`; it must go up on every upload. |
| Wisp doesn't answer commands | Is it running (`npm run bot`) or installed? Commands start with `!`. Wisp ignores other bots, so test from your own account. |
| `🔒 … is for admins only` | `!setup` needs the community owner or a role with Manage Community / Full Control. |
| "Created without its special permissions" in the report | Root didn't let a bot hand out those powers. Open the role in **Settings → Roles** and tick them ([layout doc](SERVER-LAYOUT.md) lists what each should have). |
| A channel or category got a slightly different name | Root rejected the original (for example `Important!!!`), so setup used a plain version. Rename it by hand if you like; Wisp remembers it by ID. |
| Nothing happens on `!setup confirm` a second time | Everything already exists. That's expected; setup never duplicates. |
| `Root is rate limiting me` | Root allows about five changes per second. Wisp queues and retries automatically; wait a moment and try again. |

Still stuck? Root's developer docs: [Root Bots FAQ](https://docs.rootapp.com/docs/bot-docs/faq/).
