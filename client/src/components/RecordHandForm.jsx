import { useState } from 'react';
import { api } from '../api.js';

export default function RecordHandForm({ lobby, onRecord }) {
  const [winnerId, setWinnerId] = useState('');
  const [discarderId, setDiscarderId] = useState(''); // '' = self-drawn
  const [tai, setTai] = useState(String(lobby.settings.minTai || 1));
  const [note, setNote] = useState('');

  // AI tai helper
  const [description, setDescription] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    try {
      await onRecord({ winnerId: Number(winnerId), discarderId: discarderId ? Number(discarderId) : null, tai: Number(tai), note });
      setWinnerId('');
      setDiscarderId('');
      setNote('');
      setDescription('');
      setAiResult(null);
    } catch {
      /* error shown by parent */
    }
  }

  async function askAi() {
    setAiBusy(true);
    setAiError('');
    try {
      const r = await api.suggestTai(description);
      setAiResult(r);
      if (r.tai != null) setTai(String(Math.min(r.tai, lobby.settings.taiCap)));
      if (!note) setNote(r.breakdown.map((b) => b.item).join(', ').slice(0, 200));
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Record a hand</h2>
      <form onSubmit={onSubmit} className="stack">
        <div className="grid2">
          <label>
            Winner
            <select value={winnerId} onChange={(e) => setWinnerId(e.target.value)} required>
              <option value="">Choose…</option>
              {lobby.members.map((m) => <option key={m.id} value={m.id}>{m.username}</option>)}
            </select>
          </label>
          <label>
            Paid by
            <select value={discarderId} onChange={(e) => setDiscarderId(e.target.value)}>
              <option value="">Self-drawn (everyone pays)</option>
              {lobby.members.filter((m) => String(m.id) !== winnerId).map((m) => (
                <option key={m.id} value={m.id}>Discard by {m.username}</option>
              ))}
            </select>
          </label>
          <label>
            Tai
            <input type="number" min={lobby.settings.minTai} value={tai} onChange={(e) => setTai(e.target.value)} required />
          </label>
          <label>
            Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </label>
        </div>

        <details className="ai-box">
          <summary>✨ Not sure of the tai? Ask the AI</summary>
          <div className="stack">
            <textarea
              rows={3}
              placeholder="e.g. All pongs, pong of red dragon, my seat flower, half colour bamboo"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <button type="button" className="btn-secondary" onClick={askAi} disabled={aiBusy || !description.trim()}>
              {aiBusy ? 'Thinking…' : 'Suggest tai'}
            </button>
            {aiError && <p className="error">{aiError}</p>}
            {aiResult && (
              <div className="small">
                <strong>Suggested: {aiResult.tai ?? '?'} tai</strong>
                <ul>{aiResult.breakdown.map((b, i) => <li key={i}>{b.item}: {b.tai}</li>)}</ul>
                {aiResult.notes && <p className="muted">{aiResult.notes}</p>}
                <p className="muted">AI suggestions can be wrong – check before saving.</p>
              </div>
            )}
          </div>
        </details>

        <button>Save hand</button>
      </form>
    </section>
  );
}
