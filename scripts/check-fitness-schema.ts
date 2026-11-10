// Run: node scripts/check-fitness-schema.ts
// Applies fitness.db migrations to an in-memory SQLite and checks profile round-trip and constraints.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { lastTopSets, listPastSessions } from '../src/fitness/db/history.ts';
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

// history: unfinished sessions ignored; last top set = heaviest working set of the latest session, warm-ups excluded
const sess = (started: number, finished: number | null, groups: string[]) =>
  Number(raw.prepare('INSERT INTO sessions (started_at, finished_at, groups) VALUES (?,?,?)').run(started, finished, JSON.stringify(groups)).lastInsertRowid);
const exr = (sid: number, id: string, pos: number) =>
  Number(raw.prepare('INSERT INTO session_exercises (session_id, exercise_id, position) VALUES (?,?,?)').run(sid, id, pos).lastInsertRowid);
const set = (seid: number, pos: number, kg: number, reps: number, warm = 0) =>
  raw.prepare('INSERT INTO sets (session_exercise_id, position, weight_kg, reps, is_warmup, done_at) VALUES (?,?,?,?,?,1)').run(seid, pos, kg, reps, warm);
const a = sess(100, 200, ['chest']);
let e = exr(a, 'r:bench-press', 0); set(e, 0, 25, 8); set(e, 1, 27.5, 6);
const b = sess(300, 400, ['chest', 'triceps']);
e = exr(b, 'r:bench-press', 0); set(e, 0, 40, 10, 1); set(e, 1, 30, 4); set(e, 2, 30, 5);
exr(b, 'r:tricep-pushdown', 1);
const open = sess(500, null, ['back']);
exr(open, 'r:row', 0);
const past = await listPastSessions(db);
assert.deepEqual(past.map((p) => p.startedAt), [300, 100]);
assert.deepEqual(past[0], { startedAt: 300, groups: ['chest', 'triceps'], exerciseIds: ['r:bench-press', 'r:tricep-pushdown'] });
const tops = await lastTopSets(db, ['r:bench-press', 'r:tricep-pushdown', 'r:row']);
assert.deepEqual(tops.get('r:bench-press'), { weightKg: 30, reps: 5 });
assert.equal(tops.has('r:tricep-pushdown'), false, 'no sets logged, so no top set');
assert.equal(tops.has('r:row'), false, 'unfinished session ignored');

console.log('fitness schema ok');
