import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import ErrorText from '../components/ErrorText.jsx';

// Opened from a lobby's QR code / share link: /join/:id/:code
export default function JoinPage() {
  const { id, code } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const started = useRef(false); // StrictMode runs effects twice in dev

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api
      .joinLobby(id, undefined, code)
      .then(() => navigate(`/lobbies/${id}`, { replace: true }))
      .catch((e) => setError(e.message));
  }, [id, code, navigate]);

  return (
    <section className="card narrow stack">
      {error ? (
        <>
          <ErrorText error={error} />
          <Link to="/">Back to lobbies</Link>
        </>
      ) : (
        <p className="center muted">Joining lobby…</p>
      )}
    </section>
  );
}
