import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settleUp } from './settlement.js';

const net = (transfers) => {
  const n = {};
  for (const t of transfers) {
    n[t.from] = (n[t.from] ?? 0) - t.amount;
    n[t.to] = (n[t.to] ?? 0) + t.amount;
  }
  return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, Math.round(v * 100) / 100]));
};

test('one winner, three losers: three transfers to the winner', () => {
  const t = settleUp({ 1: 3.2, 2: -1.6, 3: -0.8, 4: -0.8 });
  assert.equal(t.length, 3);
  assert.ok(t.every((x) => x.to === '1'));
  assert.deepEqual(net(t), { 1: 3.2, 2: -1.6, 3: -0.8, 4: -0.8 });
});

test('two winners, two losers: at most three transfers and balances match', () => {
  const totals = { a: 2.1, b: 0.3, c: -1.2, d: -1.2 };
  const t = settleUp(totals);
  assert.ok(t.length <= 3);
  assert.deepEqual(net(t), totals);
});

test('exact pairs settle with one transfer each', () => {
  const t = settleUp({ a: 1.5, b: -1.5, c: 0.4, d: -0.4 });
  assert.equal(t.length, 2);
});

test('nobody owes anything', () => {
  assert.deepEqual(settleUp({ a: 0, b: 0 }), []);
});

test('no floating point leftovers', () => {
  const t = settleUp({ a: 0.1 + 0.2, b: -0.3 });
  assert.deepEqual(t, [{ from: 'b', to: 'a', amount: 0.3 }]);
});
