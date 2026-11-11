import { WINDS, WIND_CHARS } from '../lib/seats.js';

// How far through the game the table is: one slot per dealer turn (players × 4 rounds), grouped
// by round. Dots show how many hands were played in a slot (more than one = the dealer kept the deal).
export default function ProgressStrip({ table, hands }) {
  const { totalSlots, slot, gameComplete } = table;
  const perRound = totalSlots / WINDS.length;
  const played = new Array(totalSlots).fill(0);
  for (const h of hands) if ((h.kind === 'win' || h.kind === 'draw') && h.slot != null) played[h.slot] += 1;

  const label = gameComplete ? 'All four rounds played' : `${table.roundWind} round, deal ${(slot % perRound) + 1} of ${perRound}`;
  return (
    <div className="progress" role="img" aria-label={`Game progress: ${label}`}>
      {WINDS.map((wind, r) => (
        <div key={wind} className="progress-round">
          <span className="wind-char">{WIND_CHARS[wind]}</span>
          {Array.from({ length: perRound }, (_, k) => {
            const i = r * perRound + k;
            const state = gameComplete || i < slot ? 'done' : i === slot ? 'now' : 'todo';
            const count = played[i];
            return (
              <span key={i} className={`slot ${state}`} title={`${wind} round, deal ${k + 1}: ${count} ${count === 1 ? 'hand' : 'hands'}`}>
                {'•'.repeat(Math.min(count, 3))}
                {count > 3 ? '+' : ''}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
