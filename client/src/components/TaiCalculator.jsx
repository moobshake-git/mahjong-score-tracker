import { useState } from 'react';
import { TAI_ITEMS, SEAT_NUMBER, countTai, toggleItem, describe } from '../lib/taiRules.js';

// Tick the patterns in the winning hand; the tai is added up and capped for you.
// Seat and round wind come from the table state, so the labels say which wind counts.
// `initialSelection` pre-ticks patterns (e.g. from a photo); remount with a new key to apply a new one.
export default function TaiCalculator({ taiCap, seatWind, roundWind, onUse, initialSelection }) {
  const [selection, setSelection] = useState(initialSelection ?? {});
  const result = countTai(selection, taiCap);
  const set = (id, value) => setSelection((s) => toggleItem(s, id, value));

  const hintText = (item) => {
    if (item.hint === 'seat' && seatWind) return ` (${seatWind})`;
    if (item.hint === 'round' && roundWind) return ` (${roundWind})`;
    if (item.hint === 'seatNumber' && seatWind) return ` (number ${SEAT_NUMBER[seatWind]})`;
    return '';
  };

  return (
    <div className="stack tai-calc">
      {TAI_ITEMS.map((item) =>
        item.type === 'check' ? (
          <label key={item.id} className="check">
            <input type="checkbox" checked={Boolean(selection[item.id])} onChange={(e) => set(item.id, e.target.checked)} />
            <span>
              {item.label}
              {hintText(item)}
            </span>
            <span className="muted small">{item.limit ? 'max' : `+${item.tai}`}</span>
          </label>
        ) : (
          <div key={item.id} className="check">
            <span className="grow">
              {item.label}
              {hintText(item)}
            </span>
            <div className="chips">
              {Array.from({ length: item.max + 1 }, (_, n) => (
                <button
                  type="button"
                  key={n}
                  className={`chip ${(selection[item.id] || 0) === n ? 'on' : ''}`}
                  onClick={() => set(item.id, n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ),
      )}
      <div className="row between">
        <strong>
          {result.tai} tai{result.capped ? ' (cap)' : ''}
        </strong>
        <button type="button" onClick={() => onUse(result.tai, describe(result))} disabled={result.tai === 0}>
          Use {result.tai} tai
        </button>
      </div>
    </div>
  );
}
