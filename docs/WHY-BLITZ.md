# Blitz and the Discord bots it learned from

Before the all-in-one update we looked at the bots Discord communities rely on most (MEE6, Dyno, Carl-bot, Wick, Zeppelin, YAGPDB, Sapphire, Double Counter, Beemo, the ModMail and ticket bots, and the AI summary bots), at what each does best, and at what server owners and moderators keep saying they lack. This is what we found, and what Blitz does about it.

## What the best bots are known for

| Bot | Known for | What people say it lacks |
| --- | --- | --- |
| MEE6 | The popular all-in-one: levels, welcomes, custom commands | Its custom auto-mod rules, level reward roles and more sit behind a paid plan; levels that reward chatting can encourage spam; its moderation is basic (word lists, spam, invites), with no raid protection or warning escalation |
| Dyno | Classic moderation: 19 auto-mod filters (including known phishing links and masked links), warnings that auto-mute or auto-ban at a count, per-channel rules | Setup through a busy dashboard; auto-mod "warnings" don't count toward its own warning escalation |
| Carl-bot | Reaction roles, detailed logging, tags and triggers, a starboard | Advanced features (scripting, longer log keeping) on its paid plan; lots to configure |
| Wick | Security: anti-raid (lock on a join spike, verification gate), anti-nuke, quarantine, panic mode | Complex, and strict enough to catch innocent members |
| Zeppelin | Deep case management and auto-mod for big servers, bot-managed slowmode | Configured in YAML; hard to set up |
| YAGPDB | Scripted custom commands, auto-mod with scaling punishments, Reddit/YouTube/Twitch feeds, role menus | Its template scripting takes learning |
| Sapphire | Most of the above with nothing paywalled | (the "free alternative" people move to) |
| Double Counter, Beemo | Catching alt accounts and automated raids | One job each, so servers stack several bots |
| ModMail, Ticket Tool | Private member-to-team conversations, transcripts, claiming | Another bot (and often extra channels) just for this |
| Summary bots | `/tldr`: catch up on a channel with AI | Another bot again |

The complaints that came up across all of them:

