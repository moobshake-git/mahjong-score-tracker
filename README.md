# Mahjong Score Tracker 🀄

A score tracker for **Singapore-style Mahjong**, so a group can keep running scores across a game session from their phones.

## Features

- **Login page**: each player signs up and logs in with their own account.
- **Lobbies**: create a lobby for a table (up to 4 players); other players join it.
- **Lobby passwords**: a lobby can have a password so only your table can join.
- **QR invite**: while a lobby is waiting for players, it shows a QR code and a share link. Scanning it joins the lobby without typing the password (after logging in, if needed).
- **Game setup**: before the game starts, the host enters the **base score**, the **multiplier** per tai, the min tai, the tai cap and the discard payout rule. A preview table shows what each tai is worth.
- **Score tracking**: record each hand's winner, tai, and who paid (discard or self-drawn). Everyone sees running totals, which refresh every few seconds. The host can undo the last hand or finish the game.
- **Settle up**: turns the totals into the fewest "X pays Y" transfers. It is shown during the game ("if you stopped now") and as the final bill.
- **Normal payout or shooter pays, per hand**: the lobby has a default, and each discard win can switch between the two.
- **Voice input**: tap 🎤 and say the hand, e.g. *"Alice won 3 tai from Bob"*, *"Bob zimo 2 tai"* or *"Carol 4 tai, Dave shoot, shooter pay"*. The form fills in for you to check before saving. You can also type the sentence instead.
- **AI helper (LLM via OpenCode Go)**:
  - *Suggest tai*: describe a hand in plain words ("all pongs, red dragon, half colour") and the AI suggests a tai count with a breakdown.
  - *Game recap*: a short write-up of the game so far.
- **Tap-to-record**: winner, who paid and tai are big tap targets, so a hand takes three taps. Anyone at the table can record, and whoever recorded an entry (or the host) can undo it.
- **Tai calculator**: tick the patterns in the winning hand (dragon pongs, winds, all pongs, half/full colour, flowers, animals, limit hands…) and it adds up the tai, capped at the table's limit. Edit `client/src/lib/taiRules.js` to match your house rules.
- **Winds and dealer**: the host picks the first dealer. The app tracks the round wind, each player's seat wind and the dealer: the dealer keeps the deal on a win, and on a draw unless the host turns on "pass the deal after a draw". The calculator's seat/round wind lines use these automatically.
- **Instant payouts**: one tap for a concealed kong, exposed kong (optionally paid in full by the discarder), animal pair or full bonus set. The host sets the amounts at game setup.
- **Drawn hands**: recorded so dealer rotation stays right; no money moves.

## Tech stack

| Part | Choice |
|---|---|
| Front end | React 19 + Vite + React Router (`client/`) |
| Back end | Node.js 22 + Express 5 (`server/`) |
| Database | SQLite through `better-sqlite3`, a single file in `server/data/` |
| Auth | bcrypt-hashed passwords; JWT in an httpOnly cookie |
| AI | OpenCode Go, which uses the OpenAI-compatible `/chat/completions` API (`server/src/llm.js`) |
| Tests | Node's built-in test runner (`npm test`) |

## Getting started

You need **Node.js 22.9 or newer**.

```bash
git clone https://github.com/moobshake-git/mahjong-score-tracker.git
```

```bash
cd mahjong-score-tracker && npm install
```

```bash
cp .env.example .env
```

Edit `.env`: set `JWT_SECRET` to a long random string and `OPENCODE_API_KEY` to your OpenCode Go key. The app still runs without a key; only the AI buttons stop working.

```bash
npm run dev
```

Open http://localhost:5173. The React dev server forwards `/api` calls to Express on port 3001.

To test with several players, open a second browser or a private window and log in as a different user.

### Testing on phones

The QR invite link uses the address you opened the app with, so `localhost` won't work on a phone. Run this instead, then open the `Network:` address that Vite prints (e.g. `http://192.168.1.20:5173`) on your computer. The QR code will then point to that address. Your phone must be on the same Wi-Fi.

```bash
npm run dev:lan
```

### Other commands

