import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTableState, validateSeatOrder, validateRoundWind } from '../src/table.js';

const players = [10, 20, 30, 40];
const win = (winnerId) => ({ kind: 'win', winnerId });

test('start: first player is East dealer in the East round', () => {
  const { current } = computeTableState([], players);
  assert.equal(current.dealerId, 10);
  assert.equal(current.roundWind, 'East');
  assert.deepEqual(current.seatWinds, { 10: 'East', 20: 'South', 30: 'West', 40: 'North' });
});

test('a chosen first dealer sits East', () => {
  const { current } = computeTableState([], players, { firstDealerId: 30 });
  assert.deepEqual(current.seatWinds, { 30: 'East', 40: 'South', 10: 'West', 20: 'North' });
});

test('dealer keeps the deal on a dealer win, passes it on otherwise', () => {
  const { perEntry, current } = computeTableState([win(10), win(10), win(30)], players);
  assert.deepEqual(perEntry.map((e) => e.dealerId), [10, 10, 10]);
  assert.equal(current.dealerId, 20);
  assert.equal(current.seatWinds[20], 'East');
  assert.equal(current.seatWinds[10], 'North');
});

test('draws keep the dealer by default, or rotate when drawRotates is on', () => {
  assert.equal(computeTableState([{ kind: 'draw' }], players).current.dealerId, 10);
  assert.equal(computeTableState([{ kind: 'draw' }], players, { drawRotates: true }).current.dealerId, 20);
});

test('instant payouts never move the deal', () => {
  const { current } = computeTableState([{ kind: 'kong_concealed', winnerId: 30 }], players);
  assert.equal(current.dealerId, 10);
  assert.equal(current.dealerHand, 1);
});

test('round wind moves on after the deal goes all the way round', () => {
  const entries = [win(20), win(30), win(40), win(10)]; // each non-dealer win passes the deal
  const { perEntry, current } = computeTableState(entries, players);
  assert.deepEqual(perEntry.map((e) => e.roundWind), ['East', 'East', 'East', 'East']);
  assert.equal(current.roundWind, 'South');
  assert.equal(current.dealerId, 10);
});

test('game is complete after the North round', () => {
  const lap = [win(20), win(30), win(40), win(10)];
  const { current } = computeTableState([...lap, ...lap, ...lap, ...lap], players);
  assert.equal(current.gameComplete, true);
  assert.equal(current.roundWind, 'North');
});

test('slots count dealer turns across the whole game', () => {
  const { perEntry, current } = computeTableState([win(20), win(20), win(30)], players);
  assert.deepEqual(perEntry.map((e) => e.slot), [0, 1, 1]);
  assert.equal(current.slot, 2);
  assert.equal(current.totalSlots, 16);
});

test('a game can start in a later round', () => {
  const { current } = computeTableState([], players, { startRound: 2 });
  assert.equal(current.roundWind, 'West');
  assert.equal(current.slot, 8);
});

test('adjustments change seats, dealer and round from their position on', () => {
  const entries = [win(20), win(40), win(40)];
  const adjustments = [{ position: 1, seatOrder: [40, 30, 20, 10], dealerId: 40, roundWind: 1 }];
  const { perEntry, current } = computeTableState(entries, players, { adjustments });
  // Entry 0 was before the fix: dealer 10 in the East round.
  assert.deepEqual(perEntry[0], { dealerId: 10, roundWind: 'East', slot: 0 });
  // From entry 1: dealer 40 in the South round; 40 wins twice and keeps the deal.
  assert.deepEqual(perEntry[1], { dealerId: 40, roundWind: 'South', slot: 4 });
  assert.equal(current.dealerId, 40);
  assert.deepEqual(current.seatOrder, [40, 30, 20, 10]);
  assert.deepEqual(current.seatWinds, { 40: 'East', 30: 'South', 20: 'West', 10: 'North' });
  assert.equal(current.dealerHand, 3);
});

test('an adjustment after the last entry applies to the current state', () => {
  const { current } = computeTableState([win(10)], players, {
    adjustments: [{ position: 5, seatOrder: players, dealerId: 30, roundWind: 0 }],
  });
  assert.equal(current.dealerId, 30);
});

test('an adjustment with the wrong players keeps the old seating', () => {
  const { current } = computeTableState([], players, {
    adjustments: [{ position: 0, seatOrder: [10, 20, 99, 40], dealerId: 20, roundWind: 0 }],
  });
  assert.deepEqual(current.seatOrder, players);
  assert.equal(current.dealerId, 20);
});

test('seat order and round wind validation', () => {
  assert.deepEqual(validateSeatOrder(['20', 10, 40, 30], players), [20, 10, 40, 30]);
  assert.throws(() => validateSeatOrder([10, 10, 20, 30], players));
  assert.throws(() => validateSeatOrder([10, 20, 30], players));
  assert.equal(validateRoundWind(3), 3);
  assert.throws(() => validateRoundWind(4));
});
