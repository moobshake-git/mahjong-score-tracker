// AI helper endpoints, powered by an LLM through OpenCode Go (see ../llm.js).
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { chat, chatJson, llmEnabled } from '../llm.js';
import { HttpError, loadLobbyState, requireMember } from '../lobbyService.js';
import { matchPlayer, parseHandText } from '../handParser.js';

const TAI_SYSTEM_PROMPT = `You are an expert referee for Singapore-style Mahjong.
The user describes a winning hand. Count its tai using common Singapore rules, for example:
- Ping Hu (all chows, no bonus tiles, waiting on 2 sides): 4 tai
- Dui Dui Hu (all pongs): 2 tai
- Half colour (one suit + honours): 2 tai; Full colour (one suit only): 4 tai
- Pong of dragons, or of the player's seat/prevailing wind: 1 tai each
- Each matching flower/season, each animal: 1 tai
- Self-drawn alone does not add tai in most house rules
- Limit hands (e.g. Thirteen Wonders, Big Four Winds): the table's tai cap
House rules vary, so state any assumption you make.
Reply with ONLY a JSON object of this shape, no other text:
{"tai": <integer>, "breakdown": [{"item": "<pattern>", "tai": <integer>}], "notes": "<short explanation or assumptions>"}`;

const PARSE_HAND_PROMPT = (names) => `You turn a spoken sentence about a Singapore Mahjong hand into JSON.
The sentence came from speech-to-text, so names and words may be misheard (e.g. "tie"/"thai" = "tai", "zimo" = self-drawn).
Players at the table: ${names.map((n) => JSON.stringify(n)).join(', ')}. Only use these exact names.
Fields:
- winner: the player who won the hand
- discarder: the player who discarded the winning tile ("from X", "off X", "X shoot", "X pay"), or null if self-drawn
- tai: integer number of tai won
- payoutMode: "shooter" if they say shooter pays / shooter pay all, "standard" if they say normal / normal payout, otherwise null
Reply with ONLY a JSON object: {"winner": string|null, "discarder": string|null, "tai": integer|null, "payoutMode": "shooter"|"standard"|null}`;

export function aiRouter(db) {
  const router = Router();
  router.use(requireAuth);

  router.get('/status', (req, res) => {
    res.json({ enabled: llmEnabled() });
  });

  // Suggest a tai count from a free-text description of a hand.
  router.post('/tai', async (req, res) => {
    const description = String(req.body?.description ?? '').trim();
    if (!description) throw new HttpError(400, 'Describe the hand first.');
    if (description.length > 1000) throw new HttpError(400, 'Description is too long (max 1000 characters).');

    const result = await chatJson([
      { role: 'system', content: TAI_SYSTEM_PROMPT },
      { role: 'user', content: description },
    ]);
    const tai = Number.parseInt(result.tai, 10);
    res.json({
      tai: Number.isFinite(tai) ? tai : null,
      breakdown: Array.isArray(result.breakdown) ? result.breakdown : [],
      notes: typeof result.notes === 'string' ? result.notes : '',
    });
  });

  // Turn a spoken sentence (from the browser's speech-to-text) into a hand for the record form.
  // Uses the LLM when configured; falls back to the rule-based parser if not, or if the LLM fails.
  // Nothing is saved here - the player checks the form and presses Save.
  router.post('/lobbies/:id/parse-hand', async (req, res) => {
    const id = Number(req.params.id);
    const state = loadLobbyState(db, id);
    requireMember(db, id, req.user.id);
    const transcript = String(req.body?.transcript ?? '').trim();
    if (!transcript) throw new HttpError(400, 'Say or type something first.');
    if (transcript.length > 500) throw new HttpError(400, 'That is too long (max 500 characters).');

    const rules = parseHandText(transcript, state.members);
    let hand = rules;
    let source = 'rules';

    if (llmEnabled()) {
      try {
        const r = await chatJson(
          [
            { role: 'system', content: PARSE_HAND_PROMPT(state.members.map((m) => m.username)) },
            { role: 'user', content: transcript },
          ],
          { temperature: 0, maxTokens: 200 },
        );
        const winner = matchPlayer(r.winner, state.members);
        let discarder = r.discarder ? matchPlayer(r.discarder, state.members) : null;
        // If the model missed the discarder but the rules found one (and nobody said self-drawn), keep it.
        if (!discarder && !rules.selfDrawn && rules.discarderId) {
          discarder = state.members.find((m) => m.id === rules.discarderId);
        }
        const tai = Number.isInteger(Number(r.tai)) && r.tai !== null && r.tai !== '' ? Number(r.tai) : null;
        if (winner) {
          const selfDrawn = !discarder || discarder.id === winner.id;
          hand = {
            winnerId: winner.id,
            discarderId: selfDrawn ? null : discarder.id,
            selfDrawn,
            tai: tai ?? rules.tai,
            payoutMode: selfDrawn ? null : ['shooter', 'standard'].includes(r.payoutMode) ? r.payoutMode : rules.payoutMode,
          };
          hand.missing = hand.tai == null ? ['tai'] : [];
          source = 'ai';
        }
      } catch (err) {
        console.warn('[ai] parse-hand fell back to rules:', err.message);
      }
    }
    res.json({ transcript, hand, source });
  });

  // Short, friendly recap of a lobby's game so far.
  router.post('/lobbies/:id/summary', async (req, res) => {
    const id = Number(req.params.id);
    const state = loadLobbyState(db, id);
    requireMember(db, id, req.user.id);
    if (!state.settings) throw new HttpError(409, 'The game has not started yet.');

    const name = Object.fromEntries(state.members.map((m) => [m.id, m.username]));
    const facts = {
      settings: state.settings,
      totals: Object.fromEntries(Object.entries(state.totals).map(([pid, v]) => [name[pid], v])),
      hands: state.hands.map((h, i) => ({
        hand: i + 1,
        winner: name[h.winnerId],
        discarder: h.discarderId ? name[h.discarderId] : 'self-drawn',
        tai: h.tai,
        payout: h.discarderId ? (h.payoutMode ?? state.settings.payoutMode) : undefined,
        note: h.note || undefined,
      })),
    };
    const summary = await chat(
      [
        {
          role: 'system',
          content:
            'You write short, upbeat recaps of Singapore Mahjong games for a group of friends. ' +
            'Use only the facts given. Mention the leader, notable hands and streaks. Max 120 words. Plain text, no markdown.',
        },
        { role: 'user', content: JSON.stringify(facts) },
      ],
      { temperature: 0.7, maxTokens: 400 },
    );
    res.json({ summary: summary.trim() });
  });

  return router;
}
