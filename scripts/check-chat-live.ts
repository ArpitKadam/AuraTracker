// Run: node scripts/check-chat-live.ts   (real Gemini call; reads the key from ../ReciBites/.env, never prints it)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { recipeContext } from '../src/recipe-module/chat/logic.ts';
import { streamChat } from '../src/recipe-module/chat/stream.ts';

const env = Object.fromEntries(
  readFileSync('C:/Projects/ReciBites/.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);
const cfg = { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL };
const ctx = recipeContext({
  title: 'Korean Popcorn Chicken', servings: 2, prepMinutes: null, cookMinutes: null, totalMinutes: 30,
  ingredients: [
    { section: null, name: 'chicken thighs', quantity: 1.5, quantityMax: null, unit: 'lb', note: 'boneless', emoji: '🍗' },
    { section: null, name: 'soy sauce', quantity: 4, quantityMax: null, unit: 'tbsp', note: null, emoji: '🥫' },
    { section: null, name: 'potato starch', quantity: 0.5, quantityMax: null, unit: 'cup', note: null, emoji: '🥔' },
  ],
  steps: [{ text: 'Coat chicken in soy sauce and starch.', emoji: null }, { text: 'Deep fry until crisp.', emoji: null }],
  nutrition: null, note: null, tags: [],
});

const ask = async (history: { role: 'user' | 'model'; content: string }[]) => {
  const deltas: string[] = [];
  const t0 = Date.now();
  const full = await streamChat(cfg, ctx, history, (d) => deltas.push(d), { fetchImpl: fetch });
  console.log(`[${Date.now() - t0} ms, ${deltas.length} deltas] ${full.replace(/\n/g, ' ').slice(0, 300)}\n`);
  assert.equal(deltas.join(''), full);
  return { full, deltas };
};

const q1 = { role: 'user' as const, content: 'I have no potato starch. What can I use instead?' };
const r1 = await ask([q1]);
assert.ok(/cornstarch|corn starch|tapioca|flour|rice/i.test(r1.full), 'gives a substitute');
assert.ok(r1.deltas.length > 1, 'actually streams in several pieces');

// follow-up relies on history and on the recipe
const r2 = await ask([q1, { role: 'model', content: r1.full }, { role: 'user', content: 'Double the soy sauce amount for 4 servings: how much?' }]);
assert.ok(/8\s*(tbsp|tablespoon)|½\s*cup|1\/2 cup/i.test(r2.full), 'scales 4 tbsp to 8 tbsp');

// something the recipe does not contain: should say so
const r3 = await ask([{ role: 'user', content: 'How many grams of sugar does this recipe use?' }]);
assert.ok(/not (in|listed|included|mentioned|specified)|doesn.t (list|include|mention|use|call)|no sugar/i.test(r3.full), 'admits sugar is not in the recipe');
console.log('check-chat-live OK');
