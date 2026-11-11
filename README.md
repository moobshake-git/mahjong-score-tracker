# Mahjong Score Tracker 🀄

A score tracker for **Singapore-style Mahjong**, so a group can keep running scores across a game session from their phones.

> Status: planning. No app code yet — this repo is set up so the team can start building together.

## Planned features

- **Login page** – each player signs in with their own account.
- **Lobbies** – create a lobby for a game table; other players join it.
- **Lobby passwords** – a lobby can be protected with a password so only your table can join.
- **Game setup** – at the start of a game, the host enters:
  - **Base score** (e.g. 0.10 / 0.20 per point)
  - **Multiplier** (how payouts scale with tai)
- **Score tracking** – record each hand's winner, tai, and who paid (discard vs. self-drawn), and keep a running total for every player.

## Working together

1. Accept the collaborator invite (check your email or https://github.com/notifications).
2. Clone the repo:
   ```bash
   git clone https://github.com/moobshake-git/mahjong-score-tracker.git
   ```
3. Create a branch for your work, push it, and open a pull request:
   ```bash
   git checkout -b my-feature
   git push -u origin my-feature
   ```
4. Use the **Issues** tab to claim tasks so two people don't build the same thing.

## Open decisions

- Tech stack (web app framework, database, hosting)
- Exact Singapore payout rules to support (tai cap, shooter pays, bonus tiles/animals)
