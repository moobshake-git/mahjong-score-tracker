import { useState } from 'react';

const DEFAULTS = { baseScore: '0.10', multiplier: '2', minTai: '1', taiCap: '5', payoutMode: 'standard' };

// Host enters base score and multiplier (and a few house rules) before the game starts.
export default function GameSetupForm({ playerCount, onStart }) {
  const [form, setForm] = useState(DEFAULTS);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

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
