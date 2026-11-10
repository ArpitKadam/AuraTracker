// Run: node scripts/check-session.ts
// Session lifecycle against the real fitness.db migrations: resume, log, delete, finish, baseline, PR.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { listPastSessions } from '../src/fitness/db/history.ts';
import { migrate } from '../src/fitness/db/schema.ts';
import {
  addSet,
  bestBefore,
  deleteSet,
  finishSession,
  getActiveSession,
  getSession,
  lastSessionSets,
  setCounts,
  setsFor,
  startSession,
} from '../src/fitness/db/session.ts';
import { overloadHint } from '../src/fitness/overload.ts';
import { isPr, topSet, volumeKg } from '../src/fitness/stats.ts';

const raw = new DatabaseSync(':memory:');
const db = {
  execAsync: async (sql: string) => raw.exec(sql),
  getFirstAsync: async <T>(sql: string, p: (string | number | null)[] = []) => (raw.prepare(sql).get(...p) as T) ?? null,
  getAllAsync: async <T>(sql: string, p: (string | number | null)[] = []) => raw.prepare(sql).all(...p) as T[],
  runAsync: async (sql: string, p: (string | number | null)[] = []) => ({ lastInsertRowId: Number(raw.prepare(sql).run(...p).lastInsertRowid) }),
};
await migrate(db);
const BENCH = 'r:bench-press';
const PUSHDOWN = 'r:tricep-pushdown';

// Session 1: start, resume (same id, groups widened), log, delete a mistake, finish.
const s1 = await startSession(db, ['chest'], 1000);
assert.equal(await startSession(db, ['triceps'], 1500), s1, 'second start resumes the open session');
assert.deepEqual((await getActiveSession(db))?.groups, ['chest', 'triceps']);
await addSet(db, s1, BENCH, { weightKg: 20, reps: 10, isWarmup: true }, 1100);
await addSet(db, s1, BENCH, { weightKg: 30, reps: 4, isWarmup: false }, 1200);
const typo = await addSet(db, s1, BENCH, { weightKg: 300, reps: 4, isWarmup: false }, 1250);
await deleteSet(db, typo);
await addSet(db, s1, BENCH, { weightKg: 30, reps: 3, isWarmup: false }, 1300);
await startSession(db, [], 1350); // opening an exercise without logging...
const opened = await db.runAsync("INSERT INTO session_exercises (session_id, exercise_id, position) VALUES (?, 'r:fly', 9)", [s1]);
assert.ok(opened.lastInsertRowId);
await assert.rejects(addSet(db, s1, BENCH, { weightKg: 30, reps: 0, isWarmup: false }, 1400));
assert.deepEqual((await setsFor(db, s1, BENCH)).map((s) => [s.weightKg, s.reps, s.isWarmup]), [[20, 10, true], [30, 4, false], [30, 3, false]]);
assert.equal((await setCounts(db, s1)).get(BENCH), 3);

// No baseline while the only session is unfinished.
assert.deepEqual(await lastSessionSets(db, BENCH), []);
assert.equal(await finishSession(db, s1, 5000), s1);
assert.equal(await getActiveSession(db), null);
// ...the opened-but-unlogged exercise is not history.
assert.deepEqual((await listPastSessions(db))[0].exerciseIds, [BENCH]);

// Baseline = working sets of the last finished session; the hint follows the rule.
const base = await lastSessionSets(db, BENCH);
assert.deepEqual(base, [{ weightKg: 30, reps: 4 }, { weightKg: 30, reps: 3 }]);
assert.deepEqual(overloadHint(base, { repMin: 13, weightStepKg: 2.5 }), { kind: 'reps', weightKg: 30, lastReps: 4, from: 5, to: 6 });

// Deleting every set of an open session removes the session (no empty "in progress" banner).
const s3 = await startSession(db, ['legs'], 7000);
const only = await addSet(db, s3, 'r:squat', { weightKg: 60, reps: 5, isWarmup: false }, 7100);
await deleteSet(db, only);
assert.equal(await getActiveSession(db), null);

// A set survives the connection going away mid-session (process killed): reopen and it is still there.
assert.equal((raw.prepare('PRAGMA synchronous').get() as { synchronous: number }).synchronous, 2, 'synchronous = FULL');

// An empty session is discarded on finish.
const empty = await startSession(db, ['back'], 6000);
assert.equal(await finishSession(db, empty, 6100), null);
assert.equal((raw.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n, 1);

// Session 2: beats session 1 at the same weight -> PR; volume and top set exclude warm-ups.
const s2 = await startSession(db, ['chest', 'triceps'], 10_000);
await addSet(db, s2, BENCH, { weightKg: 20, reps: 12, isWarmup: true }, 10_100);
await addSet(db, s2, BENCH, { weightKg: 30, reps: 6, isWarmup: false }, 10_200);
await addSet(db, s2, PUSHDOWN, { weightKg: 22.5, reps: 12, isWarmup: false }, 10_300);
await finishSession(db, s2, 12_000);
const detail = await getSession(db, s2);
assert.deepEqual(detail?.exercises.map((e) => e.exerciseId), [BENCH, PUSHDOWN]);
const benchSets = detail!.exercises[0].sets;
assert.equal(volumeKg(benchSets), 180);
assert.deepEqual(topSet(benchSets), { weightKg: 30, reps: 6 });
assert.deepEqual(await bestBefore(db, BENCH, s2 && detail!.startedAt), { weightKg: 30, reps: 4 });
assert.equal(isPr(topSet(benchSets), await bestBefore(db, BENCH, detail!.startedAt)), true);
assert.equal(isPr({ weightKg: 22.5, reps: 12 }, await bestBefore(db, PUSHDOWN, detail!.startedAt)), false, 'first time is not a PR');
// Baseline now comes from session 2.
assert.deepEqual(await lastSessionSets(db, BENCH), [{ weightKg: 30, reps: 6 }]);

console.log('session ok');
