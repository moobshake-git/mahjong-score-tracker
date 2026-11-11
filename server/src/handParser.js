// Turns a spoken/typed sentence into a hand, e.g.
//   "Alice won 3 tai from Bob"            -> winner Alice, discarder Bob, 3 tai
//   "Bob zimo 2 tai"                       -> winner Bob, self-drawn, 2 tai
//   "Carol 4 tai, Dave shoot, shooter pay" -> winner Carol, discarder Dave, 4 tai, shooter pays
//
// This rule-based parser needs no API key. The AI route uses the LLM first and falls back to
// this when the LLM is not configured or fails. Pure functions only, so it is easy to test.

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
};
// Words speech recognition often produces instead of "tai".
const TAI_WORDS = new Set(['tai', 'tais', 'tie', 'ties', 'thai', 'tye', 'ty', 'die', 'time', 'type']);
const SELF_DRAWN_RE = /\b(self[\s-]?(drawn|draw|drew|pick|picked|touch)|zi\s?mo|zimo|tsumo)\b/;
const SHOOTER_PAY_RE = /\b(shooter|shoot|shot)\s+(pay|pays|paid|all|mode)\b|\bpays?\s+all\b|\bfull\s+pay(ment)?\b/;
const NORMAL_PAY_RE = /\b(normal|standard)(\s+(pay|pays|payout|payment|mode))?\b/;
// A name followed by one of these is the discarder ("Bob shoot", "Bob discarded").
const AFTER_DISCARDER = new Set(['shoot', 'shoots', 'shot', 'shooter', 'discard', 'discards', 'discarded', 'fed', 'feed', 'feeds', 'pay', 'pays', 'paid']);
// A name after one of these is the discarder ("from Bob", "off Bob").
const BEFORE_DISCARDER = new Set(['from', 'off', 'by', 'of']);
// A name followed by one of these is the winner ("Alice won", "Alice hu").
const AFTER_WINNER = new Set(['won', 'win', 'wins', 'winning', 'hu', 'hoo', 'who', 'got', 'gets', 'get']);

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

const normalise = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Split a username into the forms someone might say: "ah_beng" -> "ah beng". */
const spokenName = (username) => normalise(username.replace(/[_.]/g, ' '));

/**
 * Find a member by a spoken name. Exact match first, then close spelling
 * (speech-to-text often gets names slightly wrong). Returns the member or null.
 */
export function matchPlayer(spoken, members) {
  const s = normalise(spoken ?? '').replace(/\s/g, '');
  if (!s) return null;
  const candidates = members.map((m) => ({ m, name: spokenName(m.username).replace(/\s/g, '') }));
  const exact = candidates.find((c) => c.name === s);
  if (exact) return exact.m;
  let best = null;
  for (const c of candidates) {
    const dist = levenshtein(s, c.name);
    const allowed = c.name.length >= 6 ? 2 : c.name.length >= 4 ? 1 : 0;
    if (dist <= allowed && (!best || dist < best.dist)) best = { m: c.m, dist };
  }
  return best?.m ?? null;
}

/** Find where each player is mentioned in the token list. Handles multi-word names. */
function findMentions(tokens, members) {
  const mentions = [];
  for (let i = 0; i < tokens.length; i++) {
    for (const len of [3, 2, 1]) {
      if (i + len > tokens.length) continue;
      const phrase = tokens.slice(i, i + len).join(' ');
      const words = phrase.split(' ');
      if (words.some((w) => TAI_WORDS.has(w) || /^\d+$/.test(w))) continue;
      const member = matchPlayer(phrase, members);
      // Multi-word phrases must match exactly-ish; avoid "alice won" matching "alicewon".
      if (member && (len === 1 || spokenName(member.username).split(' ').length === len)) {
        mentions.push({ member, start: i, end: i + len - 1 });
        i += len - 1;
        break;
      }
    }
  }
  return mentions;
}

function findTai(tokens) {
  const toNum = (t) => (/^\d+$/.test(t) ? Number(t) : NUMBER_WORDS[t]);
  // Prefer a number right before a tai word ("3 tai"), then right after ("tai 3"), then any number.
  for (let i = 0; i < tokens.length; i++) {
    if (!TAI_WORDS.has(tokens[i])) continue;
    if (i > 0 && toNum(tokens[i - 1]) != null) return toNum(tokens[i - 1]);
    if (i + 1 < tokens.length && toNum(tokens[i + 1]) != null) return toNum(tokens[i + 1]);
  }
  for (const t of tokens) {
    if (/^\d+$/.test(t)) return Number(t);
  }
  for (const t of tokens) {
    if (t !== 'one' && NUMBER_WORDS[t] != null) return NUMBER_WORDS[t]; // "one" is too often "won"
  }
  return null;
}

/**
 * @param {string} transcript what the user said
 * @param {{id:number, username:string}[]} members players at the table
 * @returns {{winnerId:number|null, discarderId:number|null, selfDrawn:boolean, tai:number|null,
 *            payoutMode:'standard'|'shooter'|null, missing:string[]}}
 */
export function parseHandText(transcript, members) {
  const text = normalise(transcript);
  const tokens = text.split(' ').filter(Boolean);
  const mentions = findMentions(tokens, members);

  const selfDrawn = SELF_DRAWN_RE.test(text);
  let payoutMode = null;
  if (SHOOTER_PAY_RE.test(text)) payoutMode = 'shooter';
  else if (NORMAL_PAY_RE.test(text)) payoutMode = 'standard';

  let winner = null;
  let discarder = null;
  for (const { member, start, end } of mentions) {
    const before = tokens[start - 1];
    const after = tokens[end + 1];
    if (!winner && AFTER_WINNER.has(after)) winner = member;
    else if (!discarder && (BEFORE_DISCARDER.has(before) || AFTER_DISCARDER.has(after))) discarder = member;
  }
  // Otherwise: first person mentioned won, second person mentioned discarded.
  const others = mentions.map((m) => m.member).filter((m) => m !== winner && m !== discarder);
  const unique = [...new Set(others)];
  if (!winner) winner = unique.shift() ?? null;
  if (!discarder && !selfDrawn) discarder = unique.find((m) => m !== winner) ?? null;
  if (discarder === winner) discarder = null;
  if (selfDrawn) discarder = null;

  const tai = findTai(tokens);
  const missing = [];
  if (!winner) missing.push('winner');
  if (!selfDrawn && !discarder) missing.push('discarder');
  if (tai == null) missing.push('tai');

  return {
    winnerId: winner?.id ?? null,
    discarderId: discarder?.id ?? null,
    selfDrawn,
    tai,
    payoutMode: selfDrawn ? null : payoutMode,
    missing,
  };
}
