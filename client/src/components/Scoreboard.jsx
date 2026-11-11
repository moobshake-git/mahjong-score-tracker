export default function Scoreboard({ lobby }) {
  const rows = [...lobby.members].sort((a, b) => (lobby.totals[b.id] ?? 0) - (lobby.totals[a.id] ?? 0));
  return (
    <section className="card">
      <h2>Scores</h2>
      <table className="table">
        <tbody>
          {rows.map((m) => {
            const v = lobby.totals[m.id] ?? 0;
            return (
              <tr key={m.id}>
                <td>{m.username}</td>
                <td className={`num ${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}`}>{v > 0 ? '+' : ''}{v.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
