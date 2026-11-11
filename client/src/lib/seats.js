// Seat layout helpers for the table view. Plain JS (no React) so it can be tested with `node --test`.

export const WINDS = Object.freeze(['East', 'South', 'West', 'North']);
export const WIND_CHARS = Object.freeze({ East: '東', South: '南', West: '西', North: '北' });

// Turn order goes anticlockwise round the table. Seen from above with the anchor player at the
// bottom, the next player sits on their right, then opposite, then on their left.
export const SEAT_POSITIONS = Object.freeze(['bottom', 'right', 'top', 'left']);

/**
 * Where each player sits on screen.
 * @param {number[]} seatOrder player ids in turn order
 * @param {number|null} anchorId player to put at the bottom (usually "me"); null = first seat
 * @returns {{id:number, position:string}[]}
 */
export function seatLayout(seatOrder, anchorId = null) {
  const n = seatOrder.length;
  const start = anchorId != null && seatOrder.includes(anchorId) ? seatOrder.indexOf(anchorId) : 0;
  return seatOrder.map((id, i) => ({ id, position: SEAT_POSITIONS[(i - start + n) % n] }));
}

/** Seat winds for a seating order and dealer: the dealer is East, then South, West, North. */
export function seatWindsFor(seatOrder, dealerId) {
  const n = seatOrder.length;
  const d = Math.max(0, seatOrder.indexOf(dealerId));
  return Object.fromEntries(seatOrder.map((id, i) => [id, WINDS[(i - d + n) % n]]));
}

/** Swap two players' seats. Returns a new array. */
export function swapSeats(seatOrder, a, b) {
  const next = [...seatOrder];
  const i = next.indexOf(a);
  const j = next.indexOf(b);
  if (i < 0 || j < 0) return next;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
