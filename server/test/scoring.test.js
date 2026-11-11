import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSettings, unitValue, handPayments, computeTotals } from '../src/scoring.js';

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

test('per-hand payout mode overrides the lobby default', () => {
  // Lobby default is standard; this hand is "shooter pays".
  const shooter = handPayments({ winnerId: 1, discarderId: 2, tai: 2, payoutMode: 'shooter' }, players, settings);
  assert.deepEqual(shooter, { 1: 0.8, 2: -0.8, 3: 0, 4: 0 });
  // Lobby default is shooter; this hand is "normal payout".
  const normal = handPayments({ winnerId: 1, discarderId: 2, tai: 2, payoutMode: 'standard' }, players, { ...settings, payoutMode: 'shooter' });
  assert.deepEqual(normal, { 1: 0.8, 2: -0.4, 3: -0.2, 4: -0.2 });
  // null = use the lobby default
  assert.deepEqual(handPayments({ winnerId: 1, discarderId: 2, tai: 2, payoutMode: null }, players, settings), normal);
  assert.throws(() => handPayments({ winnerId: 1, discarderId: 2, tai: 2, payoutMode: 'other' }, players, settings));
});
