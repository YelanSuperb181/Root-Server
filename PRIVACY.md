# Blitz privacy policy

*Last updated: October 3, 2026*

Blitz is a Root App that any community can install. This page says plainly what it does with your information. Each community's data stays with that community: Blitz never mixes communities or shares one community's data with another.

## What Blitz keeps

Blitz saves a few things in the private storage Root gives each App for each community it's in. Nothing leaves Root except what's described under [Claude](#claude-optional).

- **Levels:** your XP, how many messages you've sent, and when you last earned XP. Not what your messages said.
- **Birthday:** the month and day you give `!birthday`. Never the year. `!birthday remove` deletes it.
- **Quote wall:** if the community picked a quote wall channel, a message that gets enough 🗣️ reactions is reposted there with who said it. Messages in channels the community marked private are never quoted.
- **Polls:** their questions and options. Votes are the reactions themselves.

## What Blitz uses without keeping

- It reads messages in the channels it can see to answer commands, count XP and catch spam (floods, copy-paste spam, mass mentions). When it removes a spam message, it posts a short excerpt of it in the community's staff log channel (if it picked one) so the team can check. It also notes joins and leaves there.
- In Blitz's own channel, everyone there sees who is around and who is carrying Blitz, live. None of that is saved.
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
