import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTableState } from '../src/table.js';

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
