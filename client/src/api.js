// All calls to the Express API go through here. The login cookie is sent automatically.
async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  // auth
  me: () => request('GET', '/auth/me'),
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  register: (username, password) => request('POST', '/auth/register', { username, password }),
  logout: () => request('POST', '/auth/logout'),

  // lobbies
  listLobbies: () => request('GET', '/lobbies'),
  createLobby: (name, password) => request('POST', '/lobbies', { name, password }),
  getLobby: (id) => request('GET', `/lobbies/${id}`),
  joinLobby: (id, password, inviteCode) => request('POST', `/lobbies/${id}/join`, { password, inviteCode }),
  getInvite: (id) => request('GET', `/lobbies/${id}/invite`),
  leaveLobby: (id) => request('POST', `/lobbies/${id}/leave`),
  startGame: (id, settings) => request('POST', `/lobbies/${id}/start`, { settings }),
  recordHand: (id, hand) => request('POST', `/lobbies/${id}/hands`, hand),
  undoHand: (id) => request('DELETE', `/lobbies/${id}/hands/last`),
  // { seatOrder: [userId, ...], dealerId, roundWind: 0-3 } - host only, mid-game
  fixTable: (id, table) => request('POST', `/lobbies/${id}/table`, table),
  undoTableFix: (id) => request('DELETE', `/lobbies/${id}/table/last`),
  finishGame: (id) => request('POST', `/lobbies/${id}/finish`),

  // AI (LLM via OpenCode Go)
  aiStatus: () => request('GET', '/ai/status'),
  suggestTai: (description) => request('POST', '/ai/tai', { description }),
  gameSummary: (id) => request('POST', `/ai/lobbies/${id}/summary`),
  // Read the tiles in a photo (data URL). Returns { tiles, unsure, dropped, notes }. The photo is not stored.
  readTiles: (image) => request('POST', '/ai/tiles', { image }),
  // Turn a spoken/typed sentence into { winnerId, discarderId, tai, payoutMode, missing }. Works without an AI key.
  parseHand: (id, transcript) => request('POST', `/ai/lobbies/${id}/parse-hand`, { transcript }),
};
