import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import PhotoScore from './PhotoScore.jsx';
import TaiCalculator from './TaiCalculator.jsx';
import VoiceInput from './VoiceInput.jsx';
import TableView from './TableView.jsx';
import { previewWin } from '../lib/payments.js';

const PAYOUT_TYPES = [
  { kind: 'kong_concealed', key: 'kongConcealed', label: 'Concealed kong' },
  { kind: 'kong_exposed', key: 'kongExposed', label: 'Exposed kong' },
  { kind: 'animal_pair', key: 'animalPair', label: 'Animal pair' },
  { kind: 'bonus_set', key: 'bonusSet', label: 'Full bonus set' },
];

/** A row of tap-to-pick buttons. `options` is [{ value, label }]. */
function Chips({ options, value, onChange }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          className={`chip ${value === o.value ? 'on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function RecordHandForm({ lobby, onRecord }) {
  const me = useAuth().user?.id;
  const { settings, members, table } = lobby;
  const [mode, setMode] = useState('win'); // 'win' | 'payout' | 'draw'
  const [winnerId, setWinnerId] = useState(null);
  const [discarderId, setDiscarderId] = useState(undefined); // undefined = not chosen yet, null = self-drawn
  const [tai, setTai] = useState(null);
  // 'standard' = normal payout, 'shooter' = shooter pays. Starts at the lobby default each hand.
  const [payoutMode, setPayoutMode] = useState(settings.payoutMode);
  const [payoutKind, setPayoutKind] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0); // bumps after each save so the voice box starts fresh

  // AI tai helper
  const [description, setDescription] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const nameOf = (id) => (id === me ? 'Me' : members.find((m) => m.id === id)?.username ?? '?');
  // Chips say "Me"; sentences (save button, payout hint) use the real name so they read correctly.
  const realName = (id) => members.find((m) => m.id === id)?.username ?? '?';
  const windOf = (id) => table?.seatWinds?.[id];
  const playerChips = (ids) => ids.map((id) => ({ value: id, label: `${nameOf(id)}${windOf(id) ? ` · ${windOf(id)[0]}` : ''}` }));
  const allIds = members.map((m) => m.id);
  const others = allIds.filter((id) => id !== winnerId);

  const taiOptions = [];
  for (let t = Math.max(1, settings.minTai); t <= settings.taiCap; t++) taiOptions.push({ value: t, label: String(t) });

  function reset() {
    setWinnerId(null);
    setDiscarderId(undefined);
    setTai(null);
    setPayoutMode(settings.payoutMode);
    setPayoutKind(null);
    setNote('');
    setDescription('');
    setAiResult(null);
  }

  // Table taps: first tap picks the winner, second picks who shot (tap the winner again to undo).
  // Once both are picked, tapping a seat starts again with that player as the winner.
  function tapSeat(id) {
    if (winnerId == null || discarderId !== undefined) {
      setWinnerId(id);
      setDiscarderId(undefined);
    } else if (id === winnerId) {
      setWinnerId(null);
    } else {
      setDiscarderId(id);
    }
  }

  function pickWinner(id) {
    setWinnerId(id);
    if (discarderId === id) setDiscarderId(undefined);
  }

  // Fill the form from what the player said (see VoiceInput). The player still checks it and presses Save.
  function onParsed(hand) {
    if (hand.winnerId) setWinnerId(hand.winnerId);
    if (hand.selfDrawn) setDiscarderId(null);
    else if (hand.discarderId && hand.discarderId !== hand.winnerId) setDiscarderId(hand.discarderId);
    if (hand.tai != null) setTai(Math.max(settings.minTai, Math.min(hand.tai, settings.taiCap)));
    setPayoutMode(hand.payoutMode || settings.payoutMode);
  }

  async function save(entry) {
    setBusy(true);
    try {
      await onRecord({ ...entry, note: note || undefined });
      reset();
      setSaved((n) => n + 1);
    } catch {
      /* error shown by parent */
    } finally {
      setBusy(false);
    }
  }

  async function askAi() {
    setAiBusy(true);
    setAiError('');
    try {
      const r = await api.suggestTai(description);
      setAiResult(r);
      if (r.tai != null) setTai(Math.max(settings.minTai, Math.min(r.tai, settings.taiCap)));
      if (!note) setNote(r.breakdown.map((b) => b.item).join(', ').slice(0, 200));
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiBusy(false);
    }
  }

  const payoutType = PAYOUT_TYPES.find((p) => p.kind === payoutKind);
  const each = payoutType ? settings.instantPayouts[payoutType.key] * settings.baseScore : 0;

  const winReady = winnerId != null && discarderId !== undefined && tai != null;
  const winSummary = winReady
    ? `${realName(winnerId)} won ${tai} tai ${discarderId == null ? '(self-drawn)' : `off ${realName(discarderId)}${payoutMode === 'shooter' ? ', shooter pays' : ''}`}`
    : 'Pick winner, who paid and tai';
  const payoutReady = payoutKind != null && winnerId != null;

  // Payment arrows on the table: shown once winner and payer are picked (amounts once tai is too).
  const seatOrder = table?.seatOrder ?? allIds;
  const flows =
    winnerId != null && discarderId !== undefined
      ? Object.entries(
          tai != null
            ? previewWin({ winnerId, discarderId, tai, payoutMode }, allIds, settings)
            : previewWin({ winnerId, discarderId, tai: settings.minTai || 1, payoutMode }, allIds, settings),
        )
          .filter(([, v]) => v < 0)
          .map(([id, v]) => ({ from: Number(id), amount: tai != null ? -v : null }))
      : [];
  const tablePrompt =
    winnerId == null
      ? "Tap the winner's seat"
      : discarderId === undefined
        ? `Who shot? Tap their seat, or the middle if ${realName(winnerId)} self-drew`
        : 'Tap a seat to start again';

  return (
    <section className="card">
      <div className="row between wrap">
        <h2>Record</h2>
        <div className="tabs">
          {[
            ['win', 'Win'],
            ['payout', 'Kong / bonus'],
            ['draw', 'Draw'],
          ].map(([m, label]) => (
            <button type="button" key={m} className={`tab ${mode === m ? 'on' : ''}`} onClick={() => { setMode(m); reset(); }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'win' && (
        <div className="stack">
          <VoiceInput key={saved} lobbyId={lobby.id} onParsed={onParsed} />
          <div className="field">
            <span>{tablePrompt}</span>
            <TableView
              label="Table: tap the winner, then who shot"
              seatOrder={seatOrder}
              nameOf={Object.fromEntries(allIds.map((id) => [id, nameOf(id)]))}
              seatWinds={table?.seatWinds ?? {}}
              dealerId={table?.dealerId}
              roundWind={table?.roundWind ?? 'East'}
              totals={lobby.totals}
              anchorId={me}
              marks={{
                ...(winnerId != null ? { [winnerId]: 'winner' } : {}),
                ...(discarderId != null ? { [discarderId]: 'payer' } : {}),
              }}
              flows={flows}
              flowTo={winnerId}
              onSeat={tapSeat}
              onCenter={winnerId != null ? () => setDiscarderId(null) : undefined}
              centerHint={winnerId != null && discarderId === undefined ? 'Tap for self-drawn' : discarderId === null ? 'Self-drawn' : undefined}
            />
            <div className="chips">
              <button type="button" className={`chip ${discarderId === null ? 'on' : ''}`} disabled={winnerId == null} onClick={() => setDiscarderId(null)}>
                Self-drawn
              </button>
              {winnerId != null && (
                <button type="button" className="chip" onClick={() => { setWinnerId(null); setDiscarderId(undefined); }}>
                  Clear
                </button>
              )}
            </div>
          </div>
          {discarderId != null && (
            <div className="field">
              <span>Payout for this hand</span>
              <Chips
                options={[
                  { value: 'standard', label: 'Normal (shooter 2×, others 1×)' },
                  { value: 'shooter', label: 'Shooter pays all' },
                ]}
                value={payoutMode}
                onChange={setPayoutMode}
              />
            </div>
          )}
          <div className="field">
            <span>Tai</span>
            <Chips options={taiOptions} value={tai} onChange={setTai} />
          </div>

          {/* Seat wind is the winner's; if no winner is picked yet, assume the person taking the photo won. */}
          <PhotoScore
            key={`photo-${saved}`}
            taiCap={settings.taiCap}
            seatWind={windOf(winnerId ?? me)}
            roundWind={table?.roundWind}
            onUse={(t, text) => {
              if (winnerId == null) pickWinner(me);
              setTai(Math.max(settings.minTai, t));
              setNote(text);
            }}
          />

          <details className="ai-box">
            <summary>🧮 Count tai for me</summary>
            <TaiCalculator
              key={winnerId ?? 'none'}
              taiCap={settings.taiCap}
              seatWind={windOf(winnerId)}
              roundWind={table?.roundWind}
              onUse={(t, text) => {
                setTai(Math.max(settings.minTai, t));
                setNote(text);
              }}
            />
          </details>

          <details className="ai-box">
            <summary>✨ Describe the hand to the AI</summary>
            <div className="stack">
              <textarea
                rows={3}
                placeholder="e.g. All pongs, pong of red dragon, my seat flower, half colour bamboo"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <button type="button" className="btn-secondary" onClick={askAi} disabled={aiBusy || !description.trim()}>
                {aiBusy ? 'Thinking…' : 'Suggest tai'}
              </button>
              {aiError && <p className="error">{aiError}</p>}
              {aiResult && (
                <div className="small">
                  <strong>Suggested: {aiResult.tai ?? '?'} tai</strong>
                  <ul>{aiResult.breakdown.map((b, i) => <li key={i}>{b.item}: {b.tai}</li>)}</ul>
                  {aiResult.notes && <p className="muted">{aiResult.notes}</p>}
                  <p className="muted">AI suggestions can be wrong – check before saving.</p>
                </div>
              )}
            </div>
          </details>

          <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          <button
            type="button"
            disabled={!winReady || busy}
            onClick={() => save({ kind: 'win', winnerId, discarderId, tai, payoutMode: discarderId != null ? payoutMode : undefined })}
          >
            {winReady ? `Save: ${winSummary}` : winSummary}
          </button>
        </div>
      )}

      {mode === 'payout' && (
        <div className="stack">
          <p className="muted small">Paid straight away, whoever wins the hand.</p>
          <div className="field">
            <span>What?</span>
            <Chips
              options={PAYOUT_TYPES.map((p) => ({ value: p.kind, label: p.label }))}
              value={payoutKind}
              onChange={(k) => {
                setPayoutKind(k);
                setDiscarderId(null);
              }}
            />
          </div>
          <div className="field">
            <span>Who gets paid?</span>
            <Chips options={playerChips(allIds)} value={winnerId} onChange={pickWinner} />
          </div>
          {payoutKind === 'kong_exposed' && winnerId != null && (
            <div className="field">
              <span>Kong made from a discard?</span>
              <Chips
                options={[{ value: null, label: 'No – everyone pays' }, ...playerChips(others).map((o) => ({ ...o, label: `${o.label} pays all` }))]}
                value={discarderId}
                onChange={setDiscarderId}
              />
            </div>
          )}
          {payoutType && (
            <p className="muted small">
              {discarderId != null && payoutKind === 'kong_exposed'
                ? `${realName(discarderId)} pays ${(each * (allIds.length - 1)).toFixed(2)}.`
                : `Each other player pays ${each.toFixed(2)}.`}
            </p>
          )}
          <button
            type="button"
            disabled={!payoutReady || busy}
            onClick={() =>
              save({ kind: payoutKind, winnerId, discarderId: payoutKind === 'kong_exposed' ? discarderId ?? null : null })
            }
          >
            {payoutReady ? `Save: ${payoutType.label} for ${realName(winnerId)}` : 'Pick what and who'}
          </button>
        </div>
      )}

      {mode === 'draw' && (
        <div className="stack">
          <p className="muted small">
            Nobody won the hand. No money moves.{' '}
            {settings.drawRotates ? 'The deal passes to the next player.' : 'The dealer keeps the deal.'}
          </p>
          <button type="button" disabled={busy} onClick={() => save({ kind: 'draw' })}>
            Save drawn hand
          </button>
        </div>
      )}
    </section>
  );
}
