// Run: node scripts/check-fitness-schema.ts
// Applies fitness.db migrations to an in-memory SQLite and checks profile round-trip and constraints.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { getProfile, saveProfile, toKg } from '../src/fitness/db/profile.ts';
import { DATABASE_VERSION, migrate } from '../src/fitness/db/schema.ts';

const raw = new DatabaseSync(':memory:');
const db = {
  execAsync: async (sql: string) => raw.exec(sql),
  getFirstAsync: async <T>(sql: string, params: (string | number | null)[] = []) => (raw.prepare(sql).get(...params) as T) ?? null,
  getAllAsync: async <T>(sql: string, params: (string | number | null)[] = []) => raw.prepare(sql).all(...params) as T[],
  runAsync: async (sql: string, params: (string | number | null)[] = []) => ({ lastInsertRowId: Number(raw.prepare(sql).run(...params).lastInsertRowid) }),
};

await migrate(db);
await migrate(db); // idempotent
assert.equal((raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, DATABASE_VERSION);

// defaults match the locked requirements: kg, 2.5 step, 13-15 target, not onboarded
const p0 = await getProfile(db);
assert.deepEqual(p0, { units: 'kg', equipment: 'gym', experience: 'intermediate', bodyWeight: null, weightStep: 2.5, repMin: 13, repMax: 15, onboarded: false });

await saveProfile(db, { units: 'lb', equipment: 'dumbbells', experience: 'advanced', bodyWeight: toKg(176, 'lb'), onboarded: true });
const p1 = await getProfile(db);
assert.equal(p1.units, 'lb');
assert.equal(p1.equipment, 'dumbbells');
assert.equal(p1.onboarded, true);
assert.ok(Math.abs((p1.bodyWeight ?? 0) - 79.83) < 0.01, 'body weight stored in kg');

// single profile row, bad enums and impossible values rejected
assert.throws(() => raw.exec('INSERT INTO profile (id) VALUES (2)'));
await assert.rejects(saveProfile(db, { units: 'stone' as never }));
await assert.rejects(saveProfile(db, { bodyWeight: 5 }));
await assert.rejects(saveProfile(db, { repMin: 16 }));

// sets cascade with their session; reps must be positive
raw.exec('INSERT INTO sessions (started_at) VALUES (1)');
raw.exec("INSERT INTO session_exercises (session_id, exercise_id, position) VALUES (1, 'r:bench-press', 0)");
raw.exec('INSERT INTO sets (session_exercise_id, position, weight_kg, reps, is_warmup, done_at) VALUES (1, 0, 30, 4, 0, 2)');
assert.throws(() => raw.exec('INSERT INTO sets (session_exercise_id, position, weight_kg, reps, done_at) VALUES (1, 1, 30, 0, 2)'));
raw.exec('DELETE FROM sessions WHERE id = 1');
assert.equal((raw.prepare('SELECT COUNT(*) AS n FROM sets').get() as { n: number }).n, 0);

console.log('fitness schema ok');
