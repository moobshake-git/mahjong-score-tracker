// Tests the AI routes with a fake LLM (no real API calls, no key needed).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';

let server;
let baseUrl;
const realFetch = globalThis.fetch;

before(async () => {
  config.llm.apiKey = 'test-key';
  server = await new Promise((resolve) => {
    const s = createApp(openDatabase(':memory:')).listen(0, () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => {
  globalThis.fetch = realFetch;
  server.close();
});

test('POST /ai/tai returns the parsed suggestion from the model', async () => {
  // Register with the real fetch, then swap in a fake LLM for calls to the OpenCode URL.
  const reg = await realFetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'carol', password: 'secret1' }),
  });
  const cookie = reg.headers.get('set-cookie').split(';')[0];

  let sentBody;
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith(config.llm.baseUrl)) return realFetch(url, init);
    sentBody = JSON.parse(init.body);
    const content = '```json\n{"tai": 3, "breakdown": [{"item": "Dui Dui Hu", "tai": 2}, {"item": "Red dragon", "tai": 1}], "notes": "ok"}\n```';
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  };

  const res = await realFetch(`${baseUrl}/ai/tai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ description: 'all pongs with red dragon' }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.tai, 3);
  assert.equal(body.breakdown.length, 2);
  assert.equal(sentBody.model, config.llm.model);
  assert.equal(sentBody.messages.at(-1).content, 'all pongs with red dragon');
});

test('POST /ai/lobbies/:id/parse-hand maps the model reply to player ids', async () => {
  globalThis.fetch = realFetch;
  const login = async (username) => {
    const r = await realFetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'secret1' }),
    });
    const cookie = r.headers.get('set-cookie').split(';')[0];
    return (method, path, body) =>
      realFetch(baseUrl + path, { method, headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) }).then(
        async (res) => ({ status: res.status, body: await res.json() }),
      );
  };
  const dan = await login('dan');
  const eve = await login('eve');
  const { body } = await dan('POST', '/lobbies', { name: 'voice table' });
  await eve('POST', `/lobbies/${body.lobby.id}/join`, {});
  const [danId, eveId] = (await dan('GET', `/lobbies/${body.lobby.id}`)).body.lobby.members.map((m) => m.id);

  // Model answers with slightly wrong capitalisation; we should still map to the right players.
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith(config.llm.baseUrl)) return realFetch(url, init);
    const content = '{"winner": "Eve", "discarder": "DAN", "tai": 4, "payoutMode": "shooter"}';
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  };
  const ok = await dan('POST', `/ai/lobbies/${body.lobby.id}/parse-hand`, { transcript: 'eve four tie dan shoot shooter pay' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.source, 'ai');
  assert.deepEqual(
    { w: ok.body.hand.winnerId, d: ok.body.hand.discarderId, t: ok.body.hand.tai, p: ok.body.hand.payoutMode },
    { w: eveId, d: danId, t: 4, p: 'shooter' },
  );

  // If the AI service errors, the rule-based parser takes over.
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith(config.llm.baseUrl)) return realFetch(url, init);
    return new Response('boom', { status: 500 });
  };
  const fallback = await dan('POST', `/ai/lobbies/${body.lobby.id}/parse-hand`, { transcript: 'Dan won 2 tai from Eve' });
  assert.equal(fallback.body.source, 'rules');
  assert.equal(fallback.body.hand.winnerId, danId);
  assert.equal(fallback.body.hand.discarderId, eveId);
  assert.equal(fallback.body.hand.tai, 2);
  globalThis.fetch = realFetch;
});
