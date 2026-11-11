import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countTai, toggleItem, describe } from './taiRules.js';

test('adds up ticked patterns', () => {
  const r = countTai({ dragonPongs: 2, halfColour: true, animals: 1 }, 5);
  assert.equal(r.tai, 5);
  assert.equal(r.capped, true);
  assert.equal(countTai({ dragonPongs: 1, seatWind: true }, 5).tai, 2);
});

test('nothing ticked is 0 tai', () => {
  assert.deepEqual(countTai({}, 5), { tai: 0, items: [], capped: false });
});

test('total is capped at the table cap', () => {
  assert.equal(countTai({ fullColour: true, allPongs: true, dragonPongs: 1 }, 5).tai, 5);
  assert.equal(countTai({ fullColour: true, allPongs: true, dragonPongs: 1 }, 10).tai, 7);
});

test('limit hand is worth the cap', () => {
  const r = countTai({ limit: true }, 6);
  assert.equal(r.tai, 6);
  assert.equal(r.capped, true);
});

test('counts are clamped to their max', () => {
  assert.equal(countTai({ dragonPongs: 9 }, 10).tai, 3);
});

test('picking full colour clears half colour (same group)', () => {
  const s = toggleItem({ halfColour: true, dragonPongs: 1 }, 'fullColour', true);
  assert.deepEqual(s, { dragonPongs: 1, fullColour: true });
});

test('describe gives a short note', () => {
  assert.equal(describe(countTai({ dragonPongs: 2, allPongs: true }, 5)), 'Dragon pongs ×2, All pongs');
});
