// AI helper endpoints, powered by an LLM through OpenCode Go (see ../llm.js).
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { chat, chatJson, llmEnabled } from '../llm.js';
import { HttpError, loadLobbyState, requireMember } from '../lobbyService.js';

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
