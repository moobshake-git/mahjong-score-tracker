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

  // Per-hand payout: shooter pays overrides the lobby's standard payout.
  // With 2 players both modes cost the discarder the same, so check the stored mode here
  // (the money difference is covered in scoring.test.js with 4 players).
  const shooter = await bob('POST', `/lobbies/${id}/hands`, { winnerId: bobId, discarderId: aliceId, tai: 1, payoutMode: 'shooter' });
  assert.equal(shooter.status, 201);
  assert.equal(shooter.body.lobby.hands.at(-1).payoutMode, 'shooter');
  const selfDrawn = await bob('POST', `/lobbies/${id}/hands`, { winnerId: bobId, discarderId: null, tai: 1, payoutMode: 'shooter' });
  assert.equal(selfDrawn.body.lobby.hands.at(-1).payoutMode, null, 'self-drawn hands store no payout mode');
  const normal = await bob('POST', `/lobbies/${id}/hands`, { winnerId: bobId, discarderId: aliceId, tai: 1 });
  assert.equal(normal.body.lobby.hands.at(-1).payoutMode, 'standard', 'defaults to the lobby setting');
  const bad = await bob('POST', `/lobbies/${id}/hands`, { winnerId: bobId, discarderId: aliceId, tai: 1, payoutMode: 'nope' });
  assert.equal(bad.status, 400);

  // Voice parsing works without an AI key (rule-based parser).
  const parsed = await alice('POST', `/ai/lobbies/${id}/parse-hand`, { transcript: 'bob won 3 tai from alice shooter pay' });
  assert.equal(parsed.status, 200);
  assert.equal(parsed.body.source, 'rules');
  assert.deepEqual(
    { w: parsed.body.hand.winnerId, d: parsed.body.hand.discarderId, t: parsed.body.hand.tai, p: parsed.body.hand.payoutMode },
    { w: bobId, d: aliceId, t: 3, p: 'shooter' },
  );

  for (let i = 0; i < 3; i++) await alice('DELETE', `/lobbies/${id}/hands/last`);
  const undone = await alice('DELETE', `/lobbies/${id}/hands/last`);
  assert.equal(undone.body.lobby.hands.length, 0);
});

test('invite link joins a password lobby without the password', async () => {
  const host = client();
  const guest = client();
  const stranger = client();
  await host('POST', '/auth/register', { username: 'host1', password: 'secret1' });
  await guest('POST', '/auth/register', { username: 'guest1', password: 'secret1' });
  await stranger('POST', '/auth/register', { username: 'stranger1', password: 'secret1' });

  const id = (await host('POST', '/lobbies', { name: 'QR table', password: 'pong' })).body.lobby.id;
  assert.equal((await stranger('GET', `/lobbies/${id}/invite`)).status, 403, 'only members see the invite code');
  const { code } = (await host('GET', `/lobbies/${id}/invite`)).body;
  assert.equal(typeof code, 'string');

  assert.equal((await stranger('POST', `/lobbies/${id}/join`, { inviteCode: 'wrong-code-xxxxx' })).status, 403);
  const joined = await guest('POST', `/lobbies/${id}/join`, { inviteCode: code });
  assert.equal(joined.status, 200);
  assert.equal(joined.body.lobby.members.length, 2);
});

test('requests without login are rejected', async () => {
  const anon = client();
  assert.equal((await anon('GET', '/lobbies')).status, 401);
  assert.equal((await anon('POST', '/auth/login', { username: 'nobody', password: 'x' })).status, 401);
});
