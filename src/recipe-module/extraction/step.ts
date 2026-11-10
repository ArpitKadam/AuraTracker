import type { Step } from './types.ts';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** One emoji (up to a ZWJ sequence); anything longer is the model writing words. */
export function cleanEmoji(v: unknown): string | null {
  const e = str(v);
  return e && [...e].length <= 8 ? e : null;
}

/** Accepts {text, emoji} and, for data saved before step emojis existed, a plain string. */
export function parseStep(raw: unknown): Step | null {
  if (typeof raw === 'string') {
    const text = str(raw);
    return text ? { text, emoji: null } : null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const text = str(o.text);
  return text ? { text, emoji: cleanEmoji(o.emoji) } : null;
}
