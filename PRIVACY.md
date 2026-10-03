# Blitz privacy policy

*Last updated: October 3, 2026*

Blitz is a Root App that any community can install. This page says plainly what it does with your information. Each community's data stays with that community: Blitz never mixes communities or shares one community's data with another.

## What Blitz keeps

Blitz saves a few things in the private storage Root gives each App for each community it's in. Nothing leaves Root except what's described under [Claude](#claude-optional).

- **Levels:** your XP, how many messages you've sent, and when you last earned XP. Not what your messages said.
- **Birthday:** the month and day you give `!birthday`. Never the year. `!birthday remove` deletes it.
- **Quote wall:** if the community picked a quote wall channel, a message that gets enough 🗣️ reactions is reposted there with who said it. Messages in channels the community marked private are never quoted.
- **Polls:** their questions and options. Votes are the reactions themselves.
- **Moderation history:** when the team warns, mutes, kicks, bans or unbans someone, or adds a staff note, Blitz keeps a numbered record: who, who did it, when, for how long, and the reason given. Members can see their own warnings with `!warnings`; the team can see everything.
- **Reminders:** what you asked to be reminded of, where, and when. Deleted once it's delivered or you cancel it.
- **Suggestions:** the idea, who suggested it, and the team's answer.
- **Community commands:** the commands the team makes with `!addcmd`, who made them, and how often they're used.

## What Blitz uses without keeping

- It reads messages in the channels it can see to answer commands, count XP and catch spam (floods, copy-paste spam, mass mentions, and words or links the community blocks). When it removes a message, it posts a short excerpt of it in the community's staff log channel (if it picked one) so the team can check. It also notes joins and leaves there.
- **Reports:** `!report` is removed from the chat and posted, with what you wrote (and the message you replied to, if any), in the staff log for the team.
- **Message log:** if the community picked a message log channel, Blitz remembers recent messages in memory (never on disk, for at most two days, and never from private channels) so that when one is edited or deleted, it can post what it said before in that channel for the team.
- In Blitz's own channel, everyone gets their own Blitz, which lives in their own window: nobody else sees what you do with it, and none of it is saved. What you type to it there goes to Blitz's server only to be answered (with Claude, if the community added a key), and the answer comes back just to you.
- Root and the computer Blitz runs on may keep technical logs (like which command ran, or an error) for fixing problems.

## Claude (optional)

If a community's admins add an Anthropic API key, Blitz uses Claude, made by Anthropic, to understand messages and write its replies. When someone talks to Blitz, it sends Anthropic's API that message plus the last 12 messages in the same channel, with the display names of who said them, and a little about the community (its name, channels and commands, and anything its admins wrote about it). Your messages can be included this way when someone else talks to Blitz in the same channel.

- Channels the community marked private are never sent.
- Blitz remembers recent conversation only in memory while it runs, and forgets it when it restarts.
- Anthropic handles what it receives under its own terms and [privacy policy](https://www.anthropic.com/legal/privacy).

Without a key, Blitz just looks for keywords and sends nothing anywhere.

## What Blitz never does

Blitz doesn't sell or share your information, show ads, or track you anywhere outside the community.

## Questions or removing your data

Ask your community's admins on Root: they can remove anything Blitz has saved about you there, or remove Blitz entirely. For questions about Blitz itself, open an issue at [github.com/YelanSuperb181/Root-Server](https://github.com/YelanSuperb181/Root-Server/issues).

Changes to this policy are made on this page, with a new date at the top.
