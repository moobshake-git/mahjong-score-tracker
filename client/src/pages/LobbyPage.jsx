import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import ErrorText from '../components/ErrorText.jsx';
import GameSetupForm from '../components/GameSetupForm.jsx';
import RecordHandForm from '../components/RecordHandForm.jsx';
import Scoreboard from '../components/Scoreboard.jsx';
import HandHistory from '../components/HandHistory.jsx';
import AiSummary from '../components/AiSummary.jsx';
import InviteCard from '../components/InviteCard.jsx';
import SettleUp from '../components/SettleUp.jsx';
import ScoreChart from '../components/ScoreChart.jsx';
import TableFixCard from '../components/TableFixCard.jsx';
import usePolling from '../usePolling.js';

export default function LobbyPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(
    () => api.getLobby(id).then((d) => setLobby(d.lobby)).catch((e) => setError(e.message)),
    [id],
  );
  useEffect(() => { load(); }, [load]);
  usePolling(load, 3000);

  // Wraps an API call that returns { lobby } and updates the page.
  const act = (fn) => async (...args) => {
    setError('');
    try {
      const d = await fn(...args);
      if (d?.lobby) setLobby(d.lobby);
      return d;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  if (!lobby) return error ? <ErrorText error={error} /> : <p className="center muted">Loading…</p>;

  const isHost = lobby.hostId === user.id;
  const lastEntry = lobby.hands.at(-1);
  const canUndo = Boolean(lastEntry) && (isHost || lastEntry.recordedBy === user.id);
  const nameOf = (pid) => lobby.members.find((m) => m.id === pid)?.username ?? '?';

  async function onLeave() {
    await act(() => api.leaveLobby(lobby.id))();
    navigate('/');
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="row between wrap">
          <h1>{lobby.hasPassword ? '🔒 ' : ''}{lobby.name}</h1>
          <span className={`badge ${lobby.status}`}>{lobby.status}</span>
        </div>
        <p className="muted small">
          Players: {lobby.members.map((m) => m.username + (m.id === lobby.hostId ? ' (host)' : '')).join(', ')}
        </p>
        {lobby.settings && (
          <p className="muted small">
            Base {lobby.settings.baseScore} · ×{lobby.settings.multiplier} per tai · {lobby.settings.minTai}–{lobby.settings.taiCap} tai ·{' '}
            default: {lobby.settings.payoutMode === 'shooter' ? 'shooter pays all' : 'normal payout'}
          </p>
        )}
        {lobby.status !== 'playing' && <button className="btn-secondary" onClick={onLeave}>Leave lobby</button>}
      </section>

      <ErrorText error={error} />

      {lobby.status === 'waiting' && lobby.members.length < 4 && <InviteCard lobby={lobby} />}

      {lobby.status === 'waiting' &&
        (isHost ? (
          <GameSetupForm members={lobby.members} onStart={act((settings) => api.startGame(lobby.id, settings))} />
        ) : (
          <section className="card"><p className="muted">Waiting for the host to set the base score and start the game…</p></section>
        ))}

      {lobby.status !== 'waiting' && <Scoreboard lobby={lobby} />}

      {lobby.status !== 'waiting' && <SettleUp lobby={lobby} nameOf={nameOf} />}

      {lobby.status === 'playing' && (
        <RecordHandForm lobby={lobby} onRecord={act((hand) => api.recordHand(lobby.id, hand))} />
      )}

      {lobby.status !== 'waiting' && <ScoreChart lobby={lobby} nameOf={nameOf} />}

      {lobby.status !== 'waiting' && (
        <HandHistory lobby={lobby} nameOf={nameOf} />
      )}

      {lobby.status === 'playing' && isHost && lobby.table && (
        <TableFixCard
          lobby={lobby}
          onSave={act((t) => api.fixTable(lobby.id, t))}
          onUndo={act(() => api.undoTableFix(lobby.id))}
        />
      )}

      {lobby.status === 'playing' && (isHost || canUndo) && (
        <section className="card row wrap">
          {/* The host can always undo; anyone can undo an entry they recorded themselves (fixing a mis-tap). */}
          <button className="btn-secondary" onClick={act(() => api.undoHand(lobby.id))} disabled={!canUndo}>
            Undo last entry
          </button>
          {isHost && (
            <button
              className="btn-danger"
              onClick={() => window.confirm('End the game? No more hands can be recorded.') && act(() => api.finishGame(lobby.id))()}
            >
              Finish game
            </button>
          )}
        </section>
      )}

      {lobby.status !== 'waiting' && lobby.hands.length > 0 && <AiSummary lobbyId={lobby.id} />}
    </div>
  );
}
