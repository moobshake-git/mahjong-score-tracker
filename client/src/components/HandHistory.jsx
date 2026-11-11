const PAYOUT_LABELS = {
  kong_concealed: 'concealed kong',
  kong_exposed: 'exposed kong',
  animal_pair: 'animal pair',
  bonus_set: 'full bonus set',
};

function describe(h, nameOf, payoutMode) {
  const who = <strong>{nameOf(h.winnerId)}</strong>;
  if (h.kind === 'draw') return <>Drawn hand (no winner)</>;
  if (PAYOUT_LABELS[h.kind]) {
    return (
      <>
        {who} got paid for a {PAYOUT_LABELS[h.kind]}
        {h.discarderId ? <> (from <strong>{nameOf(h.discarderId)}</strong>'s discard)</> : null}
      </>
    );
  }
  return (
    <>
      {who} won {h.tai} tai {h.discarderId ? <>off <strong>{nameOf(h.discarderId)}</strong></> : '(self-drawn)'}
      {h.discarderId && (h.payoutMode ?? payoutMode) === 'shooter' && <span className="tag">shooter pays</span>}
    </>
  );
}

export default function HandHistory({ lobby, nameOf }) {
  if (lobby.hands.length === 0) return null;
  return (
    <section className="card">
      <h2>Hands</h2>
      <ol className="list small">
        {[...lobby.hands].reverse().map((h) => (
          <li key={h.id}>
            {describe(h, nameOf, lobby.settings.payoutMode)}
            {h.note && <span className="muted"> – {h.note}</span>}
            <div className="muted tiny">
              {h.roundWind} round · {nameOf(h.dealerId)} dealing · recorded by {nameOf(h.recordedBy)}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
