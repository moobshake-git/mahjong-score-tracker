// Singapore Mahjong payout rules. Pure functions only (no database) so they are easy to test.
//
// Settings (entered by the host when the game starts):
//   baseScore  - amount paid for a minimum (1 tai) hand, e.g. 0.10
//   multiplier - how much the payout grows per extra tai, e.g. 2 (doubles each tai)
//   minTai     - smallest tai allowed to win (commonly 1)
//   taiCap     - tai above this count as the cap (commonly 5)
//   payoutMode - default for discard wins (each hand can override it):
//                'standard': "normal payout" - discarder pays 2 units, every other player pays 1 unit
//                'shooter' : "shooter pays" - discarder pays for everyone (2 + 1 per other player)
//   Self-drawn (zimo) wins: every other player pays 2 units, in both modes.
//
// "unit" = baseScore * multiplier ^ (min(tai, taiCap) - 1)
//
// Instant payouts (paid straight away, not tied to winning the hand). Amounts are in
// "base units" (multiples of baseScore) and each other player pays that amount:
//   kongConcealed - concealed kong (default 2)
//   kongExposed   - exposed kong (default 1). If it was made from someone's discard,
//                   that discarder pays for the whole table instead.
//   animalPair    - cat + rat, or rooster + centipede (default 1)
//   bonusSet      - all 4 flowers, all 4 seasons, or all 4 animals (default 2)
// House rules vary a lot here, so the host can change every amount in game setup.
//
// Every row in the hands table is an "entry" with a kind:
//   win                      - { winnerId, discarderId|null, tai }
//   draw                     - nobody won; no money moves (matters for dealer rotation)
//   kong_concealed, kong_exposed, animal_pair, bonus_set
//                            - { winnerId: the player who is paid, discarderId? (kong_exposed only) }

export const PAYOUT_MODES = Object.freeze(['standard', 'shooter']);

export const INSTANT_KINDS = Object.freeze({
  kong_concealed: 'kongConcealed',
  kong_exposed: 'kongExposed',
  animal_pair: 'animalPair',
  bonus_set: 'bonusSet',
});
export const ENTRY_KINDS = Object.freeze(['win', 'draw', ...Object.keys(INSTANT_KINDS)]);

export const DEFAULT_INSTANT_PAYOUTS = Object.freeze({
  kongConcealed: 2,
  kongExposed: 1,
  animalPair: 1,
  bonusSet: 2,
});

export const DEFAULT_SETTINGS = Object.freeze({
  baseScore: 0.1,
  multiplier: 2,
  minTai: 1,
  taiCap: 5,
  payoutMode: 'standard',
  drawRotates: false, // false: dealer keeps the deal after a drawn hand
  instantPayouts: DEFAULT_INSTANT_PAYOUTS,
});

