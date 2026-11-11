import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../auth.js';
import { validateSettings, entryPayments, ENTRY_KINDS } from '../scoring.js';
import { validateSeatOrder, validateRoundWind } from '../table.js';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  HttpError,
  getLobbyRow,
  getMembers,
  isMember,
  requireMember,
  settingsOf,
  loadLobbyState,
  inviteCode,
  isValidInviteCode,
} from '../lobbyService.js';

export function lobbiesRouter(db) {
  const router = Router();
  router.use(requireAuth);

  const lobbyId = (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid lobby id.');
    return id;
  };
  const requireHost = (lobby, userId) => {
    if (lobby.host_id !== userId) throw new HttpError(403, 'Only the host can do that.');
  };

  // List lobbies that are open or in progress.
  router.get('/', (req, res) => {
    const rows = db
      .prepare(
        `SELECT l.id, l.name, l.status, l.password_hash IS NOT NULL AS hasPassword, l.created_at AS createdAt,
                u.username AS host,
                (SELECT COUNT(*) FROM lobby_members m WHERE m.lobby_id = l.id) AS memberCount,
                EXISTS (SELECT 1 FROM lobby_members m WHERE m.lobby_id = l.id AND m.user_id = ?) AS isMember
         FROM lobbies l JOIN users u ON u.id = l.host_id
         WHERE l.status != 'finished' OR EXISTS (SELECT 1 FROM lobby_members m WHERE m.lobby_id = l.id AND m.user_id = ?)
         ORDER BY l.id DESC LIMIT 100`,
      )
      .all(req.user.id, req.user.id);
    res.json({
      lobbies: rows.map((r) => ({ ...r, hasPassword: Boolean(r.hasPassword), isMember: Boolean(r.isMember), maxPlayers: MAX_PLAYERS })),
    });
  });

  // Create a lobby (optionally password protected). The creator is the host and joins automatically.
  router.post('/', async (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const password = req.body?.password ? String(req.body.password) : '';
    if (name.length < 1 || name.length > 40) throw new HttpError(400, 'Lobby name must be 1-40 characters.');
    if (password && password.length < 3) throw new HttpError(400, 'Lobby password must be at least 3 characters.');
    const hash = password ? await bcrypt.hash(password, 10) : null;

    const id = db.transaction(() => {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO lobbies (name, host_id, password_hash) VALUES (?, ?, ?)')
        .run(name, req.user.id, hash);
      db.prepare('INSERT INTO lobby_members (lobby_id, user_id) VALUES (?, ?)').run(lastInsertRowid, req.user.id);
      return Number(lastInsertRowid);
    })();
    res.status(201).json({ lobby: loadLobbyState(db, id) });
  });

  router.get('/:id', (req, res) => {
    const id = lobbyId(req);
    getLobbyRow(db, id);
    requireMember(db, id, req.user.id);
    res.json({ lobby: loadLobbyState(db, id) });
  });

  router.post('/:id/join', async (req, res) => {
    const id = lobbyId(req);
    const lobby = getLobbyRow(db, id);
    if (isMember(db, id, req.user.id)) return res.json({ lobby: loadLobbyState(db, id) });
    if (lobby.status !== 'waiting') throw new HttpError(409, 'This game has already started.');
    // A valid invite code (from the QR code / share link) skips the password.
    const invited = req.body?.inviteCode != null && isValidInviteCode(id, req.body.inviteCode);
    if (req.body?.inviteCode != null && !invited) throw new HttpError(403, 'This invite link is not valid.');
    if (lobby.password_hash && !invited) {
      const password = String(req.body?.password ?? '');
      if (!(await bcrypt.compare(password, lobby.password_hash))) throw new HttpError(403, 'Wrong lobby password.');
    }
    db.transaction(() => {
      if (getMembers(db, id).length >= MAX_PLAYERS) throw new HttpError(409, 'This lobby is full.');
      db.prepare('INSERT INTO lobby_members (lobby_id, user_id) VALUES (?, ?)').run(id, req.user.id);
    })();
    res.json({ lobby: loadLobbyState(db, id) });
  });

  // Invite code for the QR code / share link. Only members can see it.
  router.get('/:id/invite', (req, res) => {
    const id = lobbyId(req);
    getLobbyRow(db, id);
    requireMember(db, id, req.user.id);
    res.json({ code: inviteCode(id) });
  });

  // Leave a lobby before the game starts. If the host leaves, the next player becomes host;
  // if nobody is left, the lobby is deleted.
  router.post('/:id/leave', (req, res) => {
    const id = lobbyId(req);
    const lobby = getLobbyRow(db, id);
    requireMember(db, id, req.user.id);
    if (lobby.status === 'playing') throw new HttpError(409, 'You cannot leave while the game is in progress.');
    db.transaction(() => {
      db.prepare('DELETE FROM lobby_members WHERE lobby_id = ? AND user_id = ?').run(id, req.user.id);
      const remaining = getMembers(db, id);
      if (remaining.length === 0) db.prepare('DELETE FROM lobbies WHERE id = ?').run(id);
      else if (lobby.host_id === req.user.id) db.prepare('UPDATE lobbies SET host_id = ? WHERE id = ?').run(remaining[0].id, id);
    })();
    res.json({ ok: true });
  });

  // Host enters base score, multiplier etc. and starts the game. Players are locked in from here.
  router.post('/:id/start', (req, res) => {
    const id = lobbyId(req);
    const lobby = getLobbyRow(db, id);
    requireHost(lobby, req.user.id);
    if (lobby.status !== 'waiting') throw new HttpError(409, 'The game has already started.');
    const members = getMembers(db, id);
    if (members.length < MIN_PLAYERS) throw new HttpError(409, `Need at least ${MIN_PLAYERS} players to start.`);
    // First dealer (East). Defaults to the first player in seating order.
    const firstDealerRaw = req.body?.settings?.firstDealerId;
    const firstDealerId = firstDealerRaw == null || firstDealerRaw === '' ? members[0].id : Number(firstDealerRaw);
    if (!members.some((m) => m.id === firstDealerId)) throw new HttpError(400, 'First dealer must be a player in this lobby.');

    let s;
    let seatOrder;
    let startRound;
    try {
      s = validateSettings(req.body?.settings);
      // Seating (turn order round the table). Defaults to join order.
      const rawOrder = req.body?.settings?.seatOrder;
      seatOrder = rawOrder == null ? members.map((m) => m.id) : validateSeatOrder(rawOrder, members.map((m) => m.id));
      startRound = validateRoundWind(req.body?.settings?.startRound);
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    db.prepare(
      `UPDATE lobbies SET status = 'playing', base_score = ?, multiplier = ?, min_tai = ?, tai_cap = ?, payout_mode = ?,
       draw_rotates = ?, instant_payouts = ?, first_dealer_id = ?, seat_order = ?, start_round = ?,
       started_at = datetime('now') WHERE id = ?`,
    ).run(
      s.baseScore,
      s.multiplier,
      s.minTai,
      s.taiCap,
      s.payoutMode,
      s.drawRotates ? 1 : 0,
      JSON.stringify(s.instantPayouts),
      firstDealerId,
      JSON.stringify(seatOrder),
      startRound,
      id,
    );
    res.json({ lobby: loadLobbyState(db, id) });
  });

  // Record an entry: a win, a drawn hand, or an instant payout (kong, animal pair, bonus set).
  // Body: { kind?, winnerId, discarderId, tai, payoutMode?, note? }
  // kind defaults to 'win'. For wins, discarderId = null means self-drawn.
  router.post('/:id/hands', (req, res) => {
    const id = lobbyId(req);
    const lobby = getLobbyRow(db, id);
    requireMember(db, id, req.user.id);
    if (lobby.status !== 'playing') throw new HttpError(409, 'The game is not in progress.');

    const kind = req.body?.kind ?? 'win';
    if (!ENTRY_KINDS.includes(kind)) throw new HttpError(400, 'Unknown entry type.');
    const optionalId = (v) => (v == null || v === '' ? null : Number(v));
    const winnerId = kind === 'draw' ? null : optionalId(req.body?.winnerId);
    const discarderId = kind === 'draw' ? null : optionalId(req.body?.discarderId);
    const tai = kind === 'win' ? Number(req.body?.tai) : null;
    // 'standard' (normal payout) or 'shooter' (shooter pays), for discard wins only. Omit to use the lobby default.
    const payoutMode = kind === 'win' && discarderId != null ? req.body?.payoutMode || settingsOf(lobby).payoutMode : null;
    const note = req.body?.note ? String(req.body.note).slice(0, 200) : null;
    const playerIds = getMembers(db, id).map((m) => m.id);
    try {
      entryPayments({ kind, winnerId, discarderId, tai, payoutMode }, playerIds, settingsOf(lobby)); // validates
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    db.prepare(
      'INSERT INTO hands (lobby_id, kind, winner_id, discarder_id, tai, payout_mode, note, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, kind, winnerId, discarderId, tai, payoutMode, note, req.user.id);
    res.status(201).json({ lobby: loadLobbyState(db, id) });
  });

  // Undo the most recent entry. Allowed for the host, or for whoever recorded it (to fix a mis-tap).
  router.delete('/:id/hands/last', (req, res) => {
    const id = lobbyId(req);
    const lobby = getLobbyRow(db, id);
    requireMember(db, id, req.user.id);
    if (lobby.status !== 'playing') throw new HttpError(409, 'The game is not in progress.');
    const last = db.prepare('SELECT id, recorded_by FROM hands WHERE lobby_id = ? ORDER BY id DESC LIMIT 1').get(id);
    if (!last) throw new HttpError(404, 'No hands to undo.');
    if (lobby.host_id !== req.user.id && last.recorded_by !== req.user.id) {
      throw new HttpError(403, 'Only the host or the person who recorded it can undo this.');
    }
    db.prepare('DELETE FROM hands WHERE id = ?').run(last.id);
    res.json({ lobby: loadLobbyState(db, id) });
  });

  // Fix the table mid-game (host only): seating order, who is dealing, and the round wind.
  // Takes effect from now on; hands already recorded keep the dealer and winds they had.
  // Body: { seatOrder: [userId, ...], dealerId, roundWind: 0-3 }
  router.post('/:id/table', (req, res) => {
    const id = lobbyId(req);
    const lobby = getLobbyRow(db, id);
    requireHost(lobby, req.user.id);
    if (lobby.status !== 'playing') throw new HttpError(409, 'The game is not in progress.');
    const playerIds = getMembers(db, id).map((m) => m.id);
    let seatOrder;
    let roundWind;
    try {
      seatOrder = validateSeatOrder(req.body?.seatOrder, playerIds);
      roundWind = validateRoundWind(req.body?.roundWind);
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    const dealerId = Number(req.body?.dealerId);
    if (!playerIds.includes(dealerId)) throw new HttpError(400, 'Dealer must be a player at this table.');
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM hands WHERE lobby_id = ?').get(id);
    db.prepare(
      'INSERT INTO table_adjustments (lobby_id, position, seat_order, dealer_id, round_wind, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, count, JSON.stringify(seatOrder), dealerId, roundWind, req.user.id);
    res.status(201).json({ lobby: loadLobbyState(db, id) });
  });

  // Undo the most recent table fix (host only).
  router.delete('/:id/table/last', (req, res) => {
    const id = lobbyId(req);
    const lobby = getLobbyRow(db, id);
    requireHost(lobby, req.user.id);
    if (lobby.status !== 'playing') throw new HttpError(409, 'The game is not in progress.');
    const last = db.prepare('SELECT id FROM table_adjustments WHERE lobby_id = ? ORDER BY id DESC LIMIT 1').get(id);
    if (!last) throw new HttpError(404, 'No table changes to undo.');
    db.prepare('DELETE FROM table_adjustments WHERE id = ?').run(last.id);
    res.json({ lobby: loadLobbyState(db, id) });
  });

  router.post('/:id/finish', (req, res) => {
    const id = lobbyId(req);
    const lobby = getLobbyRow(db, id);
    requireHost(lobby, req.user.id);
    if (lobby.status !== 'playing') throw new HttpError(409, 'The game is not in progress.');
    db.prepare("UPDATE lobbies SET status = 'finished', finished_at = datetime('now') WHERE id = ?").run(id);
    res.json({ lobby: loadLobbyState(db, id) });
  });

  return router;
}
