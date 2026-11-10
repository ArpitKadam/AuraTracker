// Run: node scripts/check-journal.ts
// Offline: cooked / rating / note / tags persistence on an in-memory SQLite.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { cleanTags, getRecipe, updateJournal, type Db } from '../src/recipe-module/db/recipes.ts';
import { migrate } from '../src/recipe-module/db/schema.ts';

const raw = new DatabaseSync(':memory:');
const db: Db = {
  runAsync: async (sql, p) => ({ lastInsertRowId: Number(raw.prepare(sql).run(...p).lastInsertRowid) }),
  getAllAsync: async <T,>(sql: string, p: (string | number | null)[]) => raw.prepare(sql).all(...p) as T[],
  getFirstAsync: async <T,>(sql: string, p: (string | number | null)[]) => (raw.prepare(sql).get(...p) as T) ?? null,
};
await migrate({ execAsync: async (s: string) => raw.exec(s), getFirstAsync: async <T,>(s: string) => (raw.prepare(s).get() as T) ?? null });
const id = Number(raw.prepare("INSERT INTO recipes (title, tags, created_at) VALUES ('A', '[\"Korean\"]', 1)").run().lastInsertRowid);

assert.deepEqual(cleanTags([' spicy ', 'Spicy', '', 'a  b', 'x'.repeat(40)]), ['spicy', 'a b', 'x'.repeat(24)]);
assert.equal(cleanTags(Array.from({ length: 12 }, (_, i) => `t${i}`)).length, 8);

let r = (await getRecipe(db, id))!;
assert.deepEqual([r.cooked, r.rating, r.note, r.tags], [false, null, null, ['Korean']]);

await updateJournal(db, id, { cooked: true, rating: 4 });
r = (await getRecipe(db, id))!;
assert.deepEqual([r.cooked, r.rating, r.note], [true, 4, null], 'partial patch leaves note alone');

await updateJournal(db, id, { note: '  less salt next time  ', tags: ['Korean', 'weeknight', 'korean'] });
r = (await getRecipe(db, id))!;
assert.equal(r.note, 'less salt next time');
assert.deepEqual(r.tags, ['Korean', 'weeknight']);
assert.equal(r.rating, 4);

await updateJournal(db, id, { note: '   ', rating: null, cooked: false });
r = (await getRecipe(db, id))!;
assert.deepEqual([r.cooked, r.rating, r.note], [false, null, null], 'blank note and cleared rating become null');

await assert.rejects(updateJournal(db, id, { rating: 6 }), RangeError);
await assert.rejects(updateJournal(db, id, { rating: 2.5 }), RangeError);
await updateJournal(db, id, {}); // no-op
console.log('check-journal OK');
