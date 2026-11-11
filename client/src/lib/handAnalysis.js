// Works out which tai patterns a winning hand has, from its tiles.
// The result is a selection for the tai calculator (taiRules.js), so the photo flow and the
// tick-box calculator always agree, and players can still change any tick before using it.
// Plain JS (no React) so it can be tested with `node --test`.
import { countTai, SEAT_NUMBER } from './taiRules.js';
import { isAnimal, isBonus, isDragon, isHonour, isSuit, isWind, rankOf, sortTiles, suitOf, WINDS } from './tiles.js';

const WIND_CODE = Object.fromEntries(WINDS.map((w) => [w[0].toUpperCase() + w.slice(1), w])); // East -> east
const ORPHANS = ['b1', 'b9', 'c1', 'c9', 'd1', 'd9', 'east', 'south', 'west', 'north', 'red', 'green', 'white'];
const MAX_DECOMPOSITIONS = 200;

/** All ways to split the tiles into sets (chow / pong / kong) plus one pair, using exactly `kongs` kongs. */
function decompose(tiles, kongs) {
  const counts = {};
  for (const t of tiles) counts[t] = (counts[t] || 0) + 1;
  const keys = sortTiles(Object.keys(counts));
  const results = [];

  function dfs(kongsLeft, pair, sets) {
    if (results.length >= MAX_DECOMPOSITIONS) return;
    const t = keys.find((k) => counts[k] > 0);
    if (!t) {
      if (pair && kongsLeft === 0) results.push({ pair, sets: [...sets] });
      return;
    }
    const take = (tile, n) => (counts[tile] -= n);
    const give = (tile, n) => (counts[tile] += n);
    if (counts[t] >= 4 && kongsLeft > 0) {
      take(t, 4); sets.push({ type: 'kong', tile: t }); dfs(kongsLeft - 1, pair, sets); sets.pop(); give(t, 4);
    }
    if (counts[t] >= 3) {
      take(t, 3); sets.push({ type: 'pong', tile: t }); dfs(kongsLeft, pair, sets); sets.pop(); give(t, 3);
    }
    if (counts[t] >= 2 && !pair) {
      take(t, 2); dfs(kongsLeft, t, sets); give(t, 2);
    }
    if (isSuit(t) && rankOf(t) <= 7) {
      const s = suitOf(t);
      const t2 = `${s}${rankOf(t) + 1}`;
      const t3 = `${s}${rankOf(t) + 2}`;
      if (counts[t2] > 0 && counts[t3] > 0) {
        take(t, 1); take(t2, 1); take(t3, 1);
        sets.push({ type: 'chow', tile: t }); dfs(kongsLeft, pair, sets); sets.pop();
        give(t, 1); give(t2, 1); give(t3, 1);
      }
    }
  }
  dfs(kongs, null, []);
  return results;
}

/** Patterns that only depend on which tiles are in the hand, not how they are grouped. */
function colourAndBonus(main, bonus, seatWind) {
  const selection = {};
  const suits = new Set(main.filter(isSuit).map(suitOf));
  const honours = main.some(isHonour);
  if (suits.size === 1 && !honours) selection.fullColour = true;
  else if (suits.size === 1 && honours) selection.halfColour = true;

  const seatNo = SEAT_NUMBER[seatWind];
  if (seatNo) {
    const matching = bonus.filter((t) => t === `flower${seatNo}` || t === `season${seatNo}`).length;
    if (matching) selection.seatFlowers = matching;
  }
  const animals = bonus.filter(isAnimal).length;
  if (animals) selection.animals = animals;
  return selection;
}

/**
 * Analyse a winning hand.
 * @param {{ tiles: string[], seatWind?: string, roundWind?: string, taiCap?: number }} input
 *   tiles: every tile in the hand including kongs and bonus tiles (any order)
 *   seatWind / roundWind: 'East' | 'South' | 'West' | 'North' (as in the table state)
 * @returns {{
 *   status: 'ok' | 'not-winning' | 'wrong-count',
 *   selection: Record<string, number|boolean>,  // for taiRules.countTai / the calculator
 *   sets: {type: string, tile: string}[], pair: string|null,
 *   mainCount: number, notes: string[]
 * }}
 */
export function analyseHand({ tiles, seatWind, roundWind, taiCap = 99 }) {
  const main = tiles.filter((t) => !isBonus(t));
  const bonus = tiles.filter(isBonus);
  const notes = [];
  const base = colourAndBonus(main, bonus, seatWind);
  const result = (status, extra = {}) => ({ status, selection: base, sets: [], pair: null, mainCount: main.length, notes, ...extra });

  // A winning hand has 14 tiles, plus one more for each kong (at most 4 kongs).
  const kongs = main.length - 14;
  if (kongs < 0 || kongs > 4) {
    notes.push(`Found ${main.length} tiles (not counting flowers and animals). A winning hand has 14, plus 1 for each kong.`);
    return result('wrong-count');
  }

  // Thirteen Wonders: one of each terminal and honour, plus a pair of any of them.
  if (kongs === 0 && main.every((t) => ORPHANS.includes(t)) && ORPHANS.every((t) => main.includes(t))) {
    notes.push('Thirteen Wonders: a limit hand.');
    return result('ok', { selection: { ...base, limit: true } });
  }

  const options = decompose(main, kongs);
  if (options.length === 0) {
    notes.push("These tiles don't make 4 sets and a pair. Check for a missing or misread tile.");
    return result('not-winning');
  }

  const seat = WIND_CODE[seatWind];
  const round = WIND_CODE[roundWind];
  let best = null;
  for (const option of options) {
    const sel = { ...base };
    const triplets = option.sets.filter((s) => s.type !== 'chow');
    const dragonPongs = triplets.filter((s) => isDragon(s.tile)).length;
    if (dragonPongs) sel.dragonPongs = dragonPongs;
    if (seat && triplets.some((s) => s.tile === seat)) sel.seatWind = true;
    if (round && triplets.some((s) => s.tile === round)) sel.roundWind = true;
    if (triplets.length === 4) sel.allPongs = true;
    if (triplets.filter((s) => isWind(s.tile)).length === 4) sel.limit = true; // Big Four Winds
    if (main.every(isHonour)) sel.limit = true; // All honours

    const pairScores = isDragon(option.pair) || option.pair === seat || option.pair === round;
    if (triplets.length === 0 && !pairScores && bonus.length === 0) sel.pingHu = true;

    const score = countTai(sel, Infinity).tai;
    if (!best || score > best.score) best = { score, sel, option };
  }

  const { sel, option } = best;
  if (sel.limit && option.sets.filter((s) => s.type !== 'chow' && isWind(s.tile)).length === 4) notes.push('Big Four Winds: a limit hand.');
  else if (sel.limit) notes.push('All honours: a limit hand.');
  if (sel.pingHu) notes.push('Ping Hu needs a two-sided wait. Untick it if the winning tile filled a single wait.');
  if (kongs) notes.push(`Read ${kongs} kong${kongs > 1 ? 's' : ''} (4 of the same tile).`);
  const capped = countTai(sel, taiCap);
  if (capped.tai === 0) notes.push('No scoring patterns found. Tick any the photo cannot show (e.g. won on the last tile).');
  return { status: 'ok', selection: sel, sets: option.sets, pair: option.pair, mainCount: main.length, notes };
}
