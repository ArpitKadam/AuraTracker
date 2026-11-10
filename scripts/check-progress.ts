// Run: node scripts/check-progress.ts
// Progress metrics, axis ticks, and the per-exercise history query (warm-ups and unfinished sessions excluded).
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { exerciseSessions } from '../src/fitness/db/history.ts';
import { migrate } from '../src/fitness/db/schema.ts';
import { addSet, finishSession, startSession } from '../src/fitness/db/session.ts';
import { epley, niceTicks, series } from '../src/fitness/progress.ts';

// Epley: 1 rep is the lift itself; 100 x 10 -> 133.3.
assert.equal(epley(100, 1), 100);
assert.ok(Math.abs(epley(100, 10) - 133.333) < 0.01);

const sessions = [
  { startedAt: 300, sets: [{ weightKg: 32.5, reps: 6 }] },
  { startedAt: 100, sets: [{ weightKg: 30, reps: 4 }, { weightKg: 30, reps: 3 }] },
  { startedAt: 200, sets: [] },
];
assert.deepEqual(series(sessions, 'top'), [{ t: 100, v: 30 }, { t: 300, v: 32.5 }], 'sorted, empty sessions dropped');
assert.deepEqual(series(sessions, 'volume').map((p) => p.v), [210, 195]);
assert.ok(Math.abs(series(sessions, 'e1rm')[0].v - epley(30, 4)) < 1e-9, 'best set of the session');

// Ticks cover the data with round steps; flat data still gets a band.
for (const [lo, hi] of [[30, 32.5], [180, 6840], [0, 1], [50, 50]] as const) {
  const t = niceTicks(lo, hi);
  assert.ok(t.length >= 2 && t.length <= 5, `${lo}-${hi}: ${t}`);
  assert.ok(t[0] <= lo && t[t.length - 1] >= hi, `${lo}-${hi} covered by ${t}`);
}

// Query: one entry per finished session, working sets only, oldest first, limited to the newest N.
const raw = new DatabaseSync(':memory:');
const db = {
  execAsync: async (sql: string) => raw.exec(sql),
  getFirstAsync: async <T>(sql: string, p: (string | number | null)[] = []) => (raw.prepare(sql).get(...p) as T) ?? null,
  getAllAsync: async <T>(sql: string, p: (string | number | null)[] = []) => raw.prepare(sql).all(...p) as T[],
  runAsync: async (sql: string, p: (string | number | null)[] = []) => ({ lastInsertRowId: Number(raw.prepare(sql).run(...p).lastInsertRowid) }),
};
await migrate(db);
const B = 'r:bench-press';
for (const [day, kg] of [[1, 25], [2, 27.5], [3, 30]] as const) {
  const s = await startSession(db, ['chest'], day * 1000);
  await addSet(db, s, B, { weightKg: 20, reps: 10, isWarmup: true }, day * 1000 + 1);
  await addSet(db, s, B, { weightKg: kg, reps: 5, isWarmup: false }, day * 1000 + 2);
  await finishSession(db, s, day * 1000 + 500);
}
const open = await startSession(db, ['chest'], 9000);
await addSet(db, open, B, { weightKg: 99, reps: 1, isWarmup: false }, 9001);

const all = await exerciseSessions(db, B);
assert.deepEqual(all.map((s) => s.startedAt), [1000, 2000, 3000]);
assert.deepEqual(all[2].sets, [{ weightKg: 30, reps: 5 }], 'warm-up excluded, open session excluded');
assert.deepEqual((await exerciseSessions(db, B, 2)).map((s) => s.startedAt), [2000, 3000], 'newest N, oldest first');

console.log('progress ok');
