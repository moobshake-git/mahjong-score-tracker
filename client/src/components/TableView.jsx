import { seatLayout, WIND_CHARS } from '../lib/seats.js';

// Bird's-eye view of the table: a seat on each side with the player's wind, name and score,
// and the round wind in the middle. Seats and the middle are buttons, so this works both for
// showing the table and for input (record a hand, arrange seats).
//
// Payment arrows (from each payer to the winner) are drawn from `flows`.

// Seat centres in the SVG's 300x300 coordinate space.
const POINTS = { bottom: [150, 262], right: [262, 150], top: [150, 38], left: [38, 150] };

function Arrow({ from, to, amount }) {
  const [x1, y1] = POINTS[from];
  const [x2, y2] = POINTS[to];
  // Start and end a little way in from the seats, and bend the line so arrows don't overlap.
  const sx = x1 + (x2 - x1) * 0.24;
  const sy = y1 + (y2 - y1) * 0.24;
  const ex = x2 - (x2 - x1) * 0.26;
  const ey = y2 - (y2 - y1) * 0.26;
  // Opposite seats bend a lot more, so the arrow goes round the centre circle instead of under it.
  const bend = x1 === x2 || y1 === y2 ? 0.3 : 0.14;
  const cx = (x1 + x2) / 2 + (y2 - y1) * bend;
  const cy = (y1 + y2) / 2 - (x2 - x1) * bend;
  // Point on the curve at t = 0.5, for the amount label.
  const lx = 0.25 * sx + 0.5 * cx + 0.25 * ex;
  const ly = 0.25 * sy + 0.5 * cy + 0.25 * ey;
  return (
    <g className="flow">
      <path d={`M${sx} ${sy} Q${cx} ${cy} ${ex} ${ey}`} markerEnd="url(#flow-arrow)" />
      {amount != null && (
        <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle">
          {amount.toFixed(2)}
        </text>
      )}
    </g>
  );
}

/**
 * @param {object} props
 * @param {number[]} props.seatOrder player ids in turn order
 * @param {Record<number,string>} props.nameOf id -> display name
 * @param {Record<number,string>} props.seatWinds id -> 'East' | 'South' | ...
 * @param {number} props.dealerId
 * @param {string} props.roundWind
 * @param {Record<number,number>} [props.totals] id -> score (hidden if omitted)
 * @param {number|null} [props.anchorId] player shown at the bottom (null = first seat)
 * @param {Record<number,string>} [props.marks] id -> 'winner' | 'payer' | 'selected'
 * @param {{from:number, amount:number|null}[]} [props.flows] payment arrows into flowTo
 * @param {number|null} [props.flowTo]
 * @param {(id:number) => void} [props.onSeat]
 * @param {() => void} [props.onCenter]
 * @param {string} [props.centerHint] small text under the round wind
 * @param {string} props.label accessible name for the whole table
 */
export default function TableView({
  seatOrder,
  nameOf,
  seatWinds,
  dealerId,
  roundWind,
  totals,
  anchorId = null,
  marks = {},
  flows = [],
  flowTo = null,
  onSeat,
  onCenter,
  centerHint,
  label,
}) {
  const layout = seatLayout(seatOrder, anchorId);
  const posOf = Object.fromEntries(layout.map((s) => [s.id, s.position]));

  return (
    <div className="table-view" role="group" aria-label={label}>
      <svg viewBox="0 0 300 300" aria-hidden="true">
        <defs>
          <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path className="flow-head" d="M2 1L8 5L2 9" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        <rect className="felt" x="70" y="70" width="160" height="160" rx="14" />
      </svg>

      <button
        type="button"
        className="table-center"
        onClick={onCenter}
        disabled={!onCenter}
        aria-label={`${roundWind} round${centerHint ? `. ${centerHint}` : ''}`}
      >
        <span className="wind-char big">{WIND_CHARS[roundWind]}</span>
        <span className="tiny">{roundWind} round</span>
        {centerHint && <span className="tiny hint">{centerHint}</span>}
      </button>

      {layout.map(({ id, position }) => {
        const wind = seatWinds[id];
        const score = totals?.[id];
        const mark = marks[id];
        return (
          <button
            type="button"
            key={id}
            className={`seat seat-${position} ${mark ? `mark-${mark}` : ''} ${id === dealerId ? 'is-dealer' : ''}`}
            onClick={() => onSeat?.(id)}
            disabled={!onSeat}
            aria-pressed={Boolean(mark)}
            aria-label={`${nameOf[id]}, ${wind} seat${id === dealerId ? ', dealer' : ''}${score != null ? `, ${score.toFixed(2)}` : ''}`}
          >
            <span className="wind-char">{WIND_CHARS[wind]}</span>
            <span className="seat-text">
              <span className="seat-name">{nameOf[id]}</span>
              {score != null && (
                <span className={`seat-score ${score > 0 ? 'pos' : score < 0 ? 'neg' : ''}`}>
                  {score > 0 ? '+' : ''}
                  {score.toFixed(2)}
                </span>
              )}
            </span>
            {id === dealerId && <span className="dealer-pill">Dealer</span>}
          </button>
        );
      })}

      {/* Payment arrows sit above the seats and centre (taps pass through) so labels are never hidden. */}
      <svg className="flows" viewBox="0 0 300 300" aria-hidden="true">
        {flowTo != null &&
          flows.map((f) => <Arrow key={f.from} from={posOf[f.from]} to={posOf[flowTo]} amount={f.amount} />)}
      </svg>
    </div>
  );
}
