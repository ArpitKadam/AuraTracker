// Run: node scripts/check-mealplan.ts
// Offline: meal plan data layer and date helpers on an in-memory SQLite.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { addDays, toISODate, weekStart } from '../src/recipe-module/lib/dates.ts';
import { addMeal, listMeals, removeMeal } from '../src/recipe-module/db/mealplan.ts';
import { deleteRecipe, type Db } from '../src/recipe-module/db/recipes.ts';
import { migrate } from '../src/recipe-module/db/schema.ts';

// dates: week starts Monday; month and year rollovers; leap day
assert.equal(weekStart('2026-11-09'), '2026-11-09'); // Monday
assert.equal(weekStart('2026-11-15'), '2026-11-09'); // Sunday belongs to the week that began Monday
assert.equal(weekStart('2026-11-11'), '2026-11-09');
assert.equal(addDays('2026-12-31', 1), '2027-01-01');
assert.equal(addDays('2028-02-28', 1), '2028-02-29');
assert.equal(addDays('2026-03-01', -1), '2026-02-28');
assert.equal(toISODate(new Date(2026, 0, 5)), '2026-01-05');

const raw = new DatabaseSync(':memory:');
raw.exec('PRAGMA foreign_keys = ON');
const db: Db = {
  runAsync: async (sql, p) => ({ lastInsertRowId: Number(raw.prepare(sql).run(...p).lastInsertRowid) }),
  getAllAsync: async <T,>(sql: string, p: (string | number | null)[]) => raw.prepare(sql).all(...p) as T[],
  getFirstAsync: async <T,>(sql: string, p: (string | number | null)[]) => (raw.prepare(sql).get(...p) as T) ?? null,
};
await migrate({ execAsync: async (s: string) => raw.exec(s), getFirstAsync: async <T,>(s: string) => (raw.prepare(s).get() as T) ?? null });
const recipe = (title: string) => Number(raw.prepare('INSERT INTO recipes (title, created_at) VALUES (?,?)').run(title, 1).lastInsertRowid);
const a = recipe('A');
const b = recipe('B');

assert.equal(await addMeal(db, '2026-11-10', 'dinner', a), true);
assert.equal(await addMeal(db, '2026-11-10', 'dinner', a), false, 'same recipe, same slot: no duplicate');
assert.equal(await addMeal(db, '2026-11-10', 'breakfast', b), true);
assert.equal(await addMeal(db, '2026-11-10', 'dinner', b), true, 'two recipes can share a slot');
assert.equal(await addMeal(db, '2026-11-10', 'snack', a), true);
assert.equal(await addMeal(db, '2026-11-16', 'lunch', a), true); // next week
await assert.rejects(addMeal(db, '2026-11-10', 'brunch' as never, a), 'bad slot rejected by CHECK');

const week = await listMeals(db, '2026-11-09', '2026-11-15');
assert.deepEqual(week.map((m) => `${m.slot}:${m.title}`), ['breakfast:B', 'dinner:A', 'dinner:B', 'snack:A'], 'slot order, then insert order; next week excluded');
assert.equal((await listMeals(db, '2026-11-16', '2026-11-22')).length, 1);

await removeMeal(db, week[1].id);
assert.equal((await listMeals(db, '2026-11-09', '2026-11-15')).length, 3);

await deleteRecipe(db, b);
assert.deepEqual((await listMeals(db, '2026-11-09', '2026-11-15')).map((m) => m.title), ['A'], 'deleting a recipe clears its meals');
console.log('check-mealplan OK');
