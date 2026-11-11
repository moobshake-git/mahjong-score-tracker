// Preview of who pays what for a winning hand, used to draw the payment arrows before saving.
// It mirrors handPayments() in server/src/scoring.js; the server stays the source of truth for the
// real scores, so if you change the rules there, change them here too (the tests cover both).

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {{winnerId:number, discarderId:number|null, tai:number, payoutMode?:string}} hand
 * @param {number[]} playerIds
 * @param {{baseScore:number, multiplier:number, taiCap:number, payoutMode:string}} settings
 * @returns {Record<number, number>} change per player (sums to 0)
 */
export function previewWin({ winnerId, discarderId, tai, payoutMode }, playerIds, settings) {
  const unit = round2(settings.baseScore * settings.multiplier ** (Math.max(1, Math.min(tai, settings.taiCap)) - 1));
  const mode = payoutMode ?? settings.payoutMode;
  const others = playerIds.filter((id) => id !== winnerId);
  const deltas = Object.fromEntries(playerIds.map((id) => [id, 0]));
  if (discarderId == null) for (const id of others) deltas[id] = -2 * unit;
  else if (mode === 'shooter') deltas[discarderId] = -(2 * unit + (others.length - 1) * unit);
  else for (const id of others) deltas[id] = id === discarderId ? -2 * unit : -unit;
  deltas[winnerId] = -others.reduce((sum, id) => sum + deltas[id], 0);
  for (const id of playerIds) deltas[id] = round2(deltas[id]) || 0;
  return deltas;
}
