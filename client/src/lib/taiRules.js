// Tai patterns for the tai calculator. Plain JS (no React) so it can be tested with `node --test`.
//
// House rules vary between tables. To change a value, edit TAI_ITEMS. Each item is either:
//   type 'check' - ticked or not, worth `tai`
//   type 'count' - a number from 0 to `max`, worth `tai` each
// Items with the same `group` can't be picked together (e.g. half colour vs full colour).
// `limit: true` means the hand is worth the table's tai cap, whatever else is ticked.

export const TAI_ITEMS = Object.freeze([
  { id: 'dragonPongs', label: 'Dragon pongs', type: 'count', max: 3, tai: 1 },
  { id: 'seatWind', label: 'Pong of your seat wind', type: 'check', tai: 1, hint: 'seat' },
  { id: 'roundWind', label: 'Pong of the round wind', type: 'check', tai: 1, hint: 'round' },
  { id: 'allPongs', label: 'All pongs (Dui Dui Hu)', type: 'check', tai: 2, group: 'shape' },
  { id: 'pingHu', label: 'Ping Hu (all chows, no bonus tiles)', type: 'check', tai: 4, group: 'shape' },
  { id: 'halfColour', label: 'Half colour (one suit + honours)', type: 'check', tai: 2, group: 'colour' },
  { id: 'fullColour', label: 'Full colour (one suit only)', type: 'check', tai: 4, group: 'colour' },
  { id: 'seatFlowers', label: 'Flowers/seasons matching your seat', type: 'count', max: 2, tai: 1, hint: 'seatNumber' },
  { id: 'animals', label: 'Animals', type: 'count', max: 4, tai: 1 },
  { id: 'kongReplacement', label: 'Won on a kong replacement tile', type: 'check', tai: 1 },
  { id: 'robbedKong', label: 'Won by robbing a kong', type: 'check', tai: 1 },
  { id: 'lastTile', label: 'Won on the last tile', type: 'check', tai: 1 },
  { id: 'limit', label: 'Limit hand (Thirteen Wonders, Big Four Winds, …)', type: 'check', tai: 0, limit: true },
]);

/** Seat number used for matching flowers: East 1, South 2, West 3, North 4. */
export const SEAT_NUMBER = Object.freeze({ East: 1, South: 2, West: 3, North: 4 });

/**
 * Apply a change to the selection, clearing other items in the same group.
 * @param {Record<string, number|boolean>} selection
 */
export function toggleItem(selection, id, value) {
  const item = TAI_ITEMS.find((i) => i.id === id);
  const next = { ...selection, [id]: value };
  if (item?.group && value) {
    for (const other of TAI_ITEMS) if (other.group === item.group && other.id !== id) delete next[other.id];
  }
  return next;
}

/**
 * Count tai for a selection.
 * @param {Record<string, number|boolean>} selection e.g. { dragonPongs: 2, halfColour: true }
 * @param {number} taiCap
 * @returns {{ tai: number, items: {label: string, tai: number}[], capped: boolean }}
 */
export function countTai(selection, taiCap) {
  const items = [];
  let limit = false;
  for (const item of TAI_ITEMS) {
    const v = selection[item.id];
    if (!v) continue;
    if (item.limit) {
      limit = true;
      items.push({ label: item.label, tai: taiCap });
      continue;
    }
    const times = item.type === 'count' ? Math.max(0, Math.min(Number(v) || 0, item.max)) : 1;
    if (times > 0) items.push({ label: times > 1 ? `${item.label} ×${times}` : item.label, tai: item.tai * times });
  }
  const raw = limit ? taiCap : items.reduce((sum, i) => sum + i.tai, 0);
  return { tai: Math.min(raw, taiCap), items, capped: raw >= taiCap };
}

/** Short text for the hand's note, e.g. "Dragon pongs ×2, Half colour". */
export function describe(result) {
  return result.items.map((i) => i.label.replace(/ \(.*\)/, '')).join(', ').slice(0, 200);
}
