import { useState } from 'react';
import TableView from './TableView.jsx';
import { WINDS, seatWindsFor, swapSeats } from '../lib/seats.js';

/**
 * Arrange the table: who sits where, who deals, and the round wind.
 * Tap two players to swap seats. Tap one player, then "Make dealer".
 * Used at game setup and for mid-game fixes.
 *
 * @param {{seatOrder:number[], dealerId:number, roundWind:number}} value roundWind: 0 East ... 3 North
 * @param {(value) => void} onChange
 * @param {{id:number, username:string}[]} members
 */
export default function SeatArranger({ value, onChange, members }) {
  const [selected, setSelected] = useState(null);
  const nameOf = Object.fromEntries(members.map((m) => [m.id, m.username]));
  const { seatOrder, dealerId, roundWind } = value;

  function tapSeat(id) {
    if (selected == null) setSelected(id);
    else if (selected === id) setSelected(null);
    else {
      onChange({ ...value, seatOrder: swapSeats(seatOrder, selected, id) });
      setSelected(null);
    }
  }

  return (
    <div className="stack seat-arranger">
      <p className="muted small">
        {selected == null
          ? 'Tap two players to swap their seats. Tap one player to make them dealer.'
          : `Tap another seat to swap with ${nameOf[selected]}, or:`}
      </p>
      {selected != null && (
        <div className="chips">
          <button
            type="button"
            className="chip"
            onClick={() => {
              onChange({ ...value, dealerId: selected });
              setSelected(null);
            }}
            disabled={selected === dealerId}
          >
            Make {nameOf[selected]} dealer
          </button>
          <button type="button" className="chip" onClick={() => setSelected(null)}>
            Cancel
          </button>
        </div>
      )}
      <TableView
        label="Seating: tap two players to swap seats"
        seatOrder={seatOrder}
        nameOf={nameOf}
        seatWinds={seatWindsFor(seatOrder, dealerId)}
        dealerId={dealerId}
        roundWind={WINDS[roundWind]}
        marks={selected != null ? { [selected]: 'selected' } : {}}
        onSeat={tapSeat}
        onCenter={() => onChange({ ...value, roundWind: (roundWind + 1) % WINDS.length })}
        centerHint="Tap to change"
      />
      <div className="field">
        <span>Round wind</span>
        <div className="chips">
          {WINDS.map((w, i) => (
            <button type="button" key={w} className={`chip ${roundWind === i ? 'on' : ''}`} onClick={() => onChange({ ...value, roundWind: i })}>
              {w}
            </button>
          ))}
        </div>
      </div>
      <p className="muted tiny">
        Turn order: {seatOrder.map((id) => nameOf[id]).join(' → ')} → back to {nameOf[seatOrder[0]]}.
      </p>
    </div>
  );
}
