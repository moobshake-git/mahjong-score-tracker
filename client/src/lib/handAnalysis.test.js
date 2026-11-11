import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseHand } from './handAnalysis.js';
import { countTai } from './taiRules.js';
import { cleanTiles, sortTiles, tileLabel } from './tiles.js';

const rep = (t, n) => Array(n).fill(t);
const tai = (r, cap = 5) => countTai(r.selection, cap).tai;

test('Ping Hu: four chows, plain pair, no bonus tiles', () => {
  const r = analyseHand({
    tiles: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'c2', 'c3', 'c4', 'd6', 'd7', 'd8', 'd2', 'd2'],
    seatWind: 'South',
    roundWind: 'East',
  });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.selection, { pingHu: true });
  assert.equal(tai(r), 4);
  assert.match(r.notes.join(' '), /two-sided wait/);
});

test('no Ping Hu with a bonus tile or a scoring pair', () => {
  const chows = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'c2', 'c3', 'c4', 'd6', 'd7', 'd8'];
  assert.equal(analyseHand({ tiles: [...chows, 'd2', 'd2', 'cat'], seatWind: 'South', roundWind: 'East' }).selection.pingHu, undefined);
  assert.equal(analyseHand({ tiles: [...chows, 'red', 'red'], seatWind: 'South', roundWind: 'East' }).selection.pingHu, undefined);
  assert.equal(analyseHand({ tiles: [...chows, 'east', 'east'], seatWind: 'South', roundWind: 'East' }).selection.pingHu, undefined);
  // A wind that is neither the seat nor the round wind is a plain pair.
  assert.equal(analyseHand({ tiles: [...chows, 'west', 'west'], seatWind: 'South', roundWind: 'East' }).selection.pingHu, true);
});

test('all pongs + half colour + dragon pong', () => {
  const r = analyseHand({
    tiles: [...rep('b1', 3), ...rep('b5', 3), ...rep('b9', 3), ...rep('red', 3), 'east', 'east'],
    seatWind: 'South',
    roundWind: 'North',
  });
  assert.deepEqual(r.selection, { allPongs: true, halfColour: true, dragonPongs: 1 });
  assert.equal(countTai(r.selection, 10).tai, 5);
});

test('full colour', () => {
  const r = analyseHand({
    tiles: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', ...rep('c2', 3), 'c5', 'c5'],
    seatWind: 'West',
    roundWind: 'East',
  });
  assert.equal(r.selection.fullColour, true);
  assert.equal(r.selection.halfColour, undefined);
});

test('seat and round wind pongs both count', () => {
  const r = analyseHand({
    tiles: [...rep('east', 3), 'b1', 'b2', 'b3', 'c4', 'c5', 'c6', 'd7', 'd8', 'd9', 'd5', 'd5'],
    seatWind: 'East',
    roundWind: 'East',
  });
  assert.equal(r.selection.seatWind, true);
  assert.equal(r.selection.roundWind, true);
  assert.equal(tai(r), 2);
});

test('four of a tile with an extra tile is read as a kong', () => {
  const r = analyseHand({
    tiles: [...rep('b2', 4), 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'd7', 'd8', 'd9', 'd1', 'd1'],
    seatWind: 'South',
    roundWind: 'East',
  });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.sets.find((s) => s.type === 'kong'), { type: 'kong', tile: 'b2' });
  assert.match(r.notes.join(' '), /1 kong/);
});

test('picks the reading worth the most tai (three pongs beat three chows)', () => {
  const r = analyseHand({
    tiles: [...rep('b1', 3), ...rep('b2', 3), ...rep('b3', 3), ...rep('red', 3), 'd5', 'd5'],
    seatWind: 'South',
    roundWind: 'East',
  });
  assert.equal(r.selection.allPongs, true);
  assert.equal(tai(r), 3);
});

test('flowers and animals: only the seat number counts for flowers', () => {
  const r = analyseHand({
    tiles: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'c2', 'c3', 'c4', 'd6', 'd7', 'd8', 'd2', 'd2', 'flower2', 'season2', 'flower1', 'cat', 'rat'],
    seatWind: 'South',
    roundWind: 'East',
  });
  assert.equal(r.selection.seatFlowers, 2);
  assert.equal(r.selection.animals, 2);
  assert.equal(r.selection.pingHu, undefined);
});

test('wrong number of tiles', () => {
  const r = analyseHand({ tiles: ['b1', 'b2', 'b3'], seatWind: 'East', roundWind: 'East' });
  assert.equal(r.status, 'wrong-count');
  assert.match(r.notes[0], /Found 3 tiles/);
});

test('14 tiles that are not a winning hand still give colour and bonus patterns', () => {
  const r = analyseHand({
    tiles: ['c1', 'c3', 'c5', 'c7', 'c9', 'c1', 'c3', 'c5', 'c7', 'c9', 'c2', 'c4', 'c6', 'c8', 'cat'],
    seatWind: 'East',
    roundWind: 'East',
  });
  assert.equal(r.status, 'not-winning');
  assert.deepEqual(r.selection, { fullColour: true, animals: 1 });
});

test('limit hands: Thirteen Wonders and Big Four Winds', () => {
  const wonders = ['b1', 'b9', 'c1', 'c9', 'd1', 'd9', 'east', 'south', 'west', 'north', 'red', 'green', 'white', 'red'];
  assert.equal(analyseHand({ tiles: wonders, seatWind: 'East', roundWind: 'East' }).selection.limit, true);
  const winds = [...rep('east', 3), ...rep('south', 3), ...rep('west', 3), ...rep('north', 3), 'b5', 'b5'];
  const r = analyseHand({ tiles: winds, seatWind: 'East', roundWind: 'East' });
  assert.equal(r.selection.limit, true);
  assert.equal(tai(r, 6), 6);
});

test('cleanTiles drops unknown codes and impossible copies', () => {
  const { tiles, dropped } = cleanTiles(['B1', 'b1', 'b1', 'b1', 'b1', 'cat', 'cat', 'dragon', ' red ']);
  assert.deepEqual(tiles, ['b1', 'b1', 'b1', 'b1', 'cat', 'red']);
  assert.deepEqual(dropped, ['b1', 'cat', 'dragon']);
});

test('tile helpers', () => {
  assert.deepEqual(sortTiles(['red', 'cat', 'd1', 'b9', 'east']), ['b9', 'd1', 'east', 'red', 'cat']);
  assert.equal(tileLabel('c7'), '7 Char');
  assert.equal(tileLabel('season3'), 'Season 3');
});
