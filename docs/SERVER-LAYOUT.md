# Server layout

> Generated from [`bot/src/blueprint/layout.ts`](../bot/src/blueprint/layout.ts) by `npm run docs`. Edit the blueprint, not this file.

**6 channel groups · 23 text channels · 6 voice channels · 29 roles**

The onboarding gate is **on**: newcomers see only **Start Here** until they react ✅ on the rules post, which gives them the **Member** role and unlocks everything else.

## Channels

### Start Here

The front door: what this place is, the rules, news and events. Everyone can read it; only the team posts. _(visible to everyone; read-only except for Moderator)_

| Channel | Type | What it's for | Access |
| --- | --- | --- | --- |
| `welcome` | 💬 text | 👋 New here? Start with this channel: it explains everything. | same as group |
| `rules` | 💬 text | 📜 The house rules. React ✅ on the rules post to unlock the community. | same as group |
| `announcements` | 💬 text | 📣 News from the team. Pick the Announcements Ping role to be notified. | same as group |
| `events` | 💬 text | 📅 Game nights, watch parties and community events. Pick the Events Ping role to be notified. | visible to everyone; read-only except for Moderator and Event Host |
| `roles` | 💬 text | 🎭 Pick your pronouns, interests, pings and name color by reacting. | visible to Moderator and Member; read-only except for Moderator |

### Community

Where most of the talking happens. _(visible to Member and Moderator)_

| Channel | Type | What it's for | Access |
| --- | --- | --- | --- |
| `general` | 💬 text | 💬 The main hangout. Chat about anything. | same as group |
| `introductions` | 💬 text | 🙋 New? Tell us about yourself! There's a template in the pins. | same as group |
| `daily-question` | 💬 text | 🌞 A new question every day. Answer it, then read everyone else's. | same as group |
| `show-and-tell` | 💬 text | 📸 Pets, photos, setups, wins and things you made. | same as group |
| `memes` | 💬 text | 😂 Memes, jokes and good vibes. Keep it kind. | same as group |
| `celebrations` | 💬 text | 🎉 Birthdays, level-ups and wins worth cheering for. | same as group |
| `hall-of-fame` | 💬 text | ⭐ The best messages, voted by you. React ⭐ on any message to nominate it. | visible to Member and Moderator; read-only |
| `bot-commands` | 💬 text | 🤖 Play with Sprout here: !help, !rank, !8ball and more. | same as group |

### Interests

One channel per hobby. Each has a matching pingable role in #roles. _(visible to Member and Moderator)_

| Channel | Type | What it's for | Access |
| --- | --- | --- | --- |
| `gaming` | 💬 text | 🎮 What are you playing? Clips, LFG and hot takes. Ping @Gamer for a squad. | same as group |
| `creative-corner` | 💬 text | 🎨 Art, writing, music and crafts. Share what you make and cheer each other on. | same as group |
| `tech-talk` | 💬 text | 💻 Code, gadgets, setups and tech help. | same as group |
| `music` | 💬 text | 🎧 Recs, playlists, concerts and the song stuck in your head. | same as group |
| `movies-and-shows` | 💬 text | 🍿 Movies, series and anime. Please mark spoilers! | same as group |
| `food-and-drink` | 💬 text | 🍜 Recipes, food pics and late-night snack debates. | same as group |

### Voice

Drop-in voice rooms. No invite needed: just join. _(visible to Member and Moderator)_

| Channel | Type | What it's for | Access |
| --- | --- | --- | --- |
| `lounge` | 🔊 voice | 🛋️ Drop in and hang out. | same as group |
| `gaming-room` | 🔊 voice | 🎮 Squad up and play together. | same as group |
| `music-and-chill` | 🔊 voice | 🎶 Listen together, low-key vibes. | same as group |
| `focus-room` | 🔊 voice | 📚 Co-working and study. Mics muted, cameras optional. | same as group |
| `stage` | 🔊 voice | 🎤 Community events. Hosts speak, everyone else listens. | visible to Member and Moderator; listen-only except for Moderator and Event Host |

### Feedback and Help

Shape the community and get help from the team. _(visible to Member and Moderator)_

| Channel | Type | What it's for | Access |
| --- | --- | --- | --- |
| `suggestions` | 💬 text | 💡 Type an idea here and Sprout turns it into a vote. | same as group |
| `help-desk` | 💬 text | 🆘 Questions about the community? Ask here and the team will help. | same as group |

### Staff

Private to Moderators and Admins. _(visible to Moderator)_

