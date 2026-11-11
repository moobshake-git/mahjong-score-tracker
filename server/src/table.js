// Seats, winds and dealer rotation. Pure functions only (no database) so they are easy to test.
//
// Seating is a list of player ids in turn order (anticlockwise round the table). It is chosen by the
// host at game setup; if not, it is the lobby's join order. The dealer always sits East; the next
// player in the list is South, then West, then North.
//
// Rotation rules (common Singapore play):
//   - Dealer wins            -> dealer keeps the deal.
//   - Someone else wins      -> the deal passes to the next player.
//   - Drawn hand (no winner) -> dealer keeps the deal, unless drawRotates is true.
//   - Instant payouts (kongs, animals) never affect the deal.
// After the deal has gone all the way round the table, the round (prevailing) wind moves on:
// East round -> South round -> West round -> North round. After the North round the game is complete.
//
// The game is split into "slots": one per dealer turn, n players x 4 rounds (16 for 4 players).
// slot = how many times the deal has passed so far. The progress strip in the UI is drawn from this.
//
// Table adjustments let the host fix the seating, dealer or round wind mid-game (e.g. people sat
// in a different order, or the app joined a game already in progress). Each adjustment has a
// `position` = how many entries had been recorded when it was made; it takes effect from that
// point, so earlier entries keep the dealer and winds they had.

export const WINDS = Object.freeze(['East', 'South', 'West', 'North']);

const sameSet = (a, b) => a.length === b.length && a.every((id) => b.includes(id));

/**
 * @param {Array<{kind?: string, winnerId?: number|null}>} entries in the order they were recorded
 * @param {number[]} playerIds seating order at the start of the game
 * @param {{ firstDealerId?: number|null, drawRotates?: boolean, startRound?: number,
 *           adjustments?: Array<{position:number, seatOrder:number[], dealerId:number, roundWind:number}> }} options
 * @returns {{ perEntry: Array<{dealerId:number, roundWind:string, slot:number}>, current: object }}
 */
export function computeTableState(
  entries,
  playerIds,
  { firstDealerId = null, drawRotates = false, startRound = 0, adjustments = [] } = {},
) {
  let order = [...playerIds];
  const n = order.length;
  const totalSlots = n * WINDS.length;
  let dealerIdx = Math.max(0, order.indexOf(firstDealerId));
  let passes = clampRound(startRound) * n; // how many times the deal has moved on
  let handNumber = 1; // hand number within the current dealer's turn (counts dealer repeats)

  const pending = [...adjustments].sort((a, b) => a.position - b.position || (a.id ?? 0) - (b.id ?? 0));
  let next = 0;
  const applyAdjustments = (position) => {
    while (next < pending.length && pending[next].position <= position) {
      const a = pending[next++];
      if (Array.isArray(a.seatOrder) && sameSet(a.seatOrder, order)) order = [...a.seatOrder];
      dealerIdx = Math.max(0, order.indexOf(a.dealerId));
      passes = clampRound(a.roundWind) * n;
      handNumber = 1;
    }
  };

  const roundWindOf = () => WINDS[Math.min(Math.floor(passes / n), WINDS.length - 1)];
  const slotOf = () => Math.min(passes, totalSlots - 1);

  const perEntry = entries.map((entry, i) => {
    applyAdjustments(i);
    const kind = entry.kind ?? 'win';
    const meta = { dealerId: order[dealerIdx], roundWind: roundWindOf(), slot: slotOf() };
    const endsHand = kind === 'win' || kind === 'draw';
    const rotates =
      (kind === 'win' && entry.winnerId !== order[dealerIdx]) || (kind === 'draw' && drawRotates);
    if (rotates) {
      dealerIdx = (dealerIdx + 1) % n;
      passes += 1;
      handNumber = 1;
    } else if (endsHand) {
      handNumber += 1;
    }
    return meta;
  });
  applyAdjustments(Infinity);

  const seatWinds = Object.fromEntries(order.map((id, i) => [id, WINDS[(i - dealerIdx + n) % n]]));
  return {
    perEntry,
    current: {
      dealerId: order[dealerIdx],
      roundWind: roundWindOf(),
      seatOrder: order,
      seatWinds,
      dealerHand: handNumber, // 1 = dealer's first hand, 2 = dealer has kept the deal once, ...
      slot: slotOf(),
      totalSlots,
      gameComplete: passes >= totalSlots,
    },
  };
}

function clampRound(r) {
  const v = Number(r);
  return Number.isInteger(v) && v >= 0 && v < WINDS.length ? v : 0;
}

/** Validate a seating order against the lobby's players. Throws on bad input. */
export function validateSeatOrder(seatOrder, playerIds) {
  if (!Array.isArray(seatOrder)) throw new Error('Seat order must be a list of players.');
  const ids = seatOrder.map(Number);
  if (new Set(ids).size !== ids.length || !sameSet(ids, playerIds)) {
    throw new Error('Seat order must list every player at the table exactly once.');
  }
  return ids;
}

/** Validate a round wind index (0 = East ... 3 = North). Throws on bad input. */
export function validateRoundWind(roundWind) {
  const v = Number(roundWind ?? 0);
  if (!Number.isInteger(v) || v < 0 || v >= WINDS.length) throw new Error('Round wind must be East, South, West or North.');
  return v;
}
