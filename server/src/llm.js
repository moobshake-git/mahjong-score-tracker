// Small client for OpenCode Go (OpenAI-compatible /chat/completions API).
// Configure with OPENCODE_API_KEY, OPENCODE_BASE_URL and OPENCODE_MODEL in .env.
import { config } from './config.js';

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
 * @param {{role:'system'|'user'|'assistant', content:string}[]} messages
 */
export async function chat(messages, { temperature = 0.2, maxTokens = 800 } = {}) {
  if (!llmEnabled()) throw new LlmError('AI is not configured (OPENCODE_API_KEY is missing).', 503);

  const body = { model: config.llm.model, messages, temperature, max_tokens: maxTokens };

  let res;
  try {
    res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
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
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new LlmError('AI service returned an empty reply.');
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
