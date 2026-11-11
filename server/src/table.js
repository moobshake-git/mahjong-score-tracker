// Seats, winds and dealer rotation. Pure functions only (no database) so they are easy to test.
//
// Seating follows the lobby's player order (join order), going anticlockwise round the table.
// The dealer always sits East; the next player is South, then West, then North.
//
// Rotation rules (common Singapore play):
//   - Dealer wins            -> dealer keeps the deal.
//   - Someone else wins      -> the deal passes to the next player.
//   - Drawn hand (no winner) -> dealer keeps the deal, unless settings.drawRotates is true.
//   - Instant payouts (kongs, animals) never affect the deal.
// After the deal has gone all the way round the table, the round (prevailing) wind moves on:
// East round -> South round -> West round -> North round. After the North round the game is complete.

export const WINDS = Object.freeze(['East', 'South', 'West', 'North']);

/**
 * @param {Array<{kind?: string, winnerId?: number|null}>} entries in the order they were recorded
 * @param {number[]} playerIds seating order
 * @param {{ firstDealerId?: number|null, drawRotates?: boolean }} options
 * @returns {{ perEntry: Array<{dealerId:number, roundWind:string}>, current: object }}
 */
export function computeTableState(entries, playerIds, { firstDealerId = null, drawRotates = false } = {}) {
  const n = playerIds.length;
  let dealerIdx = Math.max(0, playerIds.indexOf(firstDealerId));
  let passes = 0; // how many times the deal has moved on
  let handNumber = 1; // hand number within the current dealer's turn (counts dealer repeats)

  const roundWindOf = () => WINDS[Math.min(Math.floor(passes / n), WINDS.length - 1)];

  const perEntry = entries.map((entry) => {
    const kind = entry.kind ?? 'win';
    const meta = { dealerId: playerIds[dealerIdx], roundWind: roundWindOf() };
    const endsHand = kind === 'win' || kind === 'draw';
    const rotates =
      (kind === 'win' && entry.winnerId !== playerIds[dealerIdx]) || (kind === 'draw' && drawRotates);
    if (rotates) {
      dealerIdx = (dealerIdx + 1) % n;
      passes += 1;
      handNumber = 1;
    } else if (endsHand) {
      handNumber += 1;
    }
    return meta;
  });

  const seatWinds = Object.fromEntries(playerIds.map((id, i) => [id, WINDS[(i - dealerIdx + n) % n]]));
  return {
    perEntry,
    current: {
      dealerId: playerIds[dealerIdx],
      roundWind: roundWindOf(),
      seatWinds,
      dealerHand: handNumber, // 1 = dealer's first hand, 2 = dealer has kept the deal once, ...
      gameComplete: passes >= n * WINDS.length,
    },
  };
}
