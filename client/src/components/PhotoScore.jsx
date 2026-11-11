import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { analyseHand } from '../lib/handAnalysis.js';
import { TILE_GROUPS, maxCopies, tileKind, tileLabel } from '../lib/tiles.js';
import TaiCalculator from './TaiCalculator.jsx';

const MAX_SIDE = 1600; // px; big enough to read tiles, small enough to upload quickly

/** Shrink the photo and turn it into a JPEG data URL. The photo never leaves the page except for this request. */
async function photoToDataUrl(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.85);
}

function describeSet(s) {
  if (s.type === 'chow') {
    const [suit, rank] = [s.tile[0], Number(s.tile[1])];
    return `${rank}-${rank + 1}-${rank + 2} ${tileLabel(`${suit}${rank}`).split(' ')[1]}`;
  }
  return `${s.type === 'kong' ? '4' : '3'}× ${tileLabel(s.tile)}`;
}

/**
 * Take a photo of the winning hand -> the AI reads the tiles -> the player fixes any wrong tile ->
 * the app works out the tai with fixed rules (handAnalysis.js) and fills in the tai calculator.
 */
export default function PhotoScore({ taiCap, seatWind, roundWind, onUse }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [tiles, setTiles] = useState(null);
  const [unsure, setUnsure] = useState(new Set());
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState(null); // tile index, 'add', or null

  const analysis = useMemo(
    () => (tiles?.length ? analyseHand({ tiles, seatWind, roundWind, taiCap }) : null),
    [tiles, seatWind, roundWind, taiCap],
  );

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    setTiles(null);
    setEditing(null);
    try {
      const image = await photoToDataUrl(file);
      setPreview(image);
      const r = await api.readTiles(image);
      setTiles(r.tiles);
      setUnsure(new Set(r.unsure));
      setNotes([r.notes, r.dropped?.length ? `Ignored ${r.dropped.length} unreadable tile(s).` : ''].filter(Boolean).join(' '));
      if (!r.tiles.length) setError('No tiles found. Try again with the tiles face up, close together and well lit.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function pick(tile) {
    if (editing === 'add') setTiles((t) => [...t, tile]);
    else {
      setTiles((t) => t.map((x, i) => (i === editing ? tile : x)));
      setUnsure((u) => new Set([...u].filter((i) => i !== editing)));
    }
    setEditing(null);
  }

  function remove() {
    setTiles((t) => t.filter((_, i) => i !== editing));
    // Positions after the removed tile move down by one.
    setUnsure((u) => new Set([...u].filter((i) => i !== editing).map((i) => (i > editing ? i - 1 : i))));
    setEditing(null);
  }

  const count = (tile) => tiles?.filter((t) => t === tile).length ?? 0;
  const canPick = (tile) => count(tile) < maxCopies(tile) || (editing !== 'add' && tiles[editing] === tile);

  return (
    <details className="ai-box" open={Boolean(tiles) || busy || undefined}>
      <summary>📷 Score from a photo</summary>
      <div className="stack">
        <p className="muted small">Lay the winning hand face up, with flowers and animals, and take one photo.</p>
        <div className="row wrap">
          <label className={`btn-file ${busy ? 'disabled' : ''}`}>
            📷 Take photo
            <input type="file" accept="image/*" capture="environment" onChange={onFile} disabled={busy} hidden />
          </label>
          <label className={`btn-file secondary ${busy ? 'disabled' : ''}`}>
            Choose photo
            <input type="file" accept="image/*" onChange={onFile} disabled={busy} hidden />
          </label>
        </div>
        {busy && <p className="muted small">Reading tiles… (about 5 seconds)</p>}
        {error && <p className="error">{error}</p>}

        {tiles && tiles.length > 0 && (
          <>
            {preview && <img className="photo-preview" src={preview} alt="Your photo" />}
            <div className="field">
              <span>
                Tiles found ({tiles.length}). <strong>Tap a tile to fix it.</strong>
                {unsure.size > 0 && ' Dashed tiles were hard to read.'}
              </span>
              <div className="chips">
                {tiles.map((t, i) => (
                  <button
                    type="button"
                    key={`${i}-${t}`}
                    className={`tile-chip ${tileKind(t)} ${unsure.has(i) ? 'unsure' : ''} ${editing === i ? 'on' : ''}`}
                    onClick={() => setEditing(editing === i ? null : i)}
                  >
                    {tileLabel(t)}
                  </button>
                ))}
                <button type="button" className={`tile-chip add ${editing === 'add' ? 'on' : ''}`} onClick={() => setEditing(editing === 'add' ? null : 'add')}>
                  + Add tile
                </button>
              </div>
            </div>

            {editing !== null && (
              <div className="tile-palette stack">
                <div className="row between">
                  <strong className="small">{editing === 'add' ? 'Add a tile' : `Change ${tileLabel(tiles[editing])} to…`}</strong>
                  <div className="row">
                    {editing !== 'add' && (
                      <button type="button" className="btn-secondary small" onClick={remove}>
                        Remove
                      </button>
                    )}
                    <button type="button" className="btn-secondary small" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
                {TILE_GROUPS.map((g) => (
                  <div key={g.label} className="field">
                    <span className="muted small">{g.label}</span>
                    <div className="chips">
                      {g.tiles.map((t) => (
                        <button type="button" key={t} className={`tile-chip ${tileKind(t)}`} disabled={!canPick(t)} onClick={() => pick(t)}>
                          {tileLabel(t)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {analysis && (
              <div className="stack">
                {analysis.status === 'ok' ? (
                  <p className="small">
                    Read as: {analysis.sets.map(describeSet).join(' · ')}
                    {analysis.pair ? ` · pair of ${tileLabel(analysis.pair)}` : ''}
                  </p>
                ) : null}
                {[...analysis.notes, notes].filter(Boolean).map((n) => (
                  <p key={n} className={`small ${analysis.status === 'ok' ? 'muted' : 'warn'}`}>
                    {n}
                  </p>
                ))}
                <p className="muted small">
                  Patterns found are ticked below. Tick anything a photo can't show (e.g. won on the last tile), then use the tai.
                </p>
                <TaiCalculator
                  key={`${JSON.stringify(analysis.selection)}-${seatWind}-${roundWind}`}
                  taiCap={taiCap}
                  seatWind={seatWind}
                  roundWind={roundWind}
                  initialSelection={analysis.selection}
                  onUse={onUse}
                />
              </div>
            )}
          </>
        )}
        <p className="muted small">The photo is only used to read the tiles. It isn't saved.</p>
      </div>
    </details>
  );
}
