// Database helpers for lobbies, shared by the lobby and AI routes.
import crypto from 'node:crypto';
import { config } from './config.js';
import { computeTotals } from './scoring.js';

export const MAX_PLAYERS = 4;
// Singapore Mahjong is played with 4, but 2+ is allowed so you can test with fewer accounts.
export const MIN_PLAYERS = 2;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function getLobbyRow(db, lobbyId) {
  const lobby = db.prepare('SELECT * FROM lobbies WHERE id = ?').get(lobbyId);
  if (!lobby) throw new HttpError(404, 'Lobby not found.');
  return lobby;
}

export function getMembers(db, lobbyId) {
  return db
    .prepare(
      `SELECT u.id, u.username FROM lobby_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.lobby_id = ? ORDER BY m.joined_at, u.id`,
    )
    .all(lobbyId);
}

export function isMember(db, lobbyId, userId) {
  return Boolean(db.prepare('SELECT 1 FROM lobby_members WHERE lobby_id = ? AND user_id = ?').get(lobbyId, userId));
}

export function requireMember(db, lobbyId, userId) {
  if (!isMember(db, lobbyId, userId)) throw new HttpError(403, 'Join this lobby first.');
}

/**
 * Invite code for a lobby, used in the QR code / share link. Anyone with the code can join
 * without typing the lobby password. It is derived from the server secret, so nothing is stored.
 */
export function inviteCode(lobbyId) {
  return crypto.createHmac('sha256', config.jwtSecret).update(`lobby-invite:${lobbyId}`).digest('base64url').slice(0, 16);
}

export function isValidInviteCode(lobbyId, code) {
  const expected = Buffer.from(inviteCode(lobbyId));
  const given = Buffer.from(String(code ?? ''));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export function settingsOf(lobby) {
  if (lobby.base_score == null) return null;
  return {
    baseScore: lobby.base_score,
    multiplier: lobby.multiplier,
    minTai: lobby.min_tai,
    taiCap: lobby.tai_cap,
    payoutMode: lobby.payout_mode,
  };
}

export function getHands(db, lobbyId) {
  return db
    .prepare(
      `SELECT id, winner_id AS winnerId, discarder_id AS discarderId, tai, payout_mode AS payoutMode, note, recorded_by AS recordedBy, created_at AS createdAt
       FROM hands WHERE lobby_id = ? ORDER BY id`,
    )
    .all(lobbyId);
}

/** Everything the lobby page needs, in one object. */
export function loadLobbyState(db, lobbyId) {
  const lobby = getLobbyRow(db, lobbyId);
  const members = getMembers(db, lobbyId);
  const settings = settingsOf(lobby);
  const hands = getHands(db, lobbyId);
  const playerIds = members.map((m) => m.id);
  const { totals, history } = settings
    ? computeTotals(hands, playerIds, settings)
    : { totals: Object.fromEntries(playerIds.map((id) => [id, 0])), history: [] };

  return {
    id: lobby.id,
    name: lobby.name,
    hostId: lobby.host_id,
    hasPassword: Boolean(lobby.password_hash),
    status: lobby.status,
    createdAt: lobby.created_at,
    startedAt: lobby.started_at,
    finishedAt: lobby.finished_at,
    settings,
    members,
    totals,
    hands: history,
  };
}
