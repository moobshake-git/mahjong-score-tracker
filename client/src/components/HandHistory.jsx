export default function HandHistory({ lobby, nameOf }) {
  if (lobby.hands.length === 0) return null;
  return (
    <section className="card">
      <h2>Hands</h2>
      <ol className="list small">
        {[...lobby.hands].reverse().map((h) => (
          <li key={h.id}>
            <strong>{nameOf(h.winnerId)}</strong> won {h.tai} tai{' '}
            {h.discarderId ? <>off <strong>{nameOf(h.discarderId)}</strong></> : '(self-drawn)'}
            {h.note && <span className="muted"> – {h.note}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
