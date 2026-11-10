// Run: node scripts/check-share.ts
// Offline: share model, text, HTML (escaping and structure), file names.
import assert from 'node:assert/strict';

import type { Recipe } from '../src/recipe-module/db/recipes.ts';
import { buildShareModel, escapeHtml, renderHtml, renderText, shareFileName } from '../src/recipe-module/lib/share.ts';

const recipe: Recipe = {
  id: 1, title: 'Mac & <Cheese> "Bake"', sourceType: 'instagram', sourceUrl: 'https://www.instagram.com/reel/X/', thumbnailUri: null,
  servings: 2, prepMinutes: 10, cookMinutes: 45, totalMinutes: null,
  ingredients: [
    { section: 'Sauce', name: 'butter', quantity: 10, quantityMax: null, unit: 'g', note: 'melted', emoji: '🧈' },
    { section: 'Sauce', name: 'flour', quantity: 0.25, quantityMax: null, unit: 'cup', note: null, emoji: '🌾' },
    { section: null, name: 'salt', quantity: null, quantityMax: null, unit: null, note: null, emoji: '🧂' },
  ],
  steps: [{ text: 'Melt the <butter>.', emoji: '🔥' }, { text: 'Serve.', emoji: null }],
  nutrition: { calories: 350, proteinG: 40, carbsG: null, fatG: null, fiberG: null },
  allergens: [], tags: ['Pasta', 'Cheesy'], cooked: false, rating: null, note: null, createdAt: 0,
};

const m = buildShareModel(recipe, 4, 'original'); // 2 -> 4 servings doubles amounts
assert.deepEqual(m.chips, ['⏱️ Prep 10 min', '🔥 Cook 45 min', '🍽️ Serves 4']);
assert.equal(m.groups.length, 2, 'sections become groups');
assert.equal(m.groups[0].rows[0].amount, '20 g');
assert.equal(m.groups[0].rows[1].amount, '½ cup');
assert.equal(m.groups[1].section, null);
assert.equal(m.steps[1].emoji, '🍴', 'missing step emoji gets a fallback');
assert.deepEqual(m.nutrition, [{ label: 'Calories', value: '350 kcal' }, { label: 'Protein', value: '40 g' }], 'only printed values');
assert.equal(buildShareModel(recipe, 4, 'us').groups[0].rows[0].amount, '0.71 oz');

const text = renderText(m);
assert.ok(text.includes('1. Melt the <butter>. 🔥'), 'step emoji sits at the right end');
assert.ok(text.includes('🧈 20 g butter (melted)'));
assert.ok(text.includes('Sauce:'));
assert.ok(text.endsWith('Shared from MyBites'));

const html = renderHtml(m, 'data:image/jpeg;base64,AAAA');
assert.ok(!html.includes('<butter>'), 'recipe text is escaped');
assert.ok(html.includes('Melt the &lt;butter&gt;.'));
assert.ok(html.includes('Mac &amp; &lt;Cheese&gt; &quot;Bake&quot;'));
assert.ok(html.includes('<img class="hero" src="data:image/jpeg;base64,AAAA">'));
assert.equal((html.match(/class="step"/g) ?? []).length, 2);
assert.ok(/<span class="tx">Melt the &lt;butter&gt;\.<\/span><span class="em">🔥<\/span>/.test(html), 'emoji after the instruction');
assert.ok(!renderHtml(m, null).includes('class="hero"'));
assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
// a hostile data URI cannot break out of the attribute
assert.ok(!renderHtml(m, 'x"><script>alert(1)</script>').includes('<script>'));

assert.equal(shareFileName('The Tastiest One-Bowl Butter Chicken!'), 'the-tastiest-one-bowl-butter-chicken');
assert.equal(shareFileName('???'), 'recipe');
console.log('share ok');
