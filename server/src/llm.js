// Small client for OpenCode Go (OpenAI-compatible /chat/completions API).
// Configure with OPENCODE_API_KEY, OPENCODE_BASE_URL, OPENCODE_MODEL and OPENCODE_VISION_MODEL in .env.
import crypto from 'node:crypto';
import { config } from './config.js';

const USER_AGENT = 'mahjong-score-tracker/0.1';

export class LlmError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export function llmEnabled() {
  return Boolean(config.llm.apiKey);
}

/**
 * Send chat messages to the model and return the reply text.
 * `content` can be a string, or an array of parts for images:
 *   [{ type: 'text', text }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } }]
 * @param {{role:'system'|'user'|'assistant', content:string|object[]}[]} messages
 * @param {{temperature?:number, maxTokens?:number, model?:string, sessionId?:string, timeoutMs?:number}} [options]
 */
export async function chat(messages, { temperature = 0.2, maxTokens = 800, model = config.llm.model, sessionId, timeoutMs = 60_000 } = {}) {
  if (!llmEnabled()) throw new LlmError('AI is not configured (OPENCODE_API_KEY is missing).', 503);

  const body = { model, messages, temperature, max_tokens: maxTokens };

  let res;
  try {
    res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llm.apiKey}`,
        'User-Agent': USER_AGENT,
        // OpenCode Go rejects requests without a session id. One id per request is enough here.
        'x-opencode-session': sessionId || crypto.randomUUID(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new LlmError(`Could not reach the AI service: ${err.message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[llm] error', res.status, text.slice(0, 500));
    throw new LlmError(`AI service returned ${res.status}.`);
  }
  const data = await res.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    // Reasoning models can use the whole token budget thinking and return no answer.
    if (choice?.finish_reason === 'length') throw new LlmError(`AI model ${model} ran out of reply space. Try a faster model.`);
    throw new LlmError('AI service returned an empty reply.');
  }
  return content;
}

/**
 * Like chat(), but parses the reply as JSON (tolerates ```json fences / extra text).
 * We ask for JSON in the prompt rather than using response_format, because not every
 * model behind OpenCode Go supports it.
 */
export async function chatJson(messages, options = {}) {
  const text = await chat(messages, options);
  const match = text.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(match ? match[0] : text);
  } catch {
    throw new LlmError('AI reply was not valid JSON.');
  }
}