| Command | What it does |
|---|---|
| `npm test` | Runs the server tests (scoring rules, the voice parser, API flow, AI routes with a fake LLM) and the client tests (`client/src/**/*.test.js`, plain logic only) |
| `npm run build` | Builds the React app into `client/dist` |
| `npm start` | Runs Express only. If `client/dist` exists, it serves the built app too, so this is the production mode |

## Configuring the AI (OpenCode Go)

All settings live in `.env`:

| Variable | Meaning |
|---|---|
| `OPENCODE_API_KEY` | Your OpenCode Go key. It stays on the server and is never sent to the browser |
| `OPENCODE_BASE_URL` | API base URL. The default is `https://opencode.ai/zen/go/v1`; check the [OpenCode Go docs](https://opencode.ai/docs/go) in case it has changed |
| `OPENCODE_MODEL` | Model ID, e.g. `kimi-k2.6`. List the available ones with the command below |

```bash
curl -H "Authorization: Bearer $OPENCODE_API_KEY" "$OPENCODE_BASE_URL/models"
```

Every LLM call goes through `chat()` / `chatJson()` in `server/src/llm.js`. To add a new AI feature, add a route in `server/src/routes/ai.js` and a function in `client/src/api.js`.

## Voice input (speech to text)

1. The browser's built-in speech recognition turns speech into text (`client/src/useSpeechRecognition.js`, language `en-SG`). It works in Chrome, Edge and Safari but not Firefox; there, players type the sentence. Chrome sends the audio to Google to transcribe it. The browser asks for microphone permission, which only works on `localhost` or HTTPS.
2. The text goes to `POST /api/ai/lobbies/:id/parse-hand`. If an OpenCode Go key is set, the LLM picks out winner, discarder, tai and payout. Otherwise, or if the LLM call fails, a rule-based parser does it (`server/src/handParser.js`).
3. The parser handles common mishearings: "tie"/"thai" for tai, number words, and slightly misspelt names. Names are matched against the players in the lobby.
4. Nothing is saved automatically. The form is filled in and the player presses **Save hand**.

Phrases it understands:

| Meaning | Say |
|---|---|
| Winner | "Alice won…", "Alice hu…", or the first name said |
| Discarder | "…from Bob", "…off Bob", "Bob shoot", "Bob discard", or the second name said |
| Self-drawn | "zimo", "self drawn", "self draw" |
| Shooter pays | "shooter pay", "shooter pays", "pay all" |
| Normal payout | "normal", "normal payout" (otherwise the lobby default applies) |

## Scoring rules (current implementation)

These are in `server/src/scoring.js` and covered by `server/test/scoring.test.js`.

- **One unit** = `base score × multiplier ^ (tai − 1)`. Tai above the cap count as the cap.
- **Self-drawn**: every other player pays **2 units**.
- **Discard, normal payout** (`standard`): the discarder pays **2 units** and every other player pays **1 unit**.
- **Discard, shooter pays** (`shooter`): the discarder pays for the whole table (2 units + 1 unit per other player).
- The lobby sets the default. Each hand can override it (stored in `hands.payout_mode`; `NULL` = lobby default).

Example: base 0.10, multiplier 2, 3 tai means 1 unit = 0.40.

**Instant payouts** are counted in *base units* (multiples of the base score), not tai. Each other player pays straight away:

| Event | Default | Notes |
|---|---|---|
| Concealed kong | 2 | |
| Exposed kong | 1 | If made from a discard, the discarder pays for the whole table |
| Animal pair (cat + rat, rooster + centipede) | 1 | |
| Full set of 4 flowers, 4 seasons or 4 animals | 2 | |

**Dealer and winds** (`server/src/table.js`): seats follow the player list; the dealer is East. A dealer win, or a draw (by default), keeps the deal; anything else passes it to the next player. When the deal has gone all the way round, the round wind moves on (East → South → West → North).

## Project structure

```
.
├── package.json            # npm workspaces + root scripts (dev, build, start, test)
├── .env.example            # copy to .env
├── server/
│   ├── src/
│   │   ├── index.js        # starts the server
│   │   ├── app.js          # Express app: routes, static files, error handler
│   │   ├── config.js       # reads .env
│   │   ├── db.js           # SQLite connection + schema migrations
│   │   ├── auth.js         # JWT cookie + requireAuth middleware
│   │   ├── scoring.js      # Singapore payout rules (pure functions)
│   │   ├── lobbyService.js # shared DB helpers for lobbies
│   │   ├── handParser.js   # rule-based "Alice won 3 tai from Bob" parser
│   │   ├── llm.js          # OpenCode Go client
│   │   └── routes/
│   │       ├── auth.js     # /api/auth/*    register, login, logout, me
│   │       ├── lobbies.js  # /api/lobbies/* list, create, join, leave, start, hands, undo, finish
│   │       └── ai.js       # /api/ai/*      tai suggestion, voice parsing, game recap
│   └── test/               # node --test
└── client/
    ├── index.html
    ├── vite.config.js      # dev proxy /api -> :3001
    └── src/
        ├── main.jsx, App.jsx, api.js, AuthContext.jsx, usePolling.js, useSpeechRecognition.js, styles.css
        ├── pages/          # LoginPage, LobbiesPage, LobbyPage
        └── components/     # GameSetupForm, RecordHandForm, VoiceInput, Scoreboard, HandHistory, AiSummary, ...
```

## API overview

All routes except register and login need a login cookie.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register` | `{ username, password }` |
| POST | `/api/auth/login` | `{ username, password }` |
| POST | `/api/auth/logout` | |
| GET | `/api/auth/me` | current user |
| GET | `/api/lobbies` | open lobbies, plus ones you are in |
| POST | `/api/lobbies` | `{ name, password? }`; the creator becomes host |
| GET | `/api/lobbies/:id` | full state for members: players, settings, totals, hands |
| POST | `/api/lobbies/:id/join` | `{ password? }` or `{ inviteCode }` |
| GET | `/api/lobbies/:id/invite` | members only: `{ code }` for the QR / share link `/join/:id/:code` |
| POST | `/api/lobbies/:id/leave` | not allowed while a game is in progress |
| POST | `/api/lobbies/:id/start` | host only: `{ settings: { baseScore, multiplier, minTai, taiCap, payoutMode, firstDealerId?, drawRotates?, instantPayouts? } }` |
| POST | `/api/lobbies/:id/hands` | `{ kind?, winnerId, discarderId, tai, payoutMode?, note? }`. `kind` is `win` (default; `discarderId` null = self-drawn; `payoutMode` `'standard'` or `'shooter'`, default = lobby), `draw`, `kong_concealed`, `kong_exposed`, `animal_pair` or `bonus_set` (`winnerId` = who gets paid) |
| DELETE | `/api/lobbies/:id/hands/last` | undo the last entry: the host, or whoever recorded it |
| POST | `/api/lobbies/:id/finish` | host only |
| GET | `/api/ai/status` | `{ enabled }` |
| POST | `/api/ai/tai` | `{ description }` returns `{ tai, breakdown, notes }` |
| POST | `/api/ai/lobbies/:id/parse-hand` | `{ transcript }` returns `{ hand: { winnerId, discarderId, tai, payoutMode, missing }, source: 'ai' or 'rules' }`. Works without an AI key |
| POST | `/api/ai/lobbies/:id/summary` | returns `{ summary }` |

## Working together

1. Accept the collaborator invite (check your email or https://github.com/notifications).
2. Create a branch for your work, push it, and open a pull request:
   ```bash
   git checkout -b my-feature
   ```
   ```bash
   git push -u origin my-feature
   ```
3. Run `npm test` before pushing. If you change the scoring rules, add a test to `server/test/scoring.test.js`.
4. Database changes: add a **new** entry to `MIGRATIONS` in `server/src/db.js`. Never edit an old one.
5. Use the **Issues** tab to claim tasks so two people don't build the same thing.

## Ideas / next steps

- Real-time updates with WebSockets or Server-Sent Events, replacing the 3-second polling in `client/src/usePolling.js`
- Let other players confirm or dispute a recorded hand
- Game history and stats per player
- Let the AI read a photo of the winning hand
- Rate limiting on login and AI routes; deployment (e.g. Render or Fly.io with a persistent disk for SQLite)

## Open decisions

- Check the default tai values (`client/src/lib/taiRules.js`) and instant payout amounts against your table's house rules
- Hosting
