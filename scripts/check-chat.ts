// Run: node scripts/check-chat.ts
// Offline: chat prompt grounding, turn building, SSE parsing, per-recipe history.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { buildContents, chatSystem, createSseParser, recipeContext } from '../src/recipe-module/chat/logic.ts';
import { addMessage, clearChat, listMessages } from '../src/recipe-module/db/chat.ts';
import { deleteRecipe, type Db } from '../src/recipe-module/db/recipes.ts';
import { migrate } from '../src/recipe-module/db/schema.ts';

// context carries the recipe and nothing invented
const ctx = recipeContext({
  title: 'Popcorn Chicken', servings: 2, prepMinutes: 10, cookMinutes: null, totalMinutes: 30,
  ingredients: [
    { section: 'Chicken', name: 'chicken thighs', quantity: 1.5, quantityMax: null, unit: 'lb', note: 'boneless', emoji: '🍗' },
    { section: 'Sauce', name: 'garlic', quantity: 6, quantityMax: 8, unit: 'clove', note: null, emoji: '🧄' },
    { section: 'Sauce', name: 'water', quantity: null, quantityMax: null, unit: null, note: null, emoji: '💧' },
  ],
  steps: [{ text: 'Fry.', emoji: null }, { text: 'Toss.', emoji: null }],
  nutrition: { calories: 410, proteinG: 30, carbsG: null, fatG: null, fiberG: null }, note: 'less salt', tags: ['korean'],
});
for (const want of ['Title: Popcorn Chicken', 'Servings: 2', 'prep 10 min', '[Chicken]', '- 1.5 lb chicken thighs (boneless)', '[Sauce]', '- 6-8 clove garlic', '- water', '1. Fry.', '2. Toss.', '410 kcal', '30 g protein', "Cook's own note: less salt"]) {
  assert.ok(ctx.includes(want), `context missing: ${want}`);
}
assert.ok(!ctx.includes('total 30'), 'total time hidden when prep is known');
assert.ok(!ctx.includes('carbs'), 'null nutrition fields omitted');
assert.ok(chatSystem(ctx).includes('--- RECIPE ---\nTitle: Popcorn Chicken'));
const empty = recipeContext({ title: 'X', servings: null, prepMinutes: null, cookMinutes: null, totalMinutes: null, ingredients: [], steps: [], nutrition: null, note: null, tags: [] });
assert.ok(empty.includes('(none listed)') && empty.includes('(no method given)'));

// turns: merge same-role runs, start on a user turn, cap length
const m = (role: 'user' | 'model', content: string) => ({ role, content });
assert.deepEqual(buildContents([m('user', 'a'), m('user', 'b'), m('model', 'c')]), [
  { role: 'user', parts: [{ text: 'a\n\nb' }] },
  { role: 'model', parts: [{ text: 'c' }] },
]);
assert.equal(buildContents([m('model', 'orphan'), m('user', 'q')])[0].role, 'user');
const long = Array.from({ length: 50 }, (_, i) => m(i % 2 ? 'model' : 'user', String(i)));
const capped = buildContents(long);
assert.ok(capped.length <= 20 && capped[0].role === 'user' && capped.at(-1)!.role === 'model');
assert.deepEqual(buildContents([]), []);

// SSE: events split across chunks, CRLF, junk lines, [DONE]
const ev = (t: string) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`;
const feed = createSseParser();
const whole =
  ev('Hel') + ev('lo ') + 'data: [DONE]\n\n' + ': keepalive\n\n' + 'data: {broken\n\n' + ev('wörld') +
  'data: {"candidates":[{"finishReason":"STOP"}]}\n\n';
const got: string[] = [];
for (let i = 0; i < whole.length; i += 7) got.push(...feed(whole.slice(i, i + 7))); // brutal 7-char chunks
assert.equal(got.join(''), 'Hello wörld');
assert.deepEqual(createSseParser()(ev('x').replace(/\n/g, '\r\n')), ['x']);

// history per recipe
const raw = new DatabaseSync(':memory:');
raw.exec('PRAGMA foreign_keys = ON');
const db: Db = {
  runAsync: async (sql, p) => ({ lastInsertRowId: Number(raw.prepare(sql).run(...p).lastInsertRowid) }),
  getAllAsync: async <T,>(sql: string, p: (string | number | null)[]) => raw.prepare(sql).all(...p) as T[],
  getFirstAsync: async <T,>(sql: string, p: (string | number | null)[]) => (raw.prepare(sql).get(...p) as T) ?? null,
};
await migrate({ execAsync: async (s: string) => raw.exec(s), getFirstAsync: async <T,>(s: string) => (raw.prepare(s).get() as T) ?? null });
const rid = (t: string) => Number(raw.prepare('INSERT INTO recipes (title, created_at) VALUES (?,?)').run(t, 1).lastInsertRowid);
const a = rid('A');
const b = rid('B');
await addMessage(db, a, 'user', 'q1');
await addMessage(db, a, 'model', 'a1');
await addMessage(db, b, 'user', 'other');
assert.deepEqual((await listMessages(db, a)).map((x) => x.content), ['q1', 'a1'], 'history is per recipe, in order');
await clearChat(db, a);
assert.equal((await listMessages(db, a)).length, 0);
assert.equal((await listMessages(db, b)).length, 1, 'clearing one recipe leaves the other');
await deleteRecipe(db, b);
assert.equal((await listMessages(db, b)).length, 0, 'deleting a recipe deletes its chat');
console.log('check-chat OK');
