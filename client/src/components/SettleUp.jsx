import { settleUp } from '../lib/settlement.js';

// Who pays whom, in as few transfers as possible. Shown live during the game and as the final bill.
export default function SettleUp({ lobby, nameOf }) {
  const transfers = settleUp(lobby.totals);
  if (transfers.length === 0) return null;
  const finished = lobby.status === 'finished';
  return (
    <section className="card">
      <h2>{finished ? 'Settle up' : 'If you stopped now'}</h2>
      <ul className="list">
        {transfers.map((t) => (
          <li key={`${t.from}-${t.to}`} className="row between">
            <span>
              <strong>{nameOf(Number(t.from))}</strong> pays <strong>{nameOf(Number(t.to))}</strong>
            </span>
            <span className="num">{t.amount.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