- **Paywalls** on features communities consider basic (MEE6 most of all).
- **Setup complexity:** big dashboards, config files, features nobody uses.
- **Keyword filters that catch innocent messages** and miss context ("nice kill" in a gaming server isn't a threat).
- **No explanation:** members are punished without being told why or how to appeal; appeals need yet another bot or a web form.
- **Too many bots:** one for moderation, one for raids, one for tickets, one for levels, one for giveaways.
- **Moderator burnout:** the team spends its time policing instead of building the community.

## What Blitz does

| What communities want | Blitz |
| --- | --- |
| Moderation with a history | Warnings, mutes, kicks and bans as numbered cases; notes; `!history`; staff can't act on anyone their rank or above |
| Escalation | The **warning ladder**: an automatic mute at 3 standing warnings (growing each time), and a kick or ban at steps you choose. Auto-mod repeat offenders get a 10-minute cool-off |
| Phishing protection | The **scam shield**: fake Nitro/Steam gifts, lookalike sites (dlscord, steamcommunlty), masked links, gift bait. The sender is muted for an hour and told their account may be hacked. It checks the team's links too |
| Raid protection | The **raid shield**: rises on a burst of joins, holds newcomers to no links, no mentions and slow posting, alerts the team. New members wait 10 minutes before posting links |
| Lockdown and slowmode | `!lockdown #channel 30m` or `all`, `!slowmode 30s`, kept by Blitz itself and ending on their own |
| A wide auto-mod | Floods, copy-paste spam, mass mentions, invites, blocked words, glitch text; opt-in caps, emoji floods and walls of text |
| Fewer false alarms | With Claude as Blitz's brain, **blocked-word hits are checked in context** before anything is removed |
| Telling members why | Members get a notification with the reason for any warning, mute, kick or ban, and how to appeal |
| Appeals | `!appeal` (or the Inbox in the menu); the team accepts (the case is taken back) or turns it down, with a note |
| ModMail / tickets | The **Inbox**: private conversations with the team, kept by Blitz, no extra channels; notifications both ways; transcripts in the staff log |
| Help reading reports | Every report summed up by Blitz's brain with a severity and a suggestion. The team decides |
| Catch-ups | `!tldr` |
| An assistant for the team | **Ask Blitz**: plain-language questions about activity, members' records, the inbox, or a channel, answered from Blitz's records (read-only) |
| Server stats | **Pulse**: a health score, weekly change, joins and leaves, busiest hours and channels, what the team and the shields did |
| Levels with reward roles | Free, as many as you like (`!levelrole 10 @Regular`), plus the leaderboard as a constellation |
| An economy | **Stardust**, earned by chatting, daily streaks, level-ups and giveaways, and spent on looks your own Blitz wears in its domain |
| Giveaways | Reaction or menu entry, timed draws, rerolls, automatic Stardust prizes |
| Easy setup | One settings page in Root, everything optional; then **a menu beside the domain** that does everything without commands. No dashboard, no config files |
| One bot | All of the above, plus welcomes, self-roles, reminders, birthdays, polls, suggestions, a quote wall, custom commands and logs. Free |

## What Blitz doesn't do (yet)

Being honest about the gaps:

- **Account-age checks and captcha verification** (Wick, Double Counter): Root doesn't tell Apps when an account was created, so Blitz can't gate by account age. The newcomer link wait and the raid shield cover the most common raid pattern.
- **Anti-nuke and server backups** (Wick): Blitz doesn't watch admins' channel and role changes or restore them, and doesn't ask for the permissions that would need.
- **Social feeds** (YAGPDB, MEE6): no YouTube, Twitch or Reddit alerts.
- **Voice**: no voice XP or voice moderation.
- **Scripting** (YAGPDB, Carl-bot): community commands are text answers with `{user}`, not programs.

## Sources

- [Best Discord Moderation Bots 2026 (VibeBot)](https://www.vibebot.gg/blog/best-discord-moderation-bots)
- [Best Discord moderation bots in 2026 (Supervisor)](https://supervisor.gg/blog/best-discord-moderation-bots-2026)
- [Best Discord Moderation Bots that you need in 2026 (CommunityOne)](https://blog.communityone.io/best-discord-moderation-bots-2025/)
- [Dyno auto-mod filters and actions (gist)](https://gist.github.com/royalPanic/86c196ed59b4eff3ae6cac12bc52de14)
- [Wick's features](https://docs.wickbot.com/intro/features/)
- [Zeppelin](https://github.com/ZeppelinBot/Zeppelin)
- [YAGPDB](https://yagpdb.xyz/)
- [Carl-bot review (stork.ai)](https://www.stork.ai/en/carl-bot)
- [Sapphire vs MEE6 in 2026 (PeakBot)](https://peakbot.pro/blog/sapphire-vs-mee6-2026)
- [MEE6 alternatives](https://www.alternativestomee6.com/)
- [Double Counter](https://doublecounter.gg/)
- [Best anti-raid bots (Mava)](https://www.mava.app/blog/anti-raid-bot-discord)
- [ModMail](https://github.com/Cut0x/ModMail) and [ModMailBot](https://modmailbot.com/)
- [Discord ban appeal systems (discords.ai)](https://www.discords.ai/wiki/discord-ban-appeal-system)
- [AI moderation on Discord: pros and cons (PeakBot)](https://peakbot.pro/blog/ai-discord-moderation-guide) and [Discord moderation bots and the limits of rules (Lucius AI)](https://luciusai.com/blog/discord-moderation-bot)
- [SummaryBot](https://discordsummarybot.com/)
- [Discord phishing link lists](https://github.com/Dogino/Discord-Phishing-URLs)
