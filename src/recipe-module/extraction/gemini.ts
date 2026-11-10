import { captionPrompt, IMAGE_PROMPT, mergePrompt, STEP_EMOJI_PROMPT, SYSTEM_PROMPT, videoPartPrompt, videoPrompt } from './prompt';
import { recipeContext } from '../chat/logic';
import { canEstimate, mergeEstimate, NUTRITION_SCHEMA, NUTRITION_SYSTEM_PROMPT, parseEstimate, type Estimate } from './nutrition';
import { hasStepsButNoIngredients, parseRecipeDraft, RECIPE_RESPONSE_SCHEMA } from './schema';
import { cleanEmoji } from './step';
import type { GeminiConfig, ImagePart, RecipeDraft, Step, VideoPart } from './types';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
// Inline request bodies are capped near 20 MB; base64 adds a third.
// ponytail: inline only. Upgrade to the Files API if reels over ~14 MB matter.
export const MAX_INLINE_BYTES = 14 * 1024 * 1024;

/** How many clips a video of this size must be cut into so each fits inline (1 = send as is). */
export function planParts(bytes: number): number {
  // 15% margin: clips overlap and bitrate is uneven, so an equal-time cut is not an equal-size cut
  // (on-device: a 23.8 MB reel cut in two gave 11.0 MB and 13.6 MB).
  return bytes <= MAX_INLINE_BYTES ? 1 : Math.ceil(bytes / (MAX_INLINE_BYTES * 0.85));
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

type Job<T> = {
  system: string;
  schema: unknown;
  parts: Part[];
  timeoutMs: number;
  parse: (json: unknown) => T;
};

const RETRY_NUDGE =
  'Your previous answer listed steps but NO ingredients. Answer again: every food, drink or liquid used in the steps (including the main item being cooked, and water) must be in ingredients. Use quantity null for amounts that are never stated.';

/** One recipe call. A result with a method but an empty ingredient list is inconsistent, so it gets one retry. */
async function generate(cfg: GeminiConfig, parts: Part[], timeoutMs: number): Promise<RecipeDraft> {
  const run = (p: Part[]) =>
    generateJson<RecipeDraft>(cfg, { system: SYSTEM_PROMPT, schema: RECIPE_RESPONSE_SCHEMA, parts: p, timeoutMs, parse: parseRecipeDraft });
  const first = await run(parts);
  if (!hasStepsButNoIngredients(first)) return first;
  const second = await run([...parts, { text: RETRY_NUDGE }]);
  // keep whichever answer is more complete; never return something worse than the first try
  return second.ingredients.length > first.ingredients.length ? second : first;
}

async function generateJson<T>(cfg: GeminiConfig, job: Job<T>): Promise<T> {
  const { timeoutMs, parts } = job;
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: job.system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: job.schema,
      temperature: 0.2,
      // thinkingBudget: 0 is rejected (HTTP 400) by gemini-3.5-flash-lite; "minimal" is accepted.
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
  });

  let lastError: GeminiError | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${ENDPOINT}/${cfg.model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
        body,
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = json?.error?.message ?? `HTTP ${res.status}`;
        lastError = new GeminiError(msg, res.status);
        // Retry only transient failures; a bad key or bad request will not improve.
        if (res.status === 429 || res.status >= 500) continue;
        throw lastError;
      }
      const cand = json?.candidates?.[0];
      const text: string = cand?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
      if (!text) {
        const why = cand?.finishReason ?? json?.promptFeedback?.blockReason ?? 'empty response';
        throw new GeminiError(`Gemini returned no content (${why})`);
      }
      return job.parse(JSON.parse(text));
    } catch (e) {
      if (e instanceof GeminiError) {
        lastError = e;
        if (e.status === undefined || (e.status !== 429 && e.status < 500)) throw e;
      } else if (e instanceof Error && e.name === 'AbortError') {
        lastError = new GeminiError('Gemini request timed out');
      } else {
        throw e; // network failure or bad JSON: surface as-is
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new GeminiError('Gemini request failed');
}

export function extractFromCaption(
  cfg: GeminiConfig,
  input: { caption: string; author?: string | null },
): Promise<RecipeDraft> {
  return generate(cfg, [{ text: captionPrompt(input.caption, input.author) }], 60_000);
}

export function extractFromImages(cfg: GeminiConfig, images: ImagePart[]): Promise<RecipeDraft> {
  if (images.length === 0) throw new GeminiError('No images to read');
  const parts: Part[] = [
    { text: IMAGE_PROMPT },
    ...images.map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.base64 } })),
  ];
  return generate(cfg, parts, 90_000);
}

