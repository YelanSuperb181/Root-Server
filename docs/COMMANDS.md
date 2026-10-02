# Blitz commands

Commands start with `!` (change it with `prefix` in [`config.ts`](../blitz/server/src/config.ts)). `!help` shows the commands *you* can use; `!help poll` explains one.

## For everyone

| Command | What it does |
| --- | --- |
| `!help [command]` | All commands, or details about one. Also `!commands`. |
| `!blitz` | Summon Blitz: links its domain, and Blitz lights up for everyone already inside. Also `!summon`, `!domain`. |
| `!rank [@someone]` | Level, XP progress bar, message count and leaderboard spot. Also `!level`, `!xp`. |
| `!top` | The 10 most active members. Also `!leaderboard`, `!lb`. |
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
| `!choose a \| b \| c` | Let Blitz decide (also `a, b` or `a or b`). Also `!pick`. |
| `!ping` | Is Blitz awake? |

## Without commands

| Do this | And Blitz… |
| --- | --- |
| React 🗣️ on a message | At 2 reactions (or however many the community set) from people other than the author, saves it to the quote wall with a live count. Only if a quote wall channel is picked, and never from private channels. |
| Join the community | Welcomes you in the welcome channel and gives you the role for new members, if the community picked them. |
| Chat | Earns 15-25 XP, at most once a minute (not in private channels or the staff log). Level-ups are announced where they happened, or in the level-up channel. |
| Say "blitz" (or @mention it, or reply to it) | Answers you. With its brain on (an Anthropic API key, see the [setup guide](SETUP-GUIDE.md#give-blitz-its-brain-optional)) it reads the conversation and replies in its own voice; without, it reacts to the mood with a canned line. Either way it leaves an emoji and acts it out in the domain. See [the README](../README.md#talking-to-blitz). |
| Open Blitz's domain | Drag Blitz to carry it, let go to fling it, slam it into the wall, tap to poke it (arrow keys and space work too), or type to it. Hold it against the wall long enough and the bubble bursts into an endless universe full of space rocks to crash into; **Seal the bubble** brings it back. Everyone inside shares the same Blitz. |
| Have a birthday | A shout-out in the birthday channel and the birthday role for the day (16:00 UTC), if the community picked them. |

## For staff

Staff are the community owner, roles that can manage the community, kick or ban, and anyone on the **Staff** list in Blitz's App settings.

| Command | What it does |
| --- | --- |
| `!settings` | What Blitz is set up to do here: its channels, roles and switches. |
| `!announce [#channel] <message>` | Posts an announcement here, or in the channel you mention. |
| `!event [#channel] <details>` | Posts an event here, or in the channel you mention. |
| `!say [#channel] <message>` | Post as Blitz. |
| `!clear <1-49>` | Delete the last messages in this channel. Also `!purge`. |
| `!setxp @someone <xp>` | Set someone's XP. `!setxp @someone level 12` sets a level instead. Handy for carrying levels over from another app. |

## Automatic

- **Auto-mod** (never touches staff; switch it off in Blitz's settings): removes messages with more than 8 mentions, more than 7 messages in 8 seconds, the same text 4 times in 30 seconds, or anything on the blocked-words list in `config.ts`. The person sees a short note that disappears after 10 seconds, it's noted in the staff log, and staff roles get pinged after 3 removals in 10 minutes.
- **Joins and leaves** are noted in the staff log.
