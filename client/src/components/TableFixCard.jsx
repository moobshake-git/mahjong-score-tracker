import { useState } from 'react';
import SeatArranger from './SeatArranger.jsx';
import { WINDS } from '../lib/seats.js';

// Host only: fix the seating, dealer or round wind mid-game (people sat in a different order,
// the app joined a game in progress, ...). Takes effect from now; earlier hands keep their winds.
export default function TableFixCard({ lobby, onSave, onUndo }) {
  const { table } = lobby;
  const current = { seatOrder: table.seatOrder, dealerId: table.dealerId, roundWind: WINDS.indexOf(table.roundWind) };
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current);

  function toggle(e) {
    const isOpen = e.currentTarget.open;
    setOpen(isOpen);
    if (isOpen) setValue(current); // start from the live table each time
  }

  const changed =
    value.dealerId !== current.dealerId ||
    value.roundWind !== current.roundWind ||
    value.seatOrder.some((id, i) => id !== current.seatOrder[i]);

  return (
    <section className="card">
      <details onToggle={toggle}>
        <summary className="summary-heading">Fix seats, dealer or round wind</summary>
        {open && (
          <div className="stack" style={{ marginTop: 12 }}>
            <p className="muted small">Changes apply from the next hand. Hands already recorded keep their dealer and winds.</p>
            <SeatArranger value={value} onChange={setValue} members={lobby.members} />
            <div className="row wrap">
              <button type="button" disabled={!changed} onClick={() => onSave(value).catch(() => {})}>
                Save table
              </button>
              {table.adjustments > 0 && (
                <button type="button" className="btn-secondary" onClick={() => onUndo().catch(() => {})}>
                  Undo last fix
                </button>
              )}
            </div>
          </div>
        )}
      </details>
    </section>
  );
}