| Channel | Type | What it's for | Access |
| --- | --- | --- | --- |
| `staff-chat` | 💬 text | 🛡️ Private chat for the team. | same as group |
| `mod-log` | 💬 text | 📋 Sprout's log: auto-mod actions, joins and leaves, setup reports. | same as group |
| `staff-room` | 🔊 voice | 🔒 Private voice for the team. | same as group |

## Roles

### Staff

| Role | Color | Pingable | Self-assignable | Notes |
| --- | --- | --- | --- | --- |
| **Admin** | default | no | no | Runs the place. Root gives this role (full control) to the community's creator. _(built into Root)_ |
| **Moderator** | `#2ED3A0` | yes | no | Keeps things friendly: can remove messages, kick, ban and manage voice. |
| **Event Host** | `#E879F9` | yes | no | Runs game nights and watch parties: posts in #events and speaks on the Stage. |

### Membership

| Role | Color | Pingable | Self-assignable | Notes |
| --- | --- | --- | --- | --- |
| **Member** | default | no | no | Given automatically when someone reacts ✅ to the rules. Unlocks the community. |

### Level rewards

| Role | Color | Pingable | Self-assignable | Notes |
| --- | --- | --- | --- | --- |
| **Legend** | `#FFB800` | no | no | Reached level 30. A pillar of the community. |
| **Veteran** | `#9B8AFB` | no | no | Reached level 15. Been here, seen things. |
| **Regular** | `#5EB1EF` | no | no | Reached level 5. A familiar face. |

### Special

| Role | Color | Pingable | Self-assignable | Notes |
| --- | --- | --- | --- | --- |
| **Birthday Star** | `#FF8FAB` | no | no | Worn for 24 hours on your birthday (set it with !birthday). |

### Name colors

| Role | Color | Pingable | Self-assignable | Notes |
| --- | --- | --- | --- | --- |
| **Ruby** | `#FF5C5C` | no | yes | Red name color. |
| **Amber** | `#FF9F43` | no | yes | Orange name color. |
| **Citrine** | `#FFD93D` | no | yes | Yellow name color. |
| **Jade** | `#3DDC84` | no | yes | Green name color. |
| **Sapphire** | `#4C8DFF` | no | yes | Blue name color. |
| **Amethyst** | `#A66CFF` | no | yes | Purple name color. |
| **Rose** | `#FF7EC8` | no | yes | Pink name color. |

### Interests

| Role | Color | Pingable | Self-assignable | Notes |
| --- | --- | --- | --- | --- |
| **Gamer** | default | yes | yes | Games of every kind. Pinged for squads and game nights. |
| **Creator** | default | yes | yes | Artists, writers, musicians and makers. |
| **Techie** | default | yes | yes | Code, gadgets and builds. |
| **Music Lover** | default | yes | yes | Always has a recommendation ready. |
| **Movie Buff** | default | yes | yes | Movies, series and anime. |
| **Foodie** | default | yes | yes | Cooks, bakers and snack critics. |

### Notification pings

| Role | Color | Pingable | Self-assignable | Notes |
| --- | --- | --- | --- | --- |
| **Announcements Ping** | default | yes | yes | Get pinged for important news. |
| **Events Ping** | default | yes | yes | Get pinged when an event is announced. |
| **Daily Question Ping** | default | yes | yes | Get pinged for the question of the day. |

### Pronouns

| Role | Color | Pingable | Self-assignable | Notes |
| --- | --- | --- | --- | --- |
| **he/him** | default | no | yes | Pronouns: he/him. |
| **she/her** | default | no | yes | Pronouns: she/her. |
| **they/them** | default | no | yes | Pronouns: they/them. |
| **any pronouns** | default | no | yes | Any pronouns are fine. |
| **ask my pronouns** | default | no | yes | Ask before assuming. |

## Role pickers in `#roles`

**🎯 Interests**: 🎮 Gamer · 🎨 Creator · 💻 Techie · 🎧 Music Lover · 🍿 Movie Buff · 🍜 Foodie

**🔔 Notifications**: 📣 Announcements Ping · 📆 Events Ping · ☀️ Daily Question Ping

**💬 Pronouns**: 💚 he/him · 💛 she/her · 💜 they/them · 🤍 any pronouns · 💬 ask my pronouns

**🎨 Name color** (pick one): 🔴 Ruby · 🟠 Amber · 🟡 Citrine · 🟢 Jade · 🔵 Sapphire · 🟣 Amethyst · 🌸 Rose

## Levels

15-25 XP per message, at most once every 60 seconds. Rewards: level 5 → **Regular**, level 15 → **Veteran**, level 30 → **Legend** (members keep only their highest).
