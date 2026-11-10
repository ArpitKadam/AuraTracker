import type { GeminiConfig } from '../extraction/types.ts';
import { buildContents, chatSystem, createSseParser, type ChatMessage } from './logic.ts';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export class ChatError extends Error {}

/**
 * Streams one reply for `history` (which must end with the user's new message), calling onDelta with
 * each piece of text. Resolves with the full reply. `fetchImpl` must support response streaming
 * (expo/fetch on device, global fetch under node), so this file imports nothing from Expo.
 */
export async function streamChat(
  cfg: GeminiConfig,
  recipeText: string,
  history: Pick<ChatMessage, 'role' | 'content'>[],
  onDelta: (text: string) => void,
  opts: { fetchImpl: typeof fetch; signal?: AbortSignal },
): Promise<string> {
  const contents = buildContents(history);
  if (contents.length === 0 || contents[contents.length - 1].role !== 'user') throw new ChatError('Nothing to answer');

  const res = await opts.fetchImpl(`${ENDPOINT}/${cfg.model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: chatSystem(recipeText) }] },
      contents,
      // thinking minimal: chat answers are short and latency matters (thinkingBudget 0 is rejected by this model)
      generationConfig: { temperature: 0.5, thinkingConfig: { thinkingLevel: 'minimal' } },
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new ChatError(j?.error?.message ?? `HTTP ${res.status}`);
  }
  if (!res.body) throw new ChatError('No response stream');

  const feed = createSseParser();
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const piece of feed(decoder.decode(value, { stream: true }))) {
      full += piece;
      onDelta(piece);
    }
  }
  for (const piece of feed('\n')) { // flush an unterminated last event
    full += piece;
    onDelta(piece);
  }
  if (!full.trim()) throw new ChatError('The model returned no text');
  return full;
}
