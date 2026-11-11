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
