# Blitz commands

Commands start with `!` (change it with `prefix` in [`config.ts`](../blitz/server/src/config.ts)). `!help` shows the commands *you* can use; `!help poll` explains one.

When someone uses one of the commands for everyone (the community's own included), Blitz's reply ends with a 🔮 link into its domain. Not in private channels or the staff logs, not for `!report`, `!warnings` or reminders, and not when the community ticks **Turn off domain links** in Blitz's settings.

Every command can also be run from **Blitz's menu**, beside its domain, with the same rules about who can use what. Commands that post into a channel (`!announce`, `!event`, `!poll`, `!say`) ask which channel there; `!clear` only works in chat, since it clears the channel it's typed in.

## For everyone

| Command | What it does |
| --- | --- |
| `!help [command]` | All commands, or details about one. Also `!commands`. |
| `!blitz` | A link into Blitz's domain, where you get your own Blitz to play with. Also `!summon`, `!domain`. |
| `!rank [@someone]` | Level, XP progress bar, message count and leaderboard spot. Also `!level`, `!xp`. |
| `!top` | The 10 most active members. Also `!leaderboard`, `!lb`. |
| `!levels` | How XP works. |
| `!quote` | A random message from the quote wall. |
| `!birthday July 14` | Save your birthday (month and day only). `!birthday` shows it, `!birthday remove` forgets it. Also accepts `07-14` and `14 July`. |
| `!birthdays` | Who's celebrating next. |
| `!poll [time] Question? \| A \| B …` | A reaction poll with 2-10 options, or yes/no without options. Add `30m`, `2h` or `3d` to close it automatically with a results card. |
| `!endpoll <number>` | Close a poll now (its author or the team). |
| `!server` | Community info. Also `!about`. |
| `!cmds` | This community's own commands (made by the team with `!addcmd`). Each one works as `!name`. |
| `!remind <when> <what>` | A reminder: `!remind 2h stretch`, `!remind in 30 minutes check the oven`, `!remind 1d12h renew the server`. Blitz pings you in the same channel, with a notification. Also `!remindme`. |
| `!reminders` | Your upcoming reminders. `!forget <number>` cancels one. |
| `!roles` | Roles you can give yourself. `!role <name>` adds one, or takes it off if you have it (part of the name is enough). Also `!iam`. |
| `!suggest <idea>` | Posts your idea in the suggestions channel for 👍/👎 votes. |
| `!report [@someone] <what happened>` | Quietly tells the team: your message disappears from the chat and goes to the staff log. Reply to a message with `!report` to include it. |
| `!warnings` | Your warnings, if you have any. |
| `!8ball <question>` | Ask the magic 8-ball. |
| `!roll [d20 \| 2d6+1 \| 100]` | Roll dice (default 1d6). Also `!dice`. |
| `!flip` | Flip a coin. Also `!coin`. |
| `!choose a \| b \| c` | Let Blitz decide (also `a, b` or `a or b`). Also `!pick`. |
| `!ping` | Is Blitz awake? |

## Without commands

| Do this | And Blitz… |
| --- | --- |
| React 🗣️ on a message | At 2 reactions (or however many the community set) from people other than the author, saves it to the quote wall with a live count. Only if a quote wall channel is picked, and never from private channels. |
| Join the community | Welcomes you in the welcome channel (with the community's own message, if it wrote one) and gives you the role for new members, if the community picked them. |
| Chat | Earns 15-25 XP, at most once a minute (not in private channels or the staff log). Level-ups are announced where they happened, or in the level-up channel. |
| Say "blitz" (or @mention it, or reply to it) | Answers you. With its brain on (an Anthropic API key, see the [setup guide](SETUP-GUIDE.md#give-blitz-its-brain-optional)) it reads the conversation and replies in its own voice; without, it reacts to the mood with a canned line. Either way it leaves an emoji and acts it out in the domain. See [the README](../README.md#talking-to-blitz). |
| Open Blitz's domain | Drag Blitz to carry it, let go to fling it, slam it into the wall, tap to poke it (arrow keys and space work too), or type to it. Hold it against the wall long enough and the bubble bursts into an endless universe full of space rocks to crash into; **Seal the bubble** brings it back. Everyone gets their own Blitz. |
| Have a birthday | A shout-out in the birthday channel and the birthday role for the day (16:00 UTC), if the community picked them. |

## For staff

Staff are the community owner, roles that can manage the community, kick or ban, and anyone on the **Staff** list in Blitz's App settings. Admins are the owner and roles that can manage the community.

### Moderation

Every action is saved as a numbered **case** and noted in the staff log. Instead of `@someone` you can reply to one of their messages, or (for `!unban`) use their user ID. Staff can only act on people ranked below them: mods on members, admins on mods, and nobody on the owner.

| Command | What it does |
| --- | --- |
| `!warn @someone <reason>` | A warning, kept in their history. |
| `!warnings @someone` | Someone's standing warnings. |
| `!unwarn <case>` | Take a warning back. |
| `!mute @someone [30m] [reason]` | Blitz removes everything they post for a while: 1 hour unless you say, up to 28 days. No mute role needed. Also `!timeout`. |
| `!unmute @someone` | End a mute early. |
| `!kick @someone [reason]` | Remove them from the community (they can rejoin). |
| `!ban @someone [7d] [reason]` | Ban them for good, or for a while. |
| `!unban <@someone or user ID>` | Lift a ban. |
| `!bans` | Who's banned, until when and why, with their user IDs. |
| `!note @someone <note>` | A private staff note in their history (your message is removed from the chat). |
| `!history @someone` | Their full history: warnings, mutes, kicks, bans, notes. Also `!cases`, `!modlog`. |
| `!userinfo [@someone]` | Roles, join date, level, warnings and mute. Also `!whois`. |

### Tools

| Command | What it does |
| --- | --- |
| `!settings` | What Blitz is set up to do here: its channels, roles and switches. |
| `!announce [#channel] <message>` | Posts an announcement here, or in the channel you mention. |
| `!event [#channel] <details>` | Posts an event here, or in the channel you mention. |
| `!say [#channel] <message>` | Post as Blitz. |
| `!clear <1-49>` | Delete the last messages in this channel. Also `!purge`. |
| `!setxp @someone <xp>` | Set someone's XP. `!setxp @someone level 12` sets a level instead. Handy for carrying levels over from another app. |
| `!addcmd <name> <response>` | Make a command anyone can use: `!addcmd rules 1. Be kind 2. No spam`, then `!rules`. `{user}` in the response becomes whoever used it. Run it again to change one. Also `!editcmd`. |
| `!delcmd <name>` | Remove a community command. |
| `!approve <number> [note]`, `!deny <number> [note]` | Answer a suggestion: its card shows the verdict and final votes, and its author is told. |

## Automatic

- **Auto-mod** (never touches staff; tick "Turn off auto-mod" in Blitz's settings): removes messages with more than 8 mentions, more than 7 messages in 8 seconds, the same text 4 times in 30 seconds, any of the community's **Blocked words**, and invite links to other communities if **Block invite links** is ticked. The person sees a short note that disappears after 10 seconds, it's noted in the staff log, and staff roles get pinged after 3 removals in 10 minutes. Reports are never removed for the words they quote.
- **Mutes:** messages from muted members are removed, with a reminder of how long is left (at most once a minute).
- **Joins and leaves** are noted in the staff log.
- **Message log:** edited messages (before and after) and deleted messages (what they said) go to the message log channel, if one is picked. Blitz's own removals aren't repeated there.
