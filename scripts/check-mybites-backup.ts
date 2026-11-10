// Run: node scripts/check-mybites-backup.ts
// MyBites export -> import round-trip (with photos), and hostile files rejected without touching data.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { exportMyBites, importMyBites, myBitesCounts, parseMyBitesBackup } from '../src/recipe-module/db/backup.ts';
import { migrate } from '../src/recipe-module/db/schema.ts';

const open = () => {
  const raw = new DatabaseSync(':memory:');
  return {
    raw,
    db: {
      execAsync: async (sql: string) => raw.exec(sql),
      getFirstAsync: async <T>(sql: string, p: (string | number | null)[] = []) => (raw.prepare(sql).get(...p) as T) ?? null,
      getAllAsync: async <T>(sql: string, p: (string | number | null)[] = []) => raw.prepare(sql).all(...p).map((r) => ({ ...(r as object) })) as T[],
      runAsync: async (sql: string, p: (string | number | null)[] = []) => ({ lastInsertRowId: Number(raw.prepare(sql).run(...p).lastInsertRowid) }),
    },
  };
};

// Old install: two recipes (one with a photo), a cookbook, a planned meal, a chat line.
const A = open();
await migrate(A.db);
const oldDir = 'file:///data/user/0/com.auratracker.app/files/thumbs/';
const ins = A.raw.prepare(
  `INSERT INTO recipes (id, title, source_type, source_url, thumbnail_uri, servings, ingredients, steps, nutrition, tags, cooked, rating, note, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
ins.run(2, 'Fridge Cigarette', 'instagram', 'https://www.instagram.com/reel/x/', `${oldDir}ig-x.jpg`, 2, '[{"name":"egg"}]', '[{"text":"fry"}]', '{"kcal":300}', '["snack"]', 1, 5, 'good', 100);
ins.run(3, 'Bread', 'image', null, `${oldDir}gone.jpg`, null, '[]', '[]', null, '[]', 0, null, null, 200);
A.raw.exec("INSERT INTO cookbooks (id, name, pinned, created_at) VALUES (1, 'Snacks', 1, 50)");
A.raw.exec('INSERT INTO cookbook_recipes VALUES (1, 2)');
A.raw.exec("INSERT INTO meal_plan (id, plan_date, slot, recipe_id) VALUES (7, '2026-11-10', 'dinner', 2)");
A.raw.exec("INSERT INTO chat_messages (id, recipe_id, role, content, created_at) VALUES (9, 2, 'user', 'less oil?', 300)");

const files: Record<string, string> = { [`${oldDir}ig-x.jpg`]: 'aGVsbG8=' }; // gone.jpg is missing on disk
const exported = await exportMyBites(A.db, 999, async (uri) => files[uri] ?? null);
assert.deepEqual(myBitesCounts(exported), { recipes: 2, cookbooks: 1, meals: 1, photos: 1 });
assert.equal(exported.recipes[1].photo, null, 'missing photo file is dropped, recipe kept');
const text = JSON.stringify(exported);

// New install (other signing key): photos land in its own dir, uris rewritten, old rows replaced.
const B = open();
await migrate(B.db);
B.raw.exec("INSERT INTO recipes (id, title, created_at) VALUES (50, 'Leftover', 1)");
const written: Record<string, string> = {};
const newDir = 'file:///data/user/0/com.auratracker.app/files/thumbs/';
await importMyBites(B.db, parseMyBitesBackup(text), async (name, b64) => {
  written[name] = b64;
  return newDir + name;
});
assert.deepEqual(written, { 'ig-x.jpg': 'aGVsbG8=' });
const again = await exportMyBites(B.db, 999, async (uri) => written[uri.replace(newDir, '')] ?? null);
assert.deepEqual(again, exported, 'identical after round-trip');
assert.equal((B.raw.prepare('SELECT COUNT(*) AS n FROM recipes WHERE id = 50').get() as { n: number }).n, 0);

// Hostile or broken files are rejected before anything is written.
const before = await exportMyBites(B.db, 999, async (uri) => written[uri.replace(newDir, '')] ?? null);
const bad = (f: (o: any) => void) => {
  const o = JSON.parse(text);
  f(o);
  return JSON.stringify(o);
};
const cases: [string, string, RegExp][] = [
  ['not json', '{', /not JSON/],
  ['fitness file', JSON.stringify({ app: 'auratracker-fitness' }), /not a MyBites backup/],
  ['path traversal', bad((o) => (o.photos['../../databases/x.jpg'] = 'aGk=')), /bad file name/],
  ['photo not base64', bad((o) => (o.photos['ig-x.jpg'] = '<script>')), /base64/],
  ['dangling meal', bad((o) => (o.mealPlan[0].recipe_id = 404)), /not in the file/],
  ['bad json column', bad((o) => (o.recipes[0].ingredients = '{oops')), /JSON/],
  ['object instead of list', bad((o) => (o.recipes[0].tags = '{"a":1}')), /JSON array/],
  ['bad rating', bad((o) => (o.recipes[0].rating = 9)), /rating/],
  ['photo referenced but absent', bad((o) => (o.recipes[0].photo = 'nope.jpg')), /missing/],
  ['intent url', bad((o) => (o.recipes[0].source_url = 'intent://evil#Intent;scheme=http;end')), /Instagram/],
  ['javascript url', bad((o) => (o.recipes[0].source_url = 'javascript:alert(1)')), /Instagram/],
  ['lookalike host', bad((o) => (o.recipes[0].source_url = 'https://instagram.com.evil.io/reel/x/')), /Instagram/],
  ['url on image recipe', bad((o) => (o.recipes[1].source_url = 'https://www.instagram.com/reel/y/')), /only Instagram/],
  ['duplicate recipe', bad((o) => o.recipes.push(o.recipes[0])), /duplicate/],
];
for (const [label, payload, msg] of cases) assert.throws(() => parseMyBitesBackup(payload), msg, label);
assert.deepEqual(await exportMyBites(B.db, 999, async (uri) => written[uri.replace(newDir, '')] ?? null), before);

// Non-canonical Instagram links are normalised on the way in.
const loose = parseMyBitesBackup(bad((o) => (o.recipes[0].source_url = 'http://instagram.com/reels/x')));
assert.equal(loose.recipes[0].source_url, 'https://www.instagram.com/reel/x/');

// A DB-level failure mid-import rolls back.
const broken = parseMyBitesBackup(text);
(broken.recipes[0] as { source_type: string }).source_type = 'tiktok'; // past validation, violates the CHECK
await assert.rejects(importMyBites(B.db, broken, async (n) => newDir + n));
assert.deepEqual(await exportMyBites(B.db, 999, async (uri) => written[uri.replace(newDir, '')] ?? null), before, 'rolled back');

console.log('mybites backup ok');
