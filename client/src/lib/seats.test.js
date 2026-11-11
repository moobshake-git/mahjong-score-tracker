import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seatLayout, seatWindsFor, swapSeats } from './seats.js';
import { previewWin } from './payments.js';
// The preview must match the real scoring on the server.
import { handPayments } from '../../../server/src/scoring.js';

test('the anchor player sits at the bottom, the next player on their right', () => {
  assert.deepEqual(seatLayout([1, 2, 3, 4], 3), [
    { id: 1, position: 'top' },
    { id: 2, position: 'left' },
    { id: 3, position: 'bottom' },
    { id: 4, position: 'right' },
  ]);
  assert.equal(seatLayout([1, 2, 3, 4], null)[0].position, 'bottom');
  assert.equal(seatLayout([1, 2, 3, 4], 99)[0].position, 'bottom', 'unknown anchor = first seat');
});

test('three players use bottom, right and top', () => {
  assert.deepEqual(seatLayout([5, 6, 7]).map((s) => s.position), ['bottom', 'right', 'top']);
});

test('seat winds start at the dealer', () => {
  assert.deepEqual(seatWindsFor([1, 2, 3, 4], 3), { 3: 'East', 4: 'South', 1: 'West', 2: 'North' });
});

test('swapping seats', () => {
  assert.deepEqual(swapSeats([1, 2, 3, 4], 1, 3), [3, 2, 1, 4]);
  assert.deepEqual(swapSeats([1, 2, 3, 4], 1, 99), [1, 2, 3, 4]);
});

test('payment preview matches the server scoring', () => {
  const settings = { baseScore: 0.2, multiplier: 2, minTai: 1, taiCap: 5, payoutMode: 'standard' };
  const players = [1, 2, 3, 4];
  const cases = [
    { winnerId: 1, discarderId: 2, tai: 3 },
    { winnerId: 1, discarderId: 2, tai: 3, payoutMode: 'shooter' },
    { winnerId: 4, discarderId: null, tai: 9 },
    { winnerId: 2, discarderId: 3, tai: 1 },
  ];
  for (const hand of cases) assert.deepEqual(previewWin(hand, players, settings), handPayments(hand, players, settings));
});
