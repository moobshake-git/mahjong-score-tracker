import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import ErrorText from '../components/ErrorText.jsx';
import usePolling from '../usePolling.js';

export default function LobbiesPage() {
  const navigate = useNavigate();
  const [lobbies, setLobbies] = useState([]);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [joinPasswords, setJoinPasswords] = useState({});

  const load = useCallback(() => api.listLobbies().then((d) => setLobbies(d.lobbies)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  usePolling(load, 5000);

  async function onCreate(e) {
    e.preventDefault();
    setError('');
    try {
      const { lobby } = await api.createLobby(name.trim(), password);
      navigate(`/lobbies/${lobby.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onJoin(lobby) {
    setError('');
    try {
      if (!lobby.isMember) await api.joinLobby(lobby.id, joinPasswords[lobby.id] || '');
      navigate(`/lobbies/${lobby.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>Create a lobby</h2>
        <form onSubmit={onCreate} className="row wrap">
          <input placeholder="Lobby name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
          <input type="password" placeholder="Password (optional)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button>Create</button>
        </form>
      </section>

      <ErrorText error={error} />

      <section className="card">
        <h2>Lobbies</h2>
        {lobbies.length === 0 && <p className="muted">No lobbies yet. Create one above.</p>}
        <ul className="list">
          {lobbies.map((l) => (
            <li key={l.id} className="row wrap between">
              <div>
                <strong>{l.hasPassword ? '🔒 ' : ''}{l.name}</strong>
                <div className="muted small">
                  Host {l.host} · {l.memberCount}/{l.maxPlayers} players · {l.status}
                </div>
              </div>
              <div className="row">
                {!l.isMember && l.hasPassword && l.status === 'waiting' && (
                  <input
                    type="password"
                    placeholder="Lobby password"
                    value={joinPasswords[l.id] || ''}
                    onChange={(e) => setJoinPasswords({ ...joinPasswords, [l.id]: e.target.value })}
                  />
                )}
                {l.isMember ? (
                  <button onClick={() => onJoin(l)}>Open</button>
                ) : (
                  <button onClick={() => onJoin(l)} disabled={l.status !== 'waiting' || l.memberCount >= l.maxPlayers}>
                    Join
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
