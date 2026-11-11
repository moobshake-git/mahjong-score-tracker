// Turn final scores into the smallest practical list of "X pays Y" transfers.
// Pure function (no React) so it can be tested with `node --test`.
//
// Works in cents to avoid floating point drift. Greedy: the biggest debtor pays the
// biggest creditor until one of them is settled. This needs at most (players - 1) transfers.

/**
 * @param {Record<string|number, number>} totals score per player id (should sum to ~0)
 * @returns {{ from: string, to: string, amount: number }[]} amounts in the same units as totals
 */
export function settleUp(totals) {
  const entries = Object.entries(totals).map(([id, v]) => ({ id, cents: Math.round(Number(v) * 100) }));
  const debtors = entries.filter((e) => e.cents < 0).map((e) => ({ id: e.id, left: -e.cents }));
  const creditors = entries.filter((e) => e.cents > 0).map((e) => ({ id: e.id, left: e.cents }));
  const byLeftDesc = (a, b) => b.left - a.left;

  const transfers = [];
  while (debtors.length && creditors.length) {
    debtors.sort(byLeftDesc);
    creditors.sort(byLeftDesc);
    const d = debtors[0];
    const c = creditors[0];
    const cents = Math.min(d.left, c.left);
    transfers.push({ from: d.id, to: c.id, amount: cents / 100 });
    d.left -= cents;
    c.left -= cents;
    if (d.left === 0) debtors.shift();
    if (c.left === 0) creditors.shift();
  }
  return transfers;
}
