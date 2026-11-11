// End-to-end API tests against an in-memory database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';

let server;
let baseUrl;

before(async () => {
  const app = createApp(openDatabase(':memory:'));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

/** Tiny client that remembers its login cookie. */
function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(baseUrl + path, {
      method,
      headers: { 'Content-Type': 'application/json', cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
}

test('full game flow: register, password lobby, start, record hands', async () => {
  const alice = client();
  const bob = client();

  assert.equal((await alice('POST', '/auth/register', { username: 'alice', password: 'secret1' })).status, 201);
  assert.equal((await bob('POST', '/auth/register', { username: 'bob', password: 'secret2' })).status, 201);
  assert.equal((await bob('POST', '/auth/register', { username: 'bob', password: 'secret2' })).status, 409);
  assert.equal((await alice('GET', '/auth/me')).body.user.username, 'alice');

  const created = await alice('POST', '/lobbies', { name: 'Friday table', password: 'pong' });
  assert.equal(created.status, 201);
  const id = created.body.lobby.id;
  assert.equal(created.body.lobby.hasPassword, true);

  assert.equal((await bob('GET', `/lobbies/${id}`)).status, 403);
  assert.equal((await bob('POST', `/lobbies/${id}/join`, { password: 'wrong' })).status, 403);
  assert.equal((await bob('POST', `/lobbies/${id}/join`, { password: 'pong' })).status, 200);

  assert.equal((await bob('POST', `/lobbies/${id}/start`, { settings: {} })).status, 403, 'only host can start');
  const started = await alice('POST', `/lobbies/${id}/start`, {
    settings: { baseScore: 0.2, multiplier: 2, minTai: 1, taiCap: 5, payoutMode: 'standard' },
  });
  assert.equal(started.status, 200);
  assert.equal(started.body.lobby.status, 'playing');

  const [aliceId, bobId] = started.body.lobby.members.map((m) => m.id);
  const hand = await bob('POST', `/lobbies/${id}/hands`, { winnerId: aliceId, discarderId: bobId, tai: 2 });
  assert.equal(hand.status, 201);
  assert.equal(hand.body.lobby.totals[aliceId], 0.8);
  assert.equal(hand.body.lobby.totals[bobId], -0.8);

  const undone = await alice('DELETE', `/lobbies/${id}/hands/last`);
  assert.equal(undone.body.lobby.hands.length, 0);
});

test('requests without login are rejected', async () => {
  const anon = client();
  assert.equal((await anon('GET', '/lobbies')).status, 401);
  assert.equal((await anon('POST', '/auth/login', { username: 'nobody', password: 'x' })).status, 401);
});

test('winds, instant payouts, draws and undo by the recorder', async () => {
  const host = client();
  const p2 = client();
  await host('POST', '/auth/register', { username: 'tf_host', password: 'secret1' });
  await p2('POST', '/auth/register', { username: 'tf_p2', password: 'secret1' });
  const id = (await host('POST', '/lobbies', { name: 'Table flow' })).body.lobby.id;
  await p2('POST', `/lobbies/${id}/join`, {});

  const members = (await host('GET', `/lobbies/${id}`)).body.lobby.members;
  const [hostId, p2Id] = members.map((m) => m.id);
  const bad = await host('POST', `/lobbies/${id}/start`, { settings: { firstDealerId: 99999 } });
  assert.equal(bad.status, 400);

  const started = await host('POST', `/lobbies/${id}/start`, {
    settings: { baseScore: 0.1, multiplier: 2, minTai: 1, taiCap: 5, firstDealerId: p2Id, instantPayouts: { kongConcealed: 3 } },
  });
  assert.equal(started.status, 200);
  assert.equal(started.body.lobby.table.dealerId, p2Id);
  assert.equal(started.body.lobby.table.seatWinds[p2Id], 'East');
  assert.equal(started.body.lobby.settings.instantPayouts.kongConcealed, 3);

  // Concealed kong for the host: p2 pays 3 × 0.10. Dealer doesn't move.
  let r = await p2('POST', `/lobbies/${id}/hands`, { kind: 'kong_concealed', winnerId: hostId });
  assert.equal(r.status, 201);
  assert.equal(r.body.lobby.totals[hostId], 0.3);
  assert.equal(r.body.lobby.table.dealerId, p2Id);

  // Drawn hand: no money, dealer stays.
  r = await p2('POST', `/lobbies/${id}/hands`, { kind: 'draw' });
  assert.equal(r.body.lobby.totals[hostId], 0.3);
  assert.equal(r.body.lobby.hands.at(-1).kind, 'draw');

  // Host (not the dealer) wins → the deal passes to the host.
  r = await p2('POST', `/lobbies/${id}/hands`, { winnerId: hostId, discarderId: null, tai: 1 });
  assert.equal(r.body.lobby.table.dealerId, hostId);
  assert.equal(r.body.lobby.hands.at(-1).dealerId, p2Id, 'each entry remembers who was dealing');

  assert.equal((await p2('POST', `/lobbies/${id}/hands`, { kind: 'nonsense' })).status, 400);
  assert.equal((await p2('POST', `/lobbies/${id}/hands`, { kind: 'animal_pair' })).status, 400, 'needs who gets paid');

  // The host records a hand; p2 can't undo it, but the host can undo one that p2 recorded.
  await host('POST', `/lobbies/${id}/hands`, { kind: 'animal_pair', winnerId: p2Id });
  assert.equal((await p2('DELETE', `/lobbies/${id}/hands/last`)).status, 403);
  await p2('POST', `/lobbies/${id}/hands`, { kind: 'bonus_set', winnerId: p2Id });
  r = await p2('DELETE', `/lobbies/${id}/hands/last`);
  assert.equal(r.status, 200, 'the recorder can undo their own entry');
  assert.equal(r.body.lobby.hands.length, 4);
});

test('migration keeps hands recorded before entry kinds existed', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { default: Database } = await import('better-sqlite3');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mj-')), 'old.db');

  // Build a version-1 database by hand, with one lobby and one hand.
  const old = new Database(file);
  old.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE lobbies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, host_id INTEGER NOT NULL REFERENCES users(id), password_hash TEXT,
      status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')), base_score REAL, multiplier REAL, min_tai INTEGER, tai_cap INTEGER,
      payout_mode TEXT CHECK (payout_mode IN ('standard', 'shooter')), created_at TEXT NOT NULL DEFAULT (datetime('now')), started_at TEXT, finished_at TEXT);
    CREATE TABLE lobby_members (lobby_id INTEGER NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id), joined_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (lobby_id, user_id));
    CREATE TABLE hands (id INTEGER PRIMARY KEY AUTOINCREMENT, lobby_id INTEGER NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE, winner_id INTEGER NOT NULL REFERENCES users(id),
      discarder_id INTEGER REFERENCES users(id), tai INTEGER NOT NULL, note TEXT, recorded_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE INDEX idx_hands_lobby ON hands(lobby_id);
    INSERT INTO users (username, password_hash) VALUES ('a', 'x'), ('b', 'x');
    INSERT INTO lobbies (name, host_id, status, base_score, multiplier, min_tai, tai_cap, payout_mode) VALUES ('Old', 1, 'playing', 0.1, 2, 1, 5, 'standard');
    INSERT INTO lobby_members (lobby_id, user_id) VALUES (1, 1), (1, 2);
    INSERT INTO hands (lobby_id, winner_id, discarder_id, tai, recorded_by) VALUES (1, 1, 2, 2, 1);
    PRAGMA user_version = 1;
  `);
  old.close();

  const db = openDatabase(file);
  const { loadLobbyState } = await import('../src/lobbyService.js');
  const state = loadLobbyState(db, 1);
  assert.equal(state.hands.length, 1);
  assert.equal(state.hands[0].kind, 'win');
  assert.equal(state.totals[1], 0.4);
  assert.equal(state.settings.drawRotates, false);
  assert.equal(state.table.dealerId, 1, 'old lobbies default to the first player as dealer, who won and kept the deal');
  db.close();
});
