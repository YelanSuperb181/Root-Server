# Moving to Root: the step-by-step guide

This takes you from "we're on Discord" to a finished Root community with Sprout running in it. Plan for about an hour the first time, most of it reading.

**You'll need:** a Root account and the Root **desktop** app (some developer and import features aren't on mobile), [Node.js](https://nodejs.org) 22 or newer, and this repository on your computer.

- [1. Create your Root community](#1-create-your-root-community)
- [2. Register Sprout as your bot](#2-register-sprout-as-your-bot)
- [3. Build and try it in your test community](#3-build-and-try-it-in-your-test-community)
- [4. Upload Sprout and install it](#4-upload-sprout-and-install-it)
- [5. Run setup in your real community](#5-run-setup-in-your-real-community)
- [6. Finishing touches](#6-finishing-touches)
- [7. Bring everyone over](#7-bring-everyone-over)
- [Troubleshooting](#troubleshooting)

---

## 1. Create your Root community

In Root, select the **+** button in the tab bar at the top, then **Create community**. Pick a name, color and image.

> **Start fresh rather than importing your Discord template.** Root can [import a Discord server template](https://support.rootapp.com/docs/leader/community/import-discord-template/), but that copies your *old* layout. Sprout builds the new one, and mixing the two leaves duplicates. If you'd rather keep your Discord names, import the template and then rename the channels in [`layout.ts`](../bot/src/blueprint/layout.ts) to match: setup matches existing channels and roles by name and won't create a second copy.

A brand-new Root community comes with two roles (**EVERYONE** and **Admin**, which you have) and a default `#general`. Setup reuses both and moves `#general` into the new **Community** group.

## 2. Register Sprout as your bot

Root Bots are registered in the **Root Developer Portal**. Root's own guide walks through it with screenshots: [Set up Root and your dev machine](https://docs.rootapp.com/docs/bot-docs/get-started/setup-root-and-dev-machine/).

1. Turn on **Developer Mode** in Root's settings, then open the **Developer Portal**.
2. Create a new **Bot** project. Call it whatever you like; "Sprout" fits the welcome messages.
3. Copy the project's **App ID** into [`bot/root-manifest.json`](../bot/root-manifest.json), replacing `your-bot-id`:
   ```json
   { "id": "AbCdEf...your-app-id", "version": "1.0.0", ... }
   ```
4. Generate a **DEV_TOKEN** and save it in a new file `bot/.env` (copy [`bot/.env.example`](../bot/.env.example)):
   ```
   DEV_TOKEN=paste-your-token-here
   ```
   Root creates a private **test community** for you the first time you generate a token. Your bot runs there while you develop, so you can try everything without touching your real community.

> `.env` is in `.gitignore`. Never commit or share your token.

## 3. Build and try it in your test community

```bash
cd bot
npm install      # installs the Root SDK
npm test         # checks the blueprint and runs the unit tests
npm run build
npm run bot      # starts Sprout on your computer, connected to your test community
```

Leave that terminal running and open your **test community** in Root:

1. In any channel, type **`!setup`**. Sprout replies with a preview of what it will create. Nothing has changed yet.
2. Type **`!setup confirm`**. Sprout posts a progress message and builds everything in a minute or two, then replaces the progress message with a report.
3. Look around: read `#welcome`, react on the role pickers in `#roles`, try `!help`, `!rank`, `!poll Lunch? | Pizza | Salad` and `!8ball Will this be awesome?`.

Want to change something? Edit the blueprint or config (see [CUSTOMIZING.md](CUSTOMIZING.md)), run `npm test && npm run build`, restart `npm run bot`, and run `!setup` again. It only adds what's new.

## 4. Upload Sprout and install it

While `npm run bot` runs, Sprout lives on your computer. To keep it running 24/7, upload it to Root's cloud. Root's guide: [Upload your code](https://docs.rootapp.com/docs/bot-docs/publish/upload/).

1. **Bump the version** in `root-manifest.json` (for example `1.0.0` → `1.0.1`). Root refuses a version it already has, so do this before every upload.
2. **Package it:**
   ```bash
   npm run package          # builds and writes sprout.rootpkg
   ```
3. **Upload it** with the publishing token from the Developer Portal (a different token from `DEV_TOKEN`):
   ```bash
   npx rootsdk upload package -f sprout.rootpkg -a YOUR_AUTH_TOKEN
   ```
4. **Install Sprout in your real community** from Root's app directory, the same way you'd add any App or Bot: [Install Apps and Bots](https://support.rootapp.com/docs/leader/apps/install-apps/). Root shows the permissions Sprout asks for (see [below](#what-sprout-can-do-and-why)) before you approve.

## 5. Run setup in your real community

Same as in the test community: `!setup` to preview, then `!setup confirm`. Run it in a channel where you'll see the report (the default `#general` is fine).

When it's done, the report lists:
- what was created and moved,
- the finishing touches below,
- any **heads up** items: things Root didn't let a bot do, which you can finish by hand in a few clicks.

Later, `!setup status` shows what's in place, and `!setup permissions` re-applies the blueprint's permissions if something was changed by hand.

## 6. Finishing touches

These need you, not the bot:

1. **Give your team their roles.** Open a member's profile and add **Moderator** (or **Event Host**). Staff should have **Member** too. ([Manage members](https://support.rootapp.com/docs/leader/members-and-invites/manage-members/))
2. **Order the roles.** In **Settings → Roles**, drag **Moderator** and **Event Host** up right below **Admin**. ([Manage roles](https://support.rootapp.com/docs/leader/roles-permissions/role-tasks/))
3. **Pick a home for system messages.** In your community settings, set `#welcome` as the default channel. Root posts its own notices there (like "someone joined"), right next to the welcome guide.
4. **Make it look like yours.** Upload a community icon and banner, and edit the welcome text in [`content.ts`](../bot/src/blueprint/content.ts) to describe your community in your own words. Then `!setup refresh` updates the posts in place.
5. **Consider raid protection.** In community settings, requiring a verified email and throttling joins both slow down spam waves. Sprout's gate and auto-mod handle the rest.
6. **Delete leftovers.** If your community started with extra groups (like an empty "Text Channels"), the report names them. Deleting them is up to you.

## 7. Bring everyone over

A move goes best with a heads-up, a clear day, and a reason to show up. Here are three posts for your Discord, ready to edit.

**A week before: the heads-up**
```
📣 Big news: we're moving to Root! 🌱

Root is a community app like Discord, with voice, video and screen share, plus apps built right into the community.

Our new home is already set up: themed channels, a daily question, levels, birthday shout-outs, a hall of fame for the best posts and more.

🗓️ Moving day: <DATE>
🔗 Get Root early: https://www.rootapp.com
Questions? Ask here!
```

**Moving day: the invite**
```
🌱 We're live on Root! Come on in: <INVITE LINK>

When you arrive:
1️⃣ Read #rules and react ✅ to unlock everything
2️⃣ Pick your interests, pronouns, pings and name color in #roles
3️⃣ Say hi in #introductions

First game night on the Stage is <DAY/TIME>. See you there! 🎉
```

**A few days later: the last call**
```
⏰ Last call! This Discord goes read-only on <DATE>. Everything happens on Root now: <INVITE LINK>
Your Discord levels are coming with you. Post your rank in #help-desk and a mod will carry it over.
```

Tips:
- **Carry levels over.** Ask members to post a screenshot of their old rank, then `!setxp @member level 12` sets their level and hands out the matching role.
- **Host something on day one.** A game night on the `stage` or a "first ones here" thread in `#general` gives people a reason to stick around.
- **Make the old server read-only** a week or two after the move and pin the invite in every channel, rather than deleting it right away.
- **Recreate custom emoji** in Root's community settings; they work in reactions too.

---

## What Sprout can do, and why

These are the permissions in [`root-manifest.json`](../bot/root-manifest.json). Root shows them when you install the bot.

| Permission | Used for |
| --- | --- |
| Manage roles | Creating the blueprint's roles; giving Member, level, color, pick-your-role and birthday roles |
| Create channel groups | Creating the groups during setup |
| Channel full control | Creating channels and their permissions, and seeing private channels (the mod log) |
| View, read history, post, mention, react | Posting welcomes and starter posts, pinging opt-in roles, seeding reactions on role pickers and polls |
| Delete others' messages | Auto-mod, `!clear`, and tidying `#suggestions` |
| Manage pins | Pinning the welcome guide, rules and how-tos |

Sprout can't kick or ban. Moderation decisions stay with your team.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| `Unable to find .env with a DEV_TOKEN` | Create `bot/.env` with `DEV_TOKEN=...` from the Developer Portal (step 2). |
| `Manifest validation error: id is not an app id` | Put your App ID in `root-manifest.json` instead of `your-bot-id`. |
| The upload is refused because of the version | Bump `"version"` in `root-manifest.json`; it must go up on every upload. |
| Sprout doesn't answer commands | Is it running (`npm run bot`) or installed? Commands start with `!` (see `prefix` in [`config.ts`](../bot/src/config.ts)). Sprout ignores other bots, so test from your own account. |
| `🔒 … is for admins only` | `!setup` needs the community owner or a role with Manage Community / Full Control. |
| "Created without its special permissions" in the report | Root didn't let a bot hand out those powers. Open the role in **Settings → Roles** and tick them (the [layout doc](SERVER-LAYOUT.md) lists what each role should have). |
| New members say they can only see Start Here | That's the gate working: they need to react ✅ on the rules post. If they did and still can't, check that **Member** exists (`!setup status`). |
| A staff member can't see members-only channels | Give them **Member** too, or make sure their role is Moderator. |
| Nothing happens on `!setup confirm` a second time | Everything already exists. That's expected; setup never duplicates. |
| `Root is rate limiting me` | Root allows about five changes per second. Sprout queues and retries automatically; wait a moment and try again. |
| The daily question comes at a bad time | Change `daily.hourUtc` in [`config.ts`](../bot/src/config.ts) and re-upload; the schedule updates itself. |

Still stuck? Root's developer docs: [Root Bots FAQ](https://docs.rootapp.com/docs/bot-docs/faq/).
