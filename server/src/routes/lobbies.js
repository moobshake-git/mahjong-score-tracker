import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../auth.js';
import { validateSettings, handPayments } from '../scoring.js';
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
    if (lobby.password_hash) {
      const password = String(req.body?.password ?? '');
      if (!(await bcrypt.compare(password, lobby.password_hash))) throw new HttpError(403, 'Wrong lobby password.');
    }
    db.transaction(() => {
      if (getMembers(db, id).length >= MAX_PLAYERS) throw new HttpError(409, 'This lobby is full.');
      db.prepare('INSERT INTO lobby_members (lobby_id, user_id) VALUES (?, ?)').run(id, req.user.id);
    })();
    res.json({ lobby: loadLobbyState(db, id) });
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
    const count = getMembers(db, id).length;
    if (count < MIN_PLAYERS) throw new HttpError(409, `Need at least ${MIN_PLAYERS} players to start.`);

    let s;
    try {
      s = validateSettings(req.body?.settings);
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    db.prepare(
      `UPDATE lobbies SET status = 'playing', base_score = ?, multiplier = ?, min_tai = ?, tai_cap = ?, payout_mode = ?,
       started_at = datetime('now') WHERE id = ?`,
    ).run(s.baseScore, s.multiplier, s.minTai, s.taiCap, s.payoutMode, id);
    res.json({ lobby: loadLobbyState(db, id) });
  });

  // Record a winning hand. discarderId = null means self-drawn.
  router.post('/:id/hands', (req, res) => {
    const id = lobbyId(req);
    const lobby = getLobbyRow(db, id);
    requireMember(db, id, req.user.id);
    if (lobby.status !== 'playing') throw new HttpError(409, 'The game is not in progress.');

    const winnerId = Number(req.body?.winnerId);
    const discarderId = req.body?.discarderId == null || req.body.discarderId === '' ? null : Number(req.body.discarderId);
    const tai = Number(req.body?.tai);
    const note = req.body?.note ? String(req.body.note).slice(0, 200) : null;
    const playerIds = getMembers(db, id).map((m) => m.id);
    try {
      handPayments({ winnerId, discarderId, tai }, playerIds, settingsOf(lobby)); // validates
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    db.prepare('INSERT INTO hands (lobby_id, winner_id, discarder_id, tai, note, recorded_by) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      winnerId,
      discarderId,
      tai,
      note,
      req.user.id,
    );
    res.status(201).json({ lobby: loadLobbyState(db, id) });
  });

  // Undo the most recent hand (host only).
  router.delete('/:id/hands/last', (req, res) => {
    const id = lobbyId(req);
    const lobby = getLobbyRow(db, id);
    requireHost(lobby, req.user.id);
    if (lobby.status !== 'playing') throw new HttpError(409, 'The game is not in progress.');
    const last = db.prepare('SELECT id FROM hands WHERE lobby_id = ? ORDER BY id DESC LIMIT 1').get(id);
    if (!last) throw new HttpError(404, 'No hands to undo.');
    db.prepare('DELETE FROM hands WHERE id = ?').run(last.id);
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
