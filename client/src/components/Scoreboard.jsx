export default function Scoreboard({ lobby }) {
  const rows = [...lobby.members].sort((a, b) => (lobby.totals[b.id] ?? 0) - (lobby.totals[a.id] ?? 0));
  const { table } = lobby;
  const dealerName = table && lobby.members.find((m) => m.id === table.dealerId)?.username;
  return (
    <section className="card">
      <div className="row between wrap">
        <h2>Scores</h2>
        {table && lobby.status === 'playing' && (
          <span className="muted small">
            {table.gameComplete ? 'All four rounds played' : `${table.roundWind} round`} · {dealerName} dealing
            {table.dealerHand > 1 ? ` (×${table.dealerHand})` : ''}
          </span>
        )}
      </div>
      <table className="table">
        <tbody>
          {rows.map((m) => {
            const v = lobby.totals[m.id] ?? 0;
            const wind = table?.seatWinds?.[m.id];
            return (
              <tr key={m.id}>
                <td>
                  {wind && <span className={`wind ${table.dealerId === m.id ? 'dealer' : ''}`} title={`${wind} seat`}>{wind[0]}</span>}
                  {m.username}
                </td>
                <td className={`num ${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}`}>{v > 0 ? '+' : ''}{v.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
