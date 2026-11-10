// Run: node scripts/check-custom.ts
// Custom exercises: validation, duplicate names, muscle mapping, recommendation pool, delete guard.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { createCustom, deleteCustom, isLogged, listCustom, updateCustom, validateCustom } from '../src/fitness/db/custom.ts';
import { migrate } from '../src/fitness/db/schema.ts';
import { addSet, startSession } from '../src/fitness/db/session.ts';
import { recommend } from '../src/fitness/recommend.ts';

const raw = new DatabaseSync(':memory:');
const db = {
  execAsync: async (sql: string) => raw.exec(sql),
  getFirstAsync: async <T>(sql: string, p: (string | number | null)[] = []) => (raw.prepare(sql).get(...p) as T) ?? null,
  getAllAsync: async <T>(sql: string, p: (string | number | null)[] = []) => raw.prepare(sql).all(...p) as T[],
  runAsync: async (sql: string, p: (string | number | null)[] = []) => ({ lastInsertRowId: Number(raw.prepare(sql).run(...p).lastInsertRowid) }),
};
await migrate(db);

// Validation trims and rejects empty names / no groups / overlong names.
assert.equal(validateCustom({ name: '  Gym   machine  fly ', groups: ['chest'], equipment: 'machine', photoUri: null }).name, 'Gym machine fly');
assert.throws(() => validateCustom({ name: ' ', groups: ['chest'], equipment: 'machine', photoUri: null }), /name/);
assert.throws(() => validateCustom({ name: 'Fly', groups: [], equipment: 'machine', photoUri: null }), /muscle group/);
assert.throws(() => validateCustom({ name: 'x'.repeat(61), groups: ['chest'], equipment: 'machine', photoUri: null }), /60/);

// Create: first group is primary, the rest secondary, mapped to body-map slugs.
const id = await createCustom(db, { name: 'Hammer Strength Press', groups: ['chest', 'triceps'], equipment: 'machine', photoUri: 'file:///x.jpg' }, 1);
assert.match(id, /^c:/);
const [ex] = await listCustom(db);
assert.deepEqual([ex.primary, ex.secondary, ex.groups, ex.sources, ex.photoUri], [['chest'], ['triceps'], ['chest', 'triceps'], ['custom'], 'file:///x.jpg']);
await assert.rejects(createCustom(db, { name: 'hammer strength PRESS', groups: ['chest'], equipment: 'machine', photoUri: null }, 2), /already/);

// It is a normal recommendation candidate for its groups.
const recs = recommend(['chest'], [ex], [], { equipment: 'gym', experience: 'beginner' });
assert.deepEqual(recs[0].picks.map((p) => p.exerciseId), [id]);
// With a full catalog it still makes the cut: the user's own exercises lead the catalog fill.
const filler = Array.from({ length: 8 }, (_, i) => ({ ...ex, id: `r:x${i}`, name: `X${i}`, mechanic: 'compound' as const, sources: ['repdb' as const], photoUri: null }));
assert.equal(recommend(['chest'], [...filler, ex], [], { equipment: 'gym', experience: 'beginner' })[0].picks[0].exerciseId, id);
// ...and is filtered out for a dumbbells-only profile because it needs a machine.
assert.equal(recommend(['chest'], [ex], [], { equipment: 'dumbbells', experience: 'beginner' })[0].picks.length, 0);

// Update keeps the id; renaming onto itself is fine.
await updateCustom(db, id, { name: 'Hammer Strength Press', groups: ['shoulders'], equipment: 'machine', photoUri: null });
assert.deepEqual((await listCustom(db))[0].groups, ['shoulders']);

// Delete is blocked once sets reference it; allowed before.
const other = await createCustom(db, { name: 'Band Pull Apart', groups: ['back'], equipment: 'band', photoUri: null }, 3);
await deleteCustom(db, other);
assert.equal((await listCustom(db)).length, 1);
const s = await startSession(db, ['shoulders'], 10);
await addSet(db, s, id, { weightKg: 40, reps: 10, isWarmup: false }, 11);
assert.equal(await isLogged(db, id), true);
await assert.rejects(deleteCustom(db, id), /logged sets/);

console.log('custom ok');
