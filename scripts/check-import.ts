// Run: node scripts/check-import.ts
// Offline: the recipes DB layer on an in-memory SQLite (JSON round-trip, legacy string steps, unique URL, cascade).
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../src/recipe-module/db/schema.ts';
import { findRecipeIdBySourceUrl, getRecipe, insertRecipe, listRecipes, type Db } from '../src/recipe-module/db/recipes.ts';
import type { Ingredient, RecipeDraft } from '../src/recipe-module/extraction/types.ts';

const ing = (name: string, extra: Partial<Ingredient> = {}): Ingredient => ({
  section: null, name, quantity: null, quantityMax: null, unit: null, note: null, emoji: '🍽️', ...extra,
});
const draft = (over: Partial<RecipeDraft>): RecipeDraft => ({
  isRecipe: true, title: 'T', servings: null, prepMinutes: null, cookMinutes: null, totalMinutes: null,
  ingredients: [], steps: [], nutrition: null, allergens: [], tags: [], ...over,
});

// --- recipes DB ---
{
  const raw = new DatabaseSync(':memory:');
  const db: Db = {
    runAsync: async (sql, p) => ({ lastInsertRowId: Number(raw.prepare(sql).run(...p).lastInsertRowid) }),
    getAllAsync: async <T,>(sql: string, p: (string | number | null)[]) => raw.prepare(sql).all(...p) as T[],
    getFirstAsync: async <T,>(sql: string, p: (string | number | null)[]) => (raw.prepare(sql).get(...p) as T) ?? null,
  };
  await migrate({ execAsync: async (s: string) => raw.exec(s), getFirstAsync: async <T,>(s: string) => (raw.prepare(s).get() as T) ?? null });

  const d = draft({
    title: 'Jollof',
    servings: 4,
    ingredients: [ing('rice', { quantity: 2, unit: 'cup', section: 'For the rice', emoji: '🍚' })],
    steps: [{ text: 'Cook.', emoji: '🔥' }],
    nutrition: { calories: 405, proteinG: 29, carbsG: null, fatG: null, fiberG: null },
    tags: ['Rice'],
  });
  const id = await insertRecipe(db, d, { type: 'instagram', url: 'https://www.instagram.com/reel/X/', thumbnailUri: 'file:///t.jpg' });
  const r = (await getRecipe(db, id))!;
  assert.equal(r.title, 'Jollof');
  assert.deepEqual(r.ingredients, d.ingredients, 'ingredients round-trip through JSON');
  assert.deepEqual(r.nutrition, d.nutrition);
  assert.equal(r.cooked, false);
  assert.equal(await findRecipeIdBySourceUrl(db, 'https://www.instagram.com/reel/X/'), id);
  assert.equal(await findRecipeIdBySourceUrl(db, 'https://www.instagram.com/reel/Y/'), null);

  // duplicate source_url is rejected by the unique index; image imports (null url) can repeat
  await assert.rejects(insertRecipe(db, d, { type: 'instagram', url: 'https://www.instagram.com/reel/X/', thumbnailUri: null }));
  await insertRecipe(db, d, { type: 'image', url: null, thumbnailUri: null });
  await insertRecipe(db, d, { type: 'image', url: null, thumbnailUri: null });
  assert.equal((await listRecipes(db)).length, 3);
  assert.equal((await listRecipes(db))[0].sourceType, 'image', 'newest first');

  // rows saved before step emojis hold plain strings: still readable, emoji null
  raw.exec(`UPDATE recipes SET steps = '["Chop.","Fry."]' WHERE id = 1`);
  assert.deepEqual((await getRecipe(db, 1))!.steps, [{ text: 'Chop.', emoji: null }, { text: 'Fry.', emoji: null }]);

  // corrupt JSON column does not throw
  raw.exec("UPDATE recipes SET ingredients = '{oops', steps = 'nope' WHERE id = 1");
  const bad = (await getRecipe(db, 1))!;
  assert.deepEqual([bad.ingredients, bad.steps], [[], []]);
  console.log('recipes db ok');
}
