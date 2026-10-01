# Sprout commands

Commands start with `!` (change it with `prefix` in [`config.ts`](../bot/src/config.ts)). `!help` in Root shows the commands *you* can use; `!help poll` explains one.

## For everyone

| Command | What it does |
| --- | --- |
| `!help [command]` | All commands, or details about one. Also `!commands`. |
| `!rank [@member]` | Level, XP progress bar, message count and leaderboard spot. Also `!level`, `!xp`. |
| `!top` | The 10 most active members. Also `!leaderboard`, `!lb`. |
| `!levels` | How XP works and which roles you unlock. |
| `!birthday July 14` | Save your birthday (month and day only). `!birthday` shows it, `!birthday remove` forgets it. Also accepts `07-14` and `14 July`. |
| `!birthdays` | Who's celebrating next. |
| `!poll [time] Question? \| A \| B …` | A reaction poll with 2-10 options, or yes/no without options. Add `30m`, `2h` or `3d` to close it automatically with a results card. |
| `!endpoll <number>` | Close a poll now (its author or the team). |
| `!suggest <idea>` | Post an idea to `#suggestions` for votes. Typing in `#suggestions` does the same. |
| `!qotd` | When the next Question of the Day arrives. |
| `!roles` | Where to pick your roles. |
| `!server` | Community info. Also `!about`. |
| `!8ball <question>` | Ask the magic 8-ball. |
| `!roll [d20 \| 2d6+1 \| 100]` | Roll dice (default 1d6). Also `!dice`. |
| `!flip` | Flip a coin. Also `!coin`. |
| `!choose a \| b \| c` | Let Sprout decide (also `a, b` or `a or b`). Also `!pick`. |
| `!ping` | Is Sprout awake? |

## Without commands

| Do this | And Sprout… |
| --- | --- |
| React ✅ on the rules post | Gives you **Member** (unlocking the community) and welcomes you in `#general`. |
| React on a picker in `#roles` | Adds that role; un-react to remove it. Picking a name color swaps out your old one and makes it your primary role, so it shows on your name. |
| React ⭐ on a message | At 3 stars from other members it goes to `#hall-of-fame`, with a live count. |
| Type an idea in `#suggestions` | Turns it into a numbered card with 👍/👎 votes. Replies to a card stay as normal discussion. |
| Chat | Earns 15-25 XP, at most once a minute (not in `#bot-commands` or `#memes`). |

## For the team (Moderators and Admins)

| Command | What it does |
| --- | --- |
| `!announce <message>` | Posts in `#announcements` and pings **Announcements Ping**. |
| `!event <details>` | Posts in `#events` and pings **Events Ping**. |
| `!approve <n> [note]` | Marks suggestion #n ✅ approved and notifies its author. |
| `!wip <n> [note]` | 🛠️ in progress. Also `!inprogress`. |
| `!done <n> [note]` | 🚀 done. Also `!implemented`. |
| `!decline <n> [note]` | ❌ declined (a note explaining why is kind). Also `!deny`. |
| `!reopen <n>` | Back to open for votes. |
| `!qotd now` | Post a question right now. |
| `!qotd add <question>` | Queue your own question; queued ones go first. |
| `!qotd queue` | See what's queued. |
| `!say [#channel] <message>` | Post as Sprout. |
| `!clear <1-50>` | Delete the last messages in this channel. Also `!purge`. |

## For admins

Admins are the community owner and roles with **Manage Community** or **Full Control**.

| Command | What it does |
| --- | --- |
| `!setup` | Preview what setup would create. Changes nothing. |
| `!setup confirm` | Build it: roles, groups, channels, permissions, starter posts, and Member for everyone already here. |
| `!setup content` | Post any missing starter posts (welcome, rules, role pickers, how-tos). |
| `!setup refresh` | Re-render the starter posts after editing [`content.ts`](../bot/src/blueprint/content.ts), and add any new role-picker reactions. |
| `!setup permissions` | Re-apply the blueprint's channel permissions to what exists. Rules for other roles are left alone. |
| `!setup status` | What's in place and what's missing. |
| `!setxp @member <xp>` | Set someone's XP. `!setxp @member level 12` sets a level instead. Handy for carrying Discord levels over. |

## Automatic

- **Every day** at `daily.hourUtc` (16:00 UTC by default): the Question of the Day, then birthday shout-outs, with the **Birthday Star** role for the day.
- **When someone joins:** a push notification pointing them to the rules, and a line in `#mod-log`.
- **Auto-mod** (members only, never staff): removes messages with more than 5 mentions, invite links to other Discord/Telegram/WhatsApp groups, blocked words, more than 6 messages in 8 seconds, or the same text 3 times in 30 seconds. The member sees a short note that disappears after 10 seconds, the team sees it in `#mod-log`, and Moderators get pinged after 3 removals in 10 minutes.
