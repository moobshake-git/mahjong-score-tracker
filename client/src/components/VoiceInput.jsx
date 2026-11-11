import { useState } from 'react';
import { api } from '../api.js';
import useSpeechRecognition from '../useSpeechRecognition.js';

/**
 * Say (or type) a hand like "Alice won 3 tai from Bob, shooter pay".
 * The text is turned into a hand on the server and passed to onParsed() to fill in the form.
 * It never saves by itself - the player checks the form and presses Save.
 */
export default function VoiceInput({ lobbyId, onParsed }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function parse(text) {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.parseHand(lobbyId, text);
      setResult(r);
      onParsed(r.hand);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const speech = useSpeechRecognition({ onFinal: parse });

  return (
    <div className="voice-box stack">
      <div className="row wrap">
        {speech.supported && (
          <button
            type="button"
            className={speech.listening ? 'btn-danger' : ''}
            onClick={speech.listening ? speech.stop : speech.start}
            aria-pressed={speech.listening}
          >
            {speech.listening ? '■ Stop' : '🎤 Speak hand'}
          </button>
        )}
        <span className="muted small">
          {speech.listening
            ? 'Listening…'
            : 'e.g. "Alice won 3 tai from Bob", "Bob zimo 2 tai", "Carol 4 tai, Dave shoot, shooter pay"'}
        </span>
      </div>
      <div className="row">
        <input
          aria-label="What was said"
          placeholder={speech.supported ? 'Or type it here' : 'Type it here (voice not supported in this browser)'}
          value={speech.transcript}
          onChange={(e) => speech.setTranscript(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              parse(speech.transcript);
            }
          }}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn-secondary" disabled={busy || !speech.transcript.trim()} onClick={() => parse(speech.transcript)}>
          {busy ? '…' : 'Fill in'}
        </button>
      </div>
      {speech.error && <p className="error small">{speech.error}</p>}
      {error && <p className="error small">{error}</p>}
      {result && (
        <p className="small muted">
          Filled in from “{result.transcript}” ({result.source === 'ai' ? 'AI' : 'basic matching'}).{' '}
          {result.hand.missing.length > 0 ? (
            <strong className="warn">Couldn't work out: {result.hand.missing.join(', ')} – please pick below.</strong>
          ) : (
            'Check it, then press Save.'
          )}
        </p>
      )}
    </div>
  );
}
