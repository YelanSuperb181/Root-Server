# Server layout

> Generated from [`wisp/server/src/blueprint/layout.ts`](../wisp/server/src/blueprint/layout.ts) by `npm run docs`. Edit the blueprint, not this file.

**7 channel groups · 30 text channels · 1 voice channel · 4 roles**

## Channels

### Important!!!

The stuff that matters (and the stuff that really doesn't). _(visible to everyone)_

| Channel | Type | What it's for | Access |
| --- | --- | --- | --- |
| `announcements` | 💬 text | ‼️ Big news. Only the Bitchiest Bitch posts here. | visible to everyone; read-only except for Bitchiest Bitch |
| `polls` | 💬 text | 📊 Settle it democratically. Start one with !poll | same as group |
| `freakiest-freakstars` | 💬 text | 👅 Freakiest freakstars only. | same as group |
| `jockie-music-status` | 💬 text | 🎵 What's playing. | same as group |
| `dyno-status` | 💬 text | 🤖 Wisp's log: joins, leaves and anything auto-mod removed. | visible to everyone; read-only except for Bitchiest Bitch |
| `birthdays` | 💬 text | 🎂 Birthday shout-outs. Save yours with !birthday | same as group |
| `personality-types` | 💬 text | 🧬 MBTI, enneagram, star signs, all of it. | same as group |
| `quotes` | 💬 text | 🗣️ Things that should never have been said. React 🗣️ on any message to send it here. | same as group |

### Ze Social Place

Where the yapping happens. _(visible to everyone)_

| Channel | Type | What it's for | Access |
| --- | --- | --- | --- |
| `bitches-yapping` | 💬 text | ✨ The main chat. | same as group |
| `games` | 💬 text | 🎮 Games, clips and who's getting on tonight. | same as group |
| `fm-bot` | 💬 text | 🎶 Music stats and now playing. | same as group |
| `bot-commands` | 💬 text | 💡 Talk to Wisp here: !help | same as group |
| `availability` | 💬 text | 🗓️ Who's free, who's busy, who's asleep. | same as group |

### Bitch Mailing Service

A mailbox channel for each of you, plus one for everyone. The mailboxes live in mailboxes.local.ts. _(visible to everyone)_

| Channel | Type | What it's for | Access |
| --- | --- | --- | --- |
| `to-all-bitches` | 💬 text | 📬 Mail for everyone. | same as group |
| _8 personal mailboxes_ | 💬 text | One per person, listed in `mailboxes.local.ts` (kept off GitHub) | same as group |

### Bitches Playing Minecraft

Everything Minecraft and the Realm. _(visible to everyone)_

| Channel | Type | What it's for | Access |
| --- | --- | --- | --- |
| `minecraft-chat` | 💬 text | ⛏️ Minecraft talk. | same as group |
| `minecraft-pics` | 💬 text | 📷 Builds, views and crimes against architecture. | same as group |
| `minecraft-coords` | 💬 text | 🗺️ Where everything is. | same as group |
| `realm-finance` | 💬 text | 💸 Who's paying for the Realm this month. | same as group |

### Bitches Playing Terraria

Everything Terraria. _(visible to everyone)_

| Channel | Type | What it's for | Access |
| --- | --- | --- | --- |
| `yappity-yap` | 💬 text | 🫧 Terraria talk. | same as group |
| `info` | 💬 text | 😳 World info, seeds and boss progress. | same as group |

### Yap... With Your Voices

Voice and the music that goes with it. _(visible to everyone)_

| Channel | Type | What it's for | Access |
| --- | --- | --- | --- |
| `music` | 💬 text | 💫 Song requests and what's on. | same as group |
| `bitches-endlessly-bitching` | 🔊 voice | 🌟 Bitches endlessly bitching. | same as group |

### Other

Everything else. _(visible to everyone)_

| Channel | Type | What it's for | Access |
| --- | --- | --- | --- |
| `the-vent-aka-hell` | 💬 text | 👁️ Vent freely. Nothing here gets quoted or earns XP. | same as group |

## Roles

### Staff

| Role | Color | Pingable | Self-assignable | Notes |
| --- | --- | --- | --- | --- |
| **Admin** | default | no | no | Root gives this role (full control) to whoever creates the community. _(built into Root)_ |
| **Bitchiest Bitch** | `#F23F6F` | yes | no | Top of the food chain: posts announcements, removes messages, kicks, bans and runs voice. |

### Membership

| Role | Color | Pingable | Self-assignable | Notes |
| --- | --- | --- | --- | --- |
| **Bitches** | `#B07CF0` | yes | no | Everyone. Wisp hands it out when someone joins. |

### Special

| Role | Color | Pingable | Self-assignable | Notes |
| --- | --- | --- | --- | --- |
| **Birthday Bitch** | `#FF8FC7` | no | no | Worn for 24 hours on your birthday (save yours with !birthday). |

## Role pickers in `#roles`

## Levels

15-25 XP per message, at most once every 60 seconds. Rewards:  (members keep only their highest).
