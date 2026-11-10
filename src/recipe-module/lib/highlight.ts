import type { Ingredient } from '../extraction/types';

export type Segment = { text: string; hit: boolean };

const FILLER = new Set([
  'fresh', 'chopped', 'diced', 'sliced', 'minced', 'ground', 'large', 'small', 'medium', 'whole', 'raw', 'dried',
  'boneless', 'skinless', 'soaked', 'optional', 'finely', 'roughly', 'hot', 'cold', 'warm', 'chilled', 'plain', 'of',
]);
// Single words too common to highlight alone when they are only part of a longer ingredient name.
const SKIP_ALONE = new Set([
  // form words
  'powder', 'sauce', 'paste', 'cube', 'leaves', 'leaf', 'seeds', 'seed', 'mix', 'blend', 'stock', 'broth', 'juice',
  'puree', 'cream', 'flakes', 'slices', 'slice', 'thigh', 'thighs', 'breast', 'breasts', 'wings', 'wing', 'fillet',
  // adjectives
  'red', 'green', 'yellow', 'black', 'white', 'brown', 'sweet', 'hot', 'spicy', 'greek', 'light', 'dark', 'new', 'baby',
  'extra', 'virgin', 'dry', 'instant', 'plain', 'whole',
]);

export function cleanWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w));
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Terms that mean this ingredient inside a sentence: every sub-phrase of its name, minus generic lone words. */
export function termsFor(name: string): string[] {
  const w = cleanWords(name);
  const out = new Set<string>();
  for (let i = 0; i < w.length; i++) {
    for (let j = i + 1; j <= w.length; j++) {
      const phrase = w.slice(i, j);
      const text = phrase.join(' ');
      if (text.length < 3) continue;
      if (phrase.length === 1 && w.length > 1 && SKIP_ALONE.has(phrase[0])) continue;
      out.add(text);
    }
  }
  return [...out];
}

/** Splits a step into plain and ingredient-name segments. */
export function highlightSteps(step: string, ingredients: Ingredient[]): Segment[] {
  const terms = [...new Set(ingredients.flatMap((i) => termsFor(i.name)))].sort((a, b) => b.length - a.length);
  if (terms.length === 0) return [{ text: step, hit: false }];
  // Optional plural: "tomato" matches "tomatoes", "chilli" matches "chillies".
  const alt = terms.map((t) => `${escape(t)}(?:es|s)?|${escape(t.replace(/y$/, ''))}ies`).join('|');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, 'giu');
  const out: Segment[] = [];
  let last = 0;
  for (const m of step.matchAll(re)) {
    if (m.index === undefined || m[0] === '') continue;
    if (m.index > last) out.push({ text: step.slice(last, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < step.length) out.push({ text: step.slice(last), hit: false });
  return out.length ? out : [{ text: step, hit: false }];
}
