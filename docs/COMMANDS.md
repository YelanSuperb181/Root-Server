# Wisp commands

Commands start with `!` (change it with `prefix` in [`config.ts`](../wisp/server/src/config.ts)). `!help` shows the commands *you* can use; `!help poll` explains one.

## For everyone

| Command | What it does |
| --- | --- |
| `!help [command]` | All commands, or details about one. Also `!commands`. |
| `!wisp` | Summon Wisp: links its domain, and Wisp lights up for everyone already inside. Also `!summon`, `!domain`. |
| `!rank [@someone]` | Level, XP progress bar, message count and leaderboard spot. Also `!level`, `!xp`. |
| `!top` | The 10 biggest yappers. Also `!leaderboard`, `!lb`. |
| `!levels` | How XP works. |
| `!quote` | A random message from the quote wall. |
| `!birthday July 14` | Save your birthday (month and day only). `!birthday` shows it, `!birthday remove` forgets it. Also accepts `07-14` and `14 July`. |
| `!birthdays` | Who's celebrating next. |
| `!poll [time] Question? \| A \| B …` | A reaction poll with 2-10 options, or yes/no without options. Add `30m`, `2h` or `3d` to close it automatically with a results card. |
| `!endpoll <number>` | Close a poll now (its author or the team). |
| `!server` | Community info. Also `!about`. |
| `!8ball <question>` | Ask the magic 8-ball. |
| `!roll [d20 \| 2d6+1 \| 100]` | Roll dice (default 1d6). Also `!dice`. |
| `!flip` | Flip a coin. Also `!coin`. |
| `!choose a \| b \| c` | Let Wisp decide (also `a, b` or `a or b`). Also `!pick`. |
| `!ping` | Is Wisp awake? |

## Without commands

| Do this | And Wisp… |
| --- | --- |
| React 🗣️ on a message | At 2 reactions from people other than the author, saves it to `#quotes` with a live count. Never from `#the-vent-aka-hell`. |
| Join the community | Gives you **Bitches** and welcomes you in `#bitches-yapping`. |
| Chat | Earns 15-25 XP, at most once a minute (not in `#bot-commands`, `#the-vent-aka-hell` or `#dyno-status`). Level-ups are announced in `#bot-commands`. |
| Say "wisp" (or @mention it, or reply to it) | Reacts with an emoji that matches your mood, sometimes answers with a little line, and acts it out in the domain for everyone watching. See [the README](../README.md#talking-to-wisp) for what it picks up on. |
| Open Wisp's domain | Drag Wisp to carry it, let go to fling it, slam it into the wall, tap to poke it (arrow keys and space work too), or type to it. Hold it against the wall long enough and the bubble bursts into fullscreen. Everyone inside shares the same Wisp. |
| Have a birthday | A shout-out in `#birthdays` and **Birthday Bitch** for the day (16:00 UTC). |

## For the Bitchiest Bitch (and admins)

| Command | What it does |
| --- | --- |
| `!announce <message>` | Posts in `#announcements`. |
| `!event <details>` | Posts an event in `#announcements`. |
| `!say [#channel] <message>` | Post as Wisp. |
| `!clear <1-50>` | Delete the last messages in this channel. Also `!purge`. |

## For admins

Admins are the community owner and roles with **Manage Community** or **Full Control**.

| Command | What it does |
| --- | --- |
| `!setup` | Preview what setup would create. Changes nothing. |
| `!setup confirm` | Build it: categories, channels, roles, permissions, pinned how-to notes, and **Bitches** for everyone already here. |
| `!setup content` | Post any missing how-to notes. |
| `!setup refresh` | Re-render the how-to notes after editing [`content.ts`](../wisp/server/src/blueprint/content.ts). |
| `!setup permissions` | Re-apply the template's channel permissions to what exists. Rules for other roles are left alone. |
| `!setup status` | What's in place and what's missing. |
| `!setxp @someone <xp>` | Set someone's XP. `!setxp @someone level 12` sets a level instead. Handy for carrying Discord levels over. |

## Automatic

- **Auto-mod** (never touches the Bitchiest Bitch or admins): removes messages with more than 8 mentions, more than 7 messages in 8 seconds, the same text 4 times in 30 seconds, or anything on your blocked-words list. The person sees a short note that disappears after 10 seconds, it's logged in `#dyno-status`, and the Bitchiest Bitch gets pinged after 3 removals in 10 minutes.
- **Joins and leaves** are logged in `#dyno-status`.

## Switched off (turn on in `config.ts`)

- **Question of the day** (`!qotd`): needs a channel to post in.
- **Suggestions** (`!suggest`, `!approve`, `!decline` and friends): needs a suggestions channel.
- **Level reward roles**: add `{ level: 10, role: "some-role-key" }` entries to `levels.rewards`.
