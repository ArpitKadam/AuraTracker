// Run: bun scripts/check-nutrition-live.ts   (real Gemini call; key from ../ReciBites/.env, never printed)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { recipeContext } from '../src/recipe-module/chat/logic';
import { estimateNutrition } from '../src/recipe-module/extraction/gemini';

const env = Object.fromEntries(
  readFileSync('C:/Projects/ReciBites/.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);
const cfg = { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL };
const ing = (name: string, quantity: number | null, unit: string | null) => ({ section: null, name, quantity, quantityMax: null, unit, note: null, emoji: '🍽️' });
const base = { prepMinutes: null, cookMinutes: null, totalMinutes: null, steps: [], nutrition: null, note: null, tags: [] };

// Known answer: 4 servings of (200 g dry white rice + 2 tbsp olive oil + 1 tsp salt) is about 700 + 240 = 940 kcal total, about 235 per serving.
const rice = await estimateNutrition(cfg, recipeContext({ ...base, title: 'Oily rice', servings: 4, ingredients: [ing('white rice, dry', 200, 'g'), ing('olive oil', 2, 'tbsp'), ing('salt', 1, 'tsp')] }));
console.log('rice per serving', rice);
assert.ok(rice.calories >= 170 && rice.calories <= 320, 'rice calories per serving in range');
assert.ok(rice.carbsG >= 30 && rice.carbsG <= 60, 'carbs per serving in range');

// Same food, 1 serving: about 4x the calories, so servings are honoured.
const one = await estimateNutrition(cfg, recipeContext({ ...base, title: 'Oily rice', servings: 1, ingredients: [ing('white rice, dry', 200, 'g'), ing('olive oil', 2, 'tbsp'), ing('salt', 1, 'tsp')] }));
console.log('rice 1 serving', one);
assert.ok(one.calories > rice.calories * 3, 'fewer servings means more per serving');

// No amounts at all (a video-only reel): still returns plausible numbers.
const vague = await estimateNutrition(cfg, recipeContext({ ...base, title: 'Ajitama eggs', servings: null, ingredients: [ing('eggs', null, null), ing('soy sauce', null, null), ing('water', null, null)] }));
console.log('eggs, no amounts', vague);
assert.ok(vague.calories > 40 && vague.calories < 900);
console.log('check-nutrition-live OK');

// Import-time step: gaps filled once and marked, printed values kept, no-ingredient drafts untouched.
import { withEstimatedNutrition } from '../src/recipe-module/extraction/gemini';
const draft = {
  isRecipe: true, title: 'Oily rice', servings: 4, prepMinutes: null, cookMinutes: null, totalMinutes: null, steps: [], allergens: [], tags: [],
  ingredients: [ing('white rice, dry', 200, 'g'), ing('olive oil', 2, 'tbsp')],
  nutrition: { calories: 999, proteinG: null, carbsG: null, fatG: null, fiberG: null },
};
const done = await withEstimatedNutrition(cfg, draft);
console.log('with printed calories', done.nutrition);
assert.equal(done.nutrition!.calories, 999, 'printed calories kept');
assert.deepEqual(done.nutrition!.estimated, ['proteinG', 'carbsG', 'fatG', 'fiberG']);
assert.ok(done.nutrition!.carbsG! > 0);
const none = await withEstimatedNutrition(cfg, { ...draft, ingredients: [], nutrition: null });
assert.equal(none.nutrition, null, 'nothing to estimate from: left empty');
const bad = await withEstimatedNutrition({ ...cfg, apiKey: 'bad' }, { ...draft, nutrition: null });
assert.equal(bad.nutrition, null, 'a failed call leaves the draft unchanged instead of failing the import');
console.log('check-nutrition-live (import step) OK');
