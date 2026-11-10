// Run: node scripts/check-schema.ts
// Applies the migrations to an in-memory SQLite and asserts constraints hold.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { DATABASE_VERSION, MIGRATIONS, migrate } from '../src/recipe-module/db/schema.ts';

const raw = new DatabaseSync(':memory:');
const db = {
  execAsync: async (sql: string) => raw.exec(sql),
  getFirstAsync: async <T>(sql: string) => (raw.prepare(sql).get() as T) ?? null,
};

await migrate(db);
assert.equal((raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, DATABASE_VERSION);
await migrate(db); // idempotent: second run is a no-op
assert.ok(MIGRATIONS[DATABASE_VERSION]);

raw.exec('PRAGMA foreign_keys = ON;');
const now = Date.now();
raw.prepare('INSERT INTO recipes (title, source_type, source_url, created_at) VALUES (?,?,?,?)').run('A', 'instagram', 'https://x/1', now);

// duplicate source_url rejected; NULL urls allowed repeatedly
assert.throws(() => raw.prepare('INSERT INTO recipes (title, source_url, created_at) VALUES (?,?,?)').run('B', 'https://x/1', now));
raw.prepare('INSERT INTO recipes (title, created_at) VALUES (?,?)').run('M1', now);
raw.prepare('INSERT INTO recipes (title, created_at) VALUES (?,?)').run('M2', now);
// bad enum / rating rejected
assert.throws(() => raw.prepare("INSERT INTO recipes (title, source_type, created_at) VALUES ('C','tiktok',?)").run(now));
assert.throws(() => raw.prepare('INSERT INTO recipes (title, rating, created_at) VALUES (?,6,?)').run('D', now));
assert.throws(() => raw.prepare("INSERT INTO meal_plan (plan_date, slot, recipe_id) VALUES ('2026-11-03','brunch',1)").run());

// cascade: deleting a recipe removes its links, plan entries and chat
raw.exec("INSERT INTO cookbooks (name, created_at) VALUES ('Chicken', 1)");
raw.exec('INSERT INTO cookbook_recipes VALUES (1,1)');
raw.exec("INSERT INTO meal_plan (plan_date, slot, recipe_id) VALUES ('2026-11-03','dinner',1)");
raw.exec("INSERT INTO chat_messages (recipe_id, role, content, created_at) VALUES (1,'user','hi',1)");
raw.exec('DELETE FROM recipes WHERE id = 1');
for (const t of ['cookbook_recipes', 'meal_plan', 'chat_messages']) {
  assert.equal((raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n, 0, `${t} not cascaded`);
}
console.log('schema ok');
