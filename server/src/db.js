// SQLite database setup. Tables are created on startup if they don't exist.
// When you change the schema, add a new migration to MIGRATIONS (never edit old ones).
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

const MIGRATIONS = [
  // 1: initial schema
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE lobbies (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    host_id       INTEGER NOT NULL REFERENCES users(id),
    password_hash TEXT,                       -- NULL = open lobby
    status        TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
    -- Game settings, entered by the host when the game starts
    base_score    REAL,
    multiplier    REAL,
    min_tai       INTEGER,
    tai_cap       INTEGER,
    payout_mode   TEXT CHECK (payout_mode IN ('standard', 'shooter')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    started_at    TEXT,
    finished_at   TEXT
  );

  CREATE TABLE lobby_members (
    lobby_id  INTEGER NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id),
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (lobby_id, user_id)
  );

  CREATE TABLE hands (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    lobby_id    INTEGER NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    winner_id   INTEGER NOT NULL REFERENCES users(id),
    discarder_id INTEGER REFERENCES users(id), -- NULL = self-drawn (zimo)
    tai         INTEGER NOT NULL,
    note        TEXT,
    recorded_by INTEGER NOT NULL REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX idx_hands_lobby ON hands(lobby_id);
  `,
  // 2: per-hand payout mode ('standard' = normal payout, 'shooter' = shooter pays).
  //    NULL = use the lobby's default payout_mode (keeps old hands unchanged).
  `
  ALTER TABLE hands ADD COLUMN payout_mode TEXT CHECK (payout_mode IN ('standard', 'shooter'));
  `,
];

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
    console.log(`[db] applied migration ${v + 1}`);
  }
}

export function openDatabase(file = config.databasePath) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}
