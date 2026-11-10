// Run: bun scripts/check-recipe-lib.ts
// Offline: fractions, scaling, unit conversion, step highlighting, icon matching.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

import { highlightSteps } from '../src/recipe-module/lib/highlight.ts';
import { iconKeyFor } from '../src/recipe-module/lib/ingredientIcon.ts';
import { convertQuantity, formatMinutes, formatQuantity, showIngredient } from '../src/recipe-module/lib/format.ts';
import type { Ingredient } from '../src/recipe-module/extraction/types.ts';

const ing = (name: string, q: Partial<Ingredient> = {}): Ingredient => ({
  section: null, name, quantity: null, quantityMax: null, unit: null, note: null, emoji: '🍽️', ...q,
});

// fractions
assert.equal(formatQuantity(1.5), '1½');
assert.equal(formatQuantity(0.25), '¼');
assert.equal(formatQuantity(0.125), '⅛');
assert.equal(formatQuantity(2 / 3), '⅔');
assert.equal(formatQuantity(0.1), '0.1');
assert.equal(formatQuantity(250), '250');
assert.equal(formatQuantity(2.99), '3');
assert.equal(formatQuantity(12.34), '12.3');
assert.equal(formatMinutes(55), '55 min');
assert.equal(formatMinutes(90), '1 h 30 min');
assert.equal(formatMinutes(120), '2 h');

// scaling (servings 2 -> 3 is factor 1.5) and ranges
const garlic = showIngredient(ing('garlic', { quantity: 6, quantityMax: 8, unit: 'clove' }), 1.5, 'original');
assert.equal(garlic.amount, '9–12 clove');
assert.equal(showIngredient(ing('salt'), 3, 'original').amount, null, 'to-taste item has no amount');
assert.equal(showIngredient(ing('oil', { unit: 'pinch' }), 2, 'original').amount, 'pinch');
assert.equal(showIngredient(ing('flour', { quantity: 0.25, unit: 'cup' }), 2, 'original').amount, '½ cup');

// conversion
assert.deepEqual(convertQuantity(1, 'cup', 'metric'), { quantity: 240, unit: 'ml' });
assert.deepEqual(convertQuantity(4, 'cup', 'metric'), { quantity: 960, unit: 'ml' });
assert.deepEqual(convertQuantity(5, 'cup', 'metric'), { quantity: 1.2, unit: 'l' });
assert.deepEqual(convertQuantity(1, 'tsp', 'metric'), { quantity: 4.9, unit: 'ml' });
assert.deepEqual(convertQuantity(1, 'lb', 'metric'), { quantity: 455, unit: 'g' });
assert.deepEqual(convertQuantity(200, 'g', 'original'), { quantity: 200, unit: 'g' });
assert.equal(convertQuantity(1000, 'g', 'us').unit, 'lb');
assert.equal(convertQuantity(100, 'g', 'us').unit, 'oz');
assert.equal(convertQuantity(30, 'ml', 'us').unit, 'tbsp');
assert.equal(convertQuantity(5, 'ml', 'us').unit, 'tsp');
assert.equal(convertQuantity(500, 'ml', 'us').unit, 'cup');
assert.deepEqual(convertQuantity(6, 'clove', 'metric'), { quantity: 6, unit: 'clove' }, 'count units unchanged');
assert.deepEqual(convertQuantity(2, null, 'us'), { quantity: 2, unit: null });
assert.equal(showIngredient(ing('rice', { quantity: 80, unit: 'g' }), 1, 'us').amount, '2.8 oz');

// highlighting
const ings = [ing('red bell pepper'), ing('tomato'), ing('garlic'), ing('dried red chillies'), ing('oil'), ing('chicken thighs'), ing('garam masala')];
const seg = highlightSteps('Heat oil. Add the bell pepper, tomatoes, garlic and chillies; cook the chicken until brown.', ings);
const hits = seg.filter((s) => s.hit).map((s) => s.text.toLowerCase());
assert.deepEqual(hits, ['oil', 'bell pepper', 'tomatoes', 'garlic', 'chillies', 'chicken']);
assert.equal(seg.map((s) => s.text).join(''), 'Heat oil. Add the bell pepper, tomatoes, garlic and chillies; cook the chicken until brown.', 'segments rejoin to the original text');
assert.deepEqual(highlightSteps('Stir well.', ings), [{ text: 'Stir well.', hit: false }]);
assert.equal(highlightSteps('Boil the toilet', [ing('oil')]).some((s) => s.hit), false, 'whole words only');
assert.equal(highlightSteps('x', []).length, 1);

// icons: use the real icon key list
const keys = new Set(readdirSync('src/recipe-module/assets/ingredients').map((f) => f.replace(/\.png$/, '')));
assert.ok(keys.size > 400, 'icons copied');
const expectIcon = (name: string, key: string | null) => assert.equal(iconKeyFor(name, keys), key, name);
expectIcon('Chicken Breast', 'chickenbreast');
expectIcon('Basmati Rice', 'basmatirice');
expectIcon('garlic', 'garlic');
assert.ok(keys.has('redbellpepper'), 'icon set has a red bell pepper icon');
expectIcon('red bell pepper', 'redbellpepper');
expectIcon('green bell pepper', 'bellpepper');
expectIcon('dried red chillies', 'chili');
expectIcon('Tomato Puree', 'tomato');
expectIcon('tomatoes', 'tomato');
expectIcon('qwertyuiop', null);
const miss = ['Greek Yogurt', 'onion', 'honey', 'lemon juice', 'butter', 'espresso', 'all-purpose flour', 'instant yeast', 'warm water', 'sweet chili sauce', 'sriracha', 'panko breadcrumbs', 'egg', 'cheese slices']
  .filter((n) => iconKeyFor(n, keys) === null);
console.log('no icon for:', JSON.stringify(miss));
console.log('recipe lib ok');
