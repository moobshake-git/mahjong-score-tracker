import { useEffect, useRef, useState } from 'react';

// Running total for each player after every entry. Plain SVG (no chart library) so it follows the
// app's light/dark colours. Each player has a colour and a dash pattern, so it doesn't rely on colour alone.

const H = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 44 };
const DASHES = ['', '7 4', '2 4', '10 3 2 3'];

export default function ScoreChart({ lobby, nameOf }) {
  if (lobby.hands.length === 0) return null;
  return <Chart lobby={lobby} nameOf={nameOf} />;
}

function Chart({ lobby, nameOf }) {
  const [hover, setHover] = useState(null);
  // Draw at the real on-screen width (1 unit = 1 px) so text stays readable on phones.
  const boxRef = useRef(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ids = lobby.table?.seatOrder ?? lobby.members.map((m) => m.id);

  // Series: one point per entry, starting at 0.
  const series = Object.fromEntries(ids.map((id) => [id, [0]]));
  for (const h of lobby.hands) for (const id of ids) series[id].push(Math.round((series[id].at(-1) + (h.deltas?.[id] ?? 0)) * 100) / 100);
  const n = lobby.hands.length;
  const all = ids.flatMap((id) => series[id]);
  let lo = Math.min(0, ...all);
  let hi = Math.max(0, ...all);
  if (hi - lo < 0.01) hi = lo + 1;
  const span = hi - lo;
  lo -= span * 0.05;
  hi += span * 0.05;

  const x = (i) => PAD.left + (i / Math.max(n, 1)) * (W - PAD.left - PAD.right);
  const y = (v) => PAD.top + ((hi - v) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  // About 3-5 gridlines at tidy values (0.5, 1, 2, 2.5, 5 x a power of ten).
  const raw = (hi - lo) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((v) => v >= raw);
  const ticks = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 1000) / 1000);

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * n);
    setHover(Math.max(0, Math.min(n, i)));
  }

  return (
    <section className="card" ref={boxRef}>
      <h2>Score over time</h2>
      <div className="chart-legend">
        {ids.map((id, k) => (
          <span key={id}>
            <svg width="22" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="21" y2="5" className={`series-${k + 1}`} strokeDasharray={DASHES[k]} />
            </svg>
            {nameOf(id)} {(hover != null ? series[id][hover] : series[id].at(-1)).toFixed(2)}
          </span>
        ))}
        {hover != null && <span className="muted">{hover === 0 ? 'start' : `after entry ${hover}`}</span>}
      </div>
      <svg
        className="score-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Running totals over ${n} entries. ${ids.map((id) => `${nameOf(id)} ${series[id].at(-1).toFixed(2)}`).join(', ')}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="axis" x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle">
              {step < 0.1 ? t.toFixed(2) : t.toFixed(1)}
            </text>
          </g>
        ))}
        <line className="zero" x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} />
        <text className="axis" x={x(0)} y={H - 6} textAnchor="start">start</text>
        <text className="axis" x={x(n)} y={H - 6} textAnchor="end">{n} {n === 1 ? 'entry' : 'entries'}</text>
        {hover != null && <line className="cursor" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} />}
        {ids.map((id, k) => (
          <g key={id} className={`series-${k + 1}`}>
            <polyline points={series[id].map((v, i) => `${x(i)},${y(v)}`).join(' ')} strokeDasharray={DASHES[k]} />
            <circle cx={x(hover ?? n)} cy={y(series[id][hover ?? n])} r="4" />
          </g>
        ))}
      </svg>
    </section>
  );
}
