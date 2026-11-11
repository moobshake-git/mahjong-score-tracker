import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSettings, unitValue, handPayments, entryPayments, computeTotals } from '../src/scoring.js';

const settings = validateSettings({ baseScore: 0.1, multiplier: 2, minTai: 1, taiCap: 5, payoutMode: 'standard' });
const players = [1, 2, 3, 4];

test('unit value doubles per tai and stops at the cap', () => {
  assert.equal(unitValue(1, settings), 0.1);
  assert.equal(unitValue(3, settings), 0.4);
  assert.equal(unitValue(5, settings), 1.6);
  assert.equal(unitValue(10, settings), 1.6);
});

test('discard win (standard): discarder pays double, others single', () => {
  const d = handPayments({ winnerId: 1, discarderId: 2, tai: 2 }, players, settings);
  assert.deepEqual(d, { 1: 0.8, 2: -0.4, 3: -0.2, 4: -0.2 });
});

test('discard win (shooter): discarder pays for everyone', () => {
  const s = { ...settings, payoutMode: 'shooter' };
  const d = handPayments({ winnerId: 1, discarderId: 2, tai: 2 }, players, s);
  assert.deepEqual(d, { 1: 0.8, 2: -0.8, 3: 0, 4: 0 });
});

test('self-drawn: everyone pays double', () => {
  const d = handPayments({ winnerId: 3, discarderId: null, tai: 1 }, players, settings);
  assert.deepEqual(d, { 1: -0.2, 2: -0.2, 3: 0.6, 4: -0.2 });
});

test('totals always sum to zero', () => {
  const hands = [
    { winnerId: 1, discarderId: 2, tai: 3 },
    { winnerId: 4, discarderId: null, tai: 5 },
    { winnerId: 2, discarderId: 1, tai: 1 },
  ];
  const { totals, history } = computeTotals(hands, players, settings);
  assert.equal(history.length, 3);
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum) < 1e-9);
});

test('rejects invalid hands and settings', () => {
  assert.throws(() => handPayments({ winnerId: 1, discarderId: 1, tai: 2 }, players, settings));
  assert.throws(() => handPayments({ winnerId: 9, discarderId: null, tai: 2 }, players, settings));
  assert.throws(() => handPayments({ winnerId: 1, discarderId: null, tai: 0 }, players, settings));
  assert.throws(() => validateSettings({ baseScore: -1 }));
  assert.throws(() => validateSettings({ payoutMode: 'other' }));
});

test('draws move no money', () => {
  assert.deepEqual(entryPayments({ kind: 'draw' }, players, settings), { 1: 0, 2: 0, 3: 0, 4: 0 });
});

test('instant payouts: each other player pays the set number of base units', () => {
  // Defaults: concealed kong 2, exposed kong 1, animal pair 1, bonus set 2 (× base 0.10)
  assert.deepEqual(entryPayments({ kind: 'kong_concealed', winnerId: 1 }, players, settings), { 1: 0.6, 2: -0.2, 3: -0.2, 4: -0.2 });
  assert.deepEqual(entryPayments({ kind: 'kong_exposed', winnerId: 2 }, players, settings), { 1: -0.1, 2: 0.3, 3: -0.1, 4: -0.1 });
  assert.deepEqual(entryPayments({ kind: 'animal_pair', winnerId: 3 }, players, settings), { 1: -0.1, 2: -0.1, 3: 0.3, 4: -0.1 });
  assert.deepEqual(entryPayments({ kind: 'bonus_set', winnerId: 4 }, players, settings), { 1: -0.2, 2: -0.2, 3: -0.2, 4: 0.6 });
});

test('exposed kong from a discard: the discarder pays for the table', () => {
  assert.deepEqual(
    entryPayments({ kind: 'kong_exposed', winnerId: 1, discarderId: 3 }, players, settings),
    { 1: 0.3, 2: 0, 3: -0.3, 4: 0 },
  );
  assert.throws(() => entryPayments({ kind: 'animal_pair', winnerId: 1, discarderId: 3 }, players, settings));
});

test('instant payout amounts are configurable and validated', () => {
  const s = validateSettings({ instantPayouts: { kongConcealed: 4 } });
  assert.equal(s.instantPayouts.kongConcealed, 4);
  assert.equal(s.instantPayouts.animalPair, 1, 'missing amounts fall back to defaults');
  assert.deepEqual(entryPayments({ kind: 'kong_concealed', winnerId: 1 }, [1, 2], s), { 1: 0.4, 2: -0.4 });
  assert.throws(() => validateSettings({ instantPayouts: { bonusSet: -1 } }));
});

test('totals mix wins and instant payouts and still sum to zero', () => {
  const entries = [
    { kind: 'kong_concealed', winnerId: 2 },
    { kind: 'win', winnerId: 1, discarderId: 2, tai: 3 },
    { kind: 'draw' },
    { kind: 'animal_pair', winnerId: 4 },
  ];
  const { totals } = computeTotals(entries, players, settings);
  assert.ok(Math.abs(Object.values(totals).reduce((a, b) => a + b, 0)) < 1e-9);
  assert.equal(totals[1], 1.6 - 0.2 - 0.1);
});
