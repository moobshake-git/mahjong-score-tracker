import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHandText, matchPlayer } from '../src/handParser.js';

const members = [
  { id: 1, username: 'Alice' },
  { id: 2, username: 'bob' },
  { id: 3, username: 'ah_beng' },
  { id: 4, username: 'Mei Ling' },
];
const parse = (t) => parseHandText(t, members);

test('winner, tai and discarder from a plain sentence', () => {
  assert.deepEqual(parse('Alice won 3 tai from Bob'), {
    winnerId: 1, discarderId: 2, selfDrawn: false, tai: 3, payoutMode: null, missing: [],
  });
});

test('number words and "off"', () => {
  const r = parse('bob won four tai off alice');
  assert.equal(r.winnerId, 2);
  assert.equal(r.discarderId, 1);
  assert.equal(r.tai, 4);
});

test('self-drawn / zimo', () => {
  for (const t of ['Ah Beng zimo 5 tai', 'ah beng self drawn five tai', 'Ah Beng self-draw 5 tai']) {
    const r = parse(t);
    assert.equal(r.winnerId, 3, t);
    assert.equal(r.discarderId, null, t);
    assert.equal(r.selfDrawn, true, t);
    assert.equal(r.tai, 5, t);
    assert.deepEqual(r.missing, [], t);
  }
});

test('"X shoot" marks the discarder even when said first', () => {
  const r = parse('Bob shoot, Alice 2 tai');
  assert.equal(r.discarderId, 2);
  assert.equal(r.winnerId, 1);
  assert.equal(r.tai, 2);
});

test('shooter pay vs normal payout', () => {
  assert.equal(parse('Alice 3 tai from Bob shooter pay').payoutMode, 'shooter');
  assert.equal(parse('Alice 3 tai from Bob, pay all').payoutMode, 'shooter');
  assert.equal(parse('Alice 3 tai from Bob normal payout').payoutMode, 'standard');
  assert.equal(parse('Alice 3 tai from Bob').payoutMode, null, 'not said = use lobby default');
  assert.equal(parse('Alice zimo 3 tai shooter pay').payoutMode, null, 'self-drawn has no shooter');
});

test('speech-to-text mistakes: "tie"/"thai", misspelt names, multi-word names', () => {
  const r = parse('Mei Ling won 2 thai from Alise');
  assert.equal(r.winnerId, 4);
  assert.equal(r.discarderId, 1);
  assert.equal(r.tai, 2);
  assert.equal(parse('alice 1 tie from bob').tai, 1);
});

test('reports what is missing', () => {
  assert.deepEqual(parse('Alice won').missing, ['discarder', 'tai']);
  assert.deepEqual(parse('three tai').missing, ['winner', 'discarder']);
});

test('matchPlayer', () => {
  assert.equal(matchPlayer('ALICE', members).id, 1);
  assert.equal(matchPlayer('ah beng', members).id, 3);
  assert.equal(matchPlayer('bobb', members), null, 'short names need an exact match');
  assert.equal(matchPlayer('zzz', members), null);
});