/** Validate and normalise settings coming from the client. Throws on bad input. */
export function validateSettings(input = {}) {
  const s = { ...DEFAULT_SETTINGS, ...input };
  const num = (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v);
  s.baseScore = num(s.baseScore);
  s.multiplier = num(s.multiplier);
  s.minTai = num(s.minTai);
  s.taiCap = num(s.taiCap);

  if (!Number.isFinite(s.baseScore) || s.baseScore <= 0) throw new Error('Base score must be a positive number.');
  if (!Number.isFinite(s.multiplier) || s.multiplier < 1) throw new Error('Multiplier must be a number of at least 1.');
  if (!Number.isInteger(s.minTai) || s.minTai < 0) throw new Error('Minimum tai must be a whole number (0 or more).');
  if (!Number.isInteger(s.taiCap) || s.taiCap < Math.max(1, s.minTai)) throw new Error('Tai cap must be a whole number no smaller than the minimum tai.');
  if (!PAYOUT_MODES.includes(s.payoutMode)) throw new Error("Payout mode must be 'standard' or 'shooter'.");

  const instant = { ...DEFAULT_INSTANT_PAYOUTS, ...(s.instantPayouts || {}) };
  for (const key of Object.keys(DEFAULT_INSTANT_PAYOUTS)) {
    instant[key] = num(instant[key]);
    if (!Number.isFinite(instant[key]) || instant[key] < 0 || instant[key] > 100) {
      throw new Error('Instant payout amounts must be numbers between 0 and 100.');
    }
  }
  return {
    baseScore: s.baseScore,
    multiplier: s.multiplier,
    minTai: s.minTai,
    taiCap: s.taiCap,
    payoutMode: s.payoutMode,
    drawRotates: Boolean(s.drawRotates),
    instantPayouts: Object.fromEntries(Object.keys(DEFAULT_INSTANT_PAYOUTS).map((k) => [k, instant[k]])),
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

/** Value of one "unit" for a hand of the given tai. */
export function unitValue(tai, settings) {
  const effective = Math.max(1, Math.min(tai, settings.taiCap));
  return round2(settings.baseScore * settings.multiplier ** (effective - 1));
}

/**
 * Work out who pays whom for one winning hand.
 * @param {{winnerId:number, discarderId:number|null, tai:number, payoutMode?:string|null}} hand
 *        payoutMode overrides settings.payoutMode for this hand (only matters for discard wins)
 * @param {number[]} playerIds all players at the table (including the winner)
 * @param {object} settings validated settings
 * @returns {Record<number, number>} change in score per player id (sums to 0)
 */
export function handPayments(hand, playerIds, settings) {
  const { winnerId, discarderId, tai } = hand;
  const payoutMode = hand.payoutMode ?? settings.payoutMode;
  if (!PAYOUT_MODES.includes(payoutMode)) throw new Error("Payout mode must be 'standard' or 'shooter'.");
  if (!playerIds.includes(winnerId)) throw new Error('Winner is not at this table.');
  if (discarderId != null && (discarderId === winnerId || !playerIds.includes(discarderId))) {
    throw new Error('Discarder must be another player at this table.');
  }
  if (!Number.isInteger(tai) || tai < settings.minTai) throw new Error(`Tai must be a whole number of at least ${settings.minTai}.`);

  const unit = unitValue(tai, settings);
  const others = playerIds.filter((id) => id !== winnerId);
  const deltas = Object.fromEntries(playerIds.map((id) => [id, 0]));

  if (discarderId == null) {
    // Self-drawn: everyone pays double.
    for (const id of others) deltas[id] -= 2 * unit;
  } else if (payoutMode === 'shooter') {
    // Discarder pays for the whole table.
    deltas[discarderId] -= 2 * unit + (others.length - 1) * unit;
  } else {
    for (const id of others) deltas[id] -= id === discarderId ? 2 * unit : unit;
  }
  deltas[winnerId] = -others.reduce((sum, id) => sum + deltas[id], 0);

  for (const id of playerIds) deltas[id] = round2(deltas[id]) || 0; // avoid -0
  return deltas;
}

/**
 * Instant payout (kong, animal pair, bonus set): every other player pays the receiver
 * `amount × baseScore`. An exposed kong made from a discard is paid in full by the discarder.
 */
export function instantPayments(entry, playerIds, settings) {
  const key = INSTANT_KINDS[entry.kind];
  if (!key) throw new Error('Unknown payout type.');
  const { winnerId, discarderId } = entry;
  if (!playerIds.includes(winnerId)) throw new Error('Choose who gets paid.');
  if (discarderId != null) {
    if (entry.kind !== 'kong_exposed') throw new Error('Only an exposed kong can be paid by one player.');
    if (discarderId === winnerId || !playerIds.includes(discarderId)) throw new Error('Discarder must be another player at this table.');
  }
  const instant = { ...DEFAULT_INSTANT_PAYOUTS, ...(settings.instantPayouts || {}) };
  const each = round2(instant[key] * settings.baseScore);
  const others = playerIds.filter((id) => id !== winnerId);
  const deltas = Object.fromEntries(playerIds.map((id) => [id, 0]));
  if (discarderId != null) deltas[discarderId] = -each * others.length;
  else for (const id of others) deltas[id] = -each;
  deltas[winnerId] = each * others.length;
  for (const id of playerIds) deltas[id] = round2(deltas[id]) || 0;
  return deltas;
}

/** Payments for any entry kind. Throws on invalid input. */
export function entryPayments(entry, playerIds, settings) {
  const kind = entry.kind ?? 'win';
  if (kind === 'win') return handPayments(entry, playerIds, settings);
  if (kind === 'draw') return Object.fromEntries(playerIds.map((id) => [id, 0]));
  return instantPayments({ ...entry, kind }, playerIds, settings);
}

/** Running totals across all entries. Returns { totals, history } */
export function computeTotals(hands, playerIds, settings) {
  const totals = Object.fromEntries(playerIds.map((id) => [id, 0]));
  const history = hands.map((hand) => {
    const deltas = entryPayments(hand, playerIds, settings);
    for (const id of playerIds) totals[id] = round2(totals[id] + deltas[id]);
    return { ...hand, deltas };
  });
  return { totals, history };
}
