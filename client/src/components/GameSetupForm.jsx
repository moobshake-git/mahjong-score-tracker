import { useState } from 'react';
import SeatArranger from './SeatArranger.jsx';

const DEFAULTS = {
  baseScore: '0.10',
  multiplier: '2',
  minTai: '1',
  taiCap: '5',
  payoutMode: 'standard',
  drawRotates: false,
  kongConcealed: '2',
  kongExposed: '1',
  animalPair: '1',
  bonusSet: '2',
};

const INSTANT_FIELDS = [
  ['kongConcealed', 'Concealed kong'],
  ['kongExposed', 'Exposed kong'],
  ['animalPair', 'Animal pair (cat+rat, rooster+centipede)'],
  ['bonusSet', 'Full set of 4 flowers / seasons / animals'],
];

// Host enters base score and multiplier (and a few house rules) before the game starts.
export default function GameSetupForm({ members, onStart }) {
  const [form, setForm] = useState(DEFAULTS);
  // Seating, first dealer and starting round wind. If players join or leave while the host is
  // setting up, the seating resets to join order.
  const ids = members.map((m) => m.id);
  const [seats, setSeats] = useState({ seatOrder: ids, dealerId: ids[0], roundWind: 0 });
  const seatsValid = seats.seatOrder.length === ids.length && ids.every((id) => seats.seatOrder.includes(id));
  const seating = seatsValid ? seats : { seatOrder: ids, dealerId: ids[0], roundWind: seats.roundWind };
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const playerCount = members.length;

  const base = Number(form.baseScore);
  const mult = Number(form.multiplier);
  const minTai = Math.max(1, Number(form.minTai) || 1);
  const cap = Number(form.taiCap);
  const preview =
    base > 0 && mult >= 1 && cap >= minTai && cap <= 20
      ? Array.from({ length: cap - minTai + 1 }, (_, i) => {
          const tai = minTai + i;
          return { tai, unit: base * mult ** (tai - 1) };
        })
      : [];

  function onSubmit(e) {
    e.preventDefault();
    onStart({
      baseScore: Number(form.baseScore),
      multiplier: Number(form.multiplier),
      minTai: Number(form.minTai),
      taiCap: Number(form.taiCap),
      payoutMode: form.payoutMode,
      seatOrder: seating.seatOrder,
      firstDealerId: seating.dealerId,
      startRound: seating.roundWind,
      drawRotates: form.drawRotates,
      instantPayouts: Object.fromEntries(INSTANT_FIELDS.map(([k]) => [k, Number(form[k])])),
    }).catch(() => {});
  }

  return (
    <section className="card">
      <h2>Game setup</h2>
      <form onSubmit={onSubmit} className="stack">
        <div className="grid2">
          <label>Base score<input type="number" step="0.01" min="0.01" value={form.baseScore} onChange={set('baseScore')} required /></label>
          <label>Multiplier per tai<input type="number" step="0.1" min="1" value={form.multiplier} onChange={set('multiplier')} required /></label>
          <label>Minimum tai<input type="number" min="0" value={form.minTai} onChange={set('minTai')} required /></label>
          <label>Tai cap<input type="number" min="1" value={form.taiCap} onChange={set('taiCap')} required /></label>
        </div>
        <label>
          Default discard payout (can be changed for each hand)
          <select value={form.payoutMode} onChange={set('payoutMode')}>
            <option value="standard">Normal payout – shooter pays 2×, others 1×</option>
            <option value="shooter">Shooter pays all</option>
          </select>
        </label>
        <div className="field">
          <span>Seats and first dealer</span>
          <SeatArranger value={seating} onChange={setSeats} members={members} />
        </div>
        <label className="check">
          <input type="checkbox" checked={form.drawRotates} onChange={set('drawRotates')} />
          <span>Pass the deal on after a drawn hand (otherwise the dealer stays)</span>
        </label>

        <details className="ai-box">
          <summary>Instant payouts (kongs, animals)</summary>
          <p className="muted small">In base units: each other player pays this × the base score straight away.</p>
          <div className="grid2">
            {INSTANT_FIELDS.map(([key, label]) => (
              <label key={key}>
                {label}
                <input type="number" step="0.5" min="0" max="100" value={form[key]} onChange={set(key)} required />
              </label>
            ))}
          </div>
        </details>

        {preview.length > 0 && (
          <table className="table small">
            <thead><tr><th>Tai</th><th>1 unit</th><th>Self-drawn (each pays)</th></tr></thead>
            <tbody>
              {preview.map((p) => (
                <tr key={p.tai}><td>{p.tai}</td><td>{p.unit.toFixed(2)}</td><td>{(2 * p.unit).toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <button disabled={playerCount < 2}>Start game ({playerCount} players)</button>
      </form>
    </section>
  );
}