function videoCall(cfg: GeminiConfig, video: VideoPart, text: string): Promise<RecipeDraft> {
  // base64 length * 3/4 = bytes
  if ((video.base64.length * 3) / 4 > MAX_INLINE_BYTES) {
    throw new GeminiError('Video clip is too large to send (over about 14 MB). Split it first.');
  }
  return generate(cfg, [{ text }, { inline_data: { mime_type: video.mimeType, data: video.base64 } }], 180_000);
}

export function extractFromVideo(cfg: GeminiConfig, video: VideoPart, caption?: string | null): Promise<RecipeDraft> {
  return videoCall(cfg, video, videoPrompt(caption));
}

/**
 * Consecutive clips of one video: read every clip in parallel, then one text-only call
 * merges the per-clip results. One clip skips the merge call.
 */
export async function extractFromVideoParts(
  cfg: GeminiConfig,
  clips: VideoPart[],
  caption?: string | null,
): Promise<RecipeDraft> {
  if (clips.length === 0) throw new GeminiError('No video clips to read');
  if (clips.length === 1) return extractFromVideo(cfg, clips[0], caption);
  const drafts = await Promise.all(
    clips.map((c, i) => videoCall(cfg, c, videoPartPrompt(i, clips.length, caption))),
  );
  // A clip with no recipe content (an outro) is dropped from the merge input.
  const useful = drafts.filter((d) => d.ingredients.length > 0 || d.steps.length > 0);
  if (useful.length === 0) return drafts[0];
  return generate(cfg, [{ text: mergePrompt(JSON.stringify(useful), caption) }], 90_000);
}

/** Adds one emoji per step to recipes saved before step emojis existed. Same length and order in, same out. */
export async function addStepEmojis(cfg: GeminiConfig, steps: Step[]): Promise<Step[]> {
  if (steps.length === 0) return steps;
  const emojis = await generateJson<(string | null)[]>(cfg, {
    system: STEP_EMOJI_PROMPT,
    schema: {
      type: 'OBJECT',
      properties: { emojis: { type: 'ARRAY', items: { type: 'STRING' } } },
      required: ['emojis'],
    },
    parts: [{ text: steps.map((s, i) => `${i + 1}. ${s.text}`).join('\n') }],
    timeoutMs: 45_000,
    parse: (j) => {
      const list = (j as { emojis?: unknown })?.emojis;
      if (!Array.isArray(list) || list.length !== steps.length) {
        throw new GeminiError(`Expected ${steps.length} emojis, got ${Array.isArray(list) ? list.length : 'none'}`);
      }
      return list.map(cleanEmoji);
    },
  });
  return steps.map((s, i) => ({ ...s, emoji: s.emoji ?? emojis[i] }));
}

/** Per-serving nutrition estimated from the recipe text (see chat/logic recipeContext). One cheap call, no media. */
export function estimateNutrition(cfg: GeminiConfig, recipeText: string): Promise<Estimate> {
  return generateJson<Estimate>(cfg, {
    system: NUTRITION_SYSTEM_PROMPT,
    schema: NUTRITION_SCHEMA,
    parts: [{ text: recipeText }],
    timeoutMs: 45_000,
    parse: parseEstimate,
  });
}

/**
 * Import-time step: fills the nutrition gaps of a fresh draft once, so the numbers are stored with the
 * recipe and never recomputed. Printed values stay. A failed call returns the draft unchanged (the
 * recipe screen offers the button as a fallback).
 */
export async function withEstimatedNutrition(cfg: GeminiConfig, draft: RecipeDraft): Promise<RecipeDraft> {
  if (draft.ingredients.length === 0 || !canEstimate(draft.nutrition)) return draft;
  try {
    const est = await estimateNutrition(cfg, recipeContext({ ...draft, note: null }));
    return { ...draft, nutrition: mergeEstimate(draft.nutrition, est) };
  } catch {
    return draft;
  }
}
