import { useState } from 'react';
import { api } from '../api.js';

export default function AiSummary({ lobbyId }) {
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    setError('');
    try {
      setSummary((await api.gameSummary(lobbyId)).summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>AI recap</h2>
      <button className="btn-secondary" onClick={onClick} disabled={busy}>{busy ? 'Writing…' : '✨ Summarise the game'}</button>
      {error && <p className="error">{error}</p>}
      {summary && <p className="summary">{summary}</p>}
    </section>
  );
}
