// Run: node scripts/check-cookbooks.ts
// Offline: cookbook data layer on an in-memory SQLite (covers, ordering, Uncategorized, names, cascades).
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  CookbookError, UNCATEGORIZED_ID, createCookbook, deleteCookbook, getCookbook, getRecipeCookbookIds, listCookbooks,
  renameCookbook, setCookbookPinned, setRecipeInCookbook,
} from '../src/recipe-module/db/cookbooks.ts';
import { listRecipesInCookbook, type Db } from '../src/recipe-module/db/recipes.ts';
import { migrate } from '../src/recipe-module/db/schema.ts';

const raw = new DatabaseSync(':memory:');
const db: Db = {
  runAsync: async (sql, p) => ({ lastInsertRowId: Number(raw.prepare(sql).run(...p).lastInsertRowid) }),
  getAllAsync: async <T,>(sql: string, p: (string | number | null)[]) => raw.prepare(sql).all(...p) as T[],
  getFirstAsync: async <T,>(sql: string, p: (string | number | null)[]) => (raw.prepare(sql).get(...p) as T) ?? null,
};
await migrate({ execAsync: async (s: string) => raw.exec(s), getFirstAsync: async <T,>(s: string) => (raw.prepare(s).get() as T) ?? null });

let t = 1000;
const recipe = (title: string, thumb: string | null) =>
  Number(raw.prepare('INSERT INTO recipes (title, thumbnail_uri, created_at) VALUES (?,?,?)').run(title, thumb, t++).lastInsertRowid);
const a = recipe('A', 'file:///a.jpg');
const b = recipe('B', 'file:///b.jpg');
const c = recipe('C', null); // no photo
const d = recipe('D', 'file:///d.jpg');
const e = recipe('E', 'file:///e.jpg');
const f = recipe('F', 'file:///f.jpg');

// nothing created yet: everything is Uncategorized
let books = await listCookbooks(db);
assert.equal(books.length, 1);
assert.deepEqual([books[0].id, books[0].name, books[0].count], [UNCATEGORIZED_ID, 'Uncategorized', 6]);

// names
const chicken = await createCookbook(db, '  Chicken   dishes ');
assert.equal((await getCookbook(db, chicken))!.name, 'Chicken dishes', 'whitespace collapsed');
await assert.rejects(createCookbook(db, '   '), (x: unknown) => x instanceof CookbookError && x.code === 'EMPTY');
await assert.rejects(createCookbook(db, 'chicken DISHES'), (x: unknown) => x instanceof CookbookError && x.code === 'DUPLICATE');
await assert.rejects(createCookbook(db, 'uncategorized'), (x: unknown) => x instanceof CookbookError && x.code === 'DUPLICATE', 'reserved name');
await assert.rejects(createCookbook(db, 'x'.repeat(41)), (x: unknown) => x instanceof CookbookError && x.code === 'TOO_LONG');
const desserts = await createCookbook(db, 'Desserts');

// membership: A, B, C, D, E in Chicken (5 recipes, one without a photo); F in Desserts
for (const r of [a, b, c, d, e]) await setRecipeInCookbook(db, r, chicken, true);
await setRecipeInCookbook(db, a, chicken, true); // idempotent
await setRecipeInCookbook(db, f, desserts, true);
await setRecipeInCookbook(db, f, UNCATEGORIZED_ID, true); // no-op
books = await listCookbooks(db);
const ck = books.find((x) => x.id === chicken)!;
assert.equal(ck.count, 5);
assert.deepEqual(ck.covers, ['file:///e.jpg', 'file:///d.jpg', 'file:///b.jpg', 'file:///a.jpg'], 'newest 4 photos; recipe C has no photo so it adds no tile');
assert.equal(books.find((x) => x.id === desserts)!.covers.length, 1, 'fewer than 4 recipes gives fewer tiles');
assert.equal(books.some((x) => x.id === UNCATEGORIZED_ID), false, 'Uncategorized hidden when empty');

// ordering: newest first, pinned first
assert.deepEqual(books.map((x) => x.name), ['Desserts', 'Chicken dishes']);
await setCookbookPinned(db, chicken, true);
assert.deepEqual((await listCookbooks(db)).map((x) => x.name), ['Chicken dishes', 'Desserts'], 'pinned goes first');
await setCookbookPinned(db, chicken, false);

// recipes inside, and Uncategorized
assert.deepEqual((await listRecipesInCookbook(db, chicken)).map((x) => x.title), ['E', 'D', 'C', 'B', 'A']);
await setRecipeInCookbook(db, a, chicken, false);
assert.deepEqual(await getRecipeCookbookIds(db, a), []);
assert.deepEqual((await listRecipesInCookbook(db, UNCATEGORIZED_ID)).map((x) => x.title), ['A']);
assert.equal((await listCookbooks(db)).at(-1)!.id, UNCATEGORIZED_ID, 'Uncategorized sorts last');

// one recipe in two cookbooks
await setRecipeInCookbook(db, b, desserts, true);
assert.deepEqual((await getRecipeCookbookIds(db, b)).sort(), [chicken, desserts].sort());

// rename, and renaming to its own name (different case) is allowed
await renameCookbook(db, desserts, 'DESSERTS');
assert.equal((await getCookbook(db, desserts))!.name, 'DESSERTS');
await assert.rejects(renameCookbook(db, desserts, 'Chicken dishes'), (x: unknown) => x instanceof CookbookError && x.code === 'DUPLICATE');

// deleting a cookbook keeps its recipes
await deleteCookbook(db, chicken);
assert.equal(raw.prepare('SELECT COUNT(*) n FROM recipes').get()!.n, 6);
assert.equal(await getCookbook(db, chicken), null);
assert.ok((await listRecipesInCookbook(db, UNCATEGORIZED_ID)).some((x) => x.title === 'C'), 'recipes fall back to Uncategorized');

// deleting a recipe removes it from cookbooks
raw.exec('PRAGMA foreign_keys = ON');
raw.prepare('DELETE FROM recipes WHERE id = ?').run(f);
assert.equal((await getCookbook(db, desserts))!.count, 1, 'only B remains in Desserts');
console.log('cookbooks ok');
