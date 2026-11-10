// Run: node scripts/check-backup.ts
// Export -> wipe -> import round-trip is identical; bad files are rejected and leave the data untouched.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { backupCounts, exportData, importData, parseBackup } from '../src/fitness/db/backup.ts';
import { createCustom } from '../src/fitness/db/custom.ts';
import { saveProfile } from '../src/fitness/db/profile.ts';
import { migrate } from '../src/fitness/db/schema.ts';
import { addSet, finishSession, startSession } from '../src/fitness/db/session.ts';

const open = () => {
  const raw = new DatabaseSync(':memory:');
  return {
    raw,
    db: {
      execAsync: async (sql: string) => raw.exec(sql),
      getFirstAsync: async <T>(sql: string, p: (string | number | null)[] = []) => (raw.prepare(sql).get(...p) as T) ?? null,
      getAllAsync: async <T>(sql: string, p: (string | number | null)[] = []) => raw.prepare(sql).all(...p) as T[],
      runAsync: async (sql: string, p: (string | number | null)[] = []) => ({ lastInsertRowId: Number(raw.prepare(sql).run(...p).lastInsertRowid) }),
    },
  };
};

// Source data: profile, a custom exercise, two finished sessions with warm-ups, one open session.
const A = open();
await migrate(A.db);
await saveProfile(A.db, { units: 'kg', equipment: 'gym', experience: 'intermediate', bodyWeight: 71, onboarded: true });
const custom = await createCustom(A.db, { name: 'Hammer Press', groups: ['chest', 'triceps'], equipment: 'machine', photoUri: 'file:///p.jpg' }, 5);
for (const [day, kg] of [[1, 30], [2, 32.5]] as const) {
  const s = await startSession(A.db, ['chest', 'triceps'], day * 1e8);
  await addSet(A.db, s, 'r:bench-press', { weightKg: 20, reps: 10, isWarmup: true }, day * 1e8 + 1);
  await addSet(A.db, s, 'r:bench-press', { weightKg: kg, reps: 5, isWarmup: false }, day * 1e8 + 2);
  await addSet(A.db, s, custom, { weightKg: 40, reps: 12, isWarmup: false }, day * 1e8 + 3);
  await finishSession(A.db, s, day * 1e8 + 4000);
}
const live = await startSession(A.db, ['back'], 3e8);
await addSet(A.db, live, 'f:Pullups', { weightKg: 0, reps: 8, isWarmup: false }, 3e8 + 1);

const exported = await exportData(A.db, 9e8);
const text = JSON.stringify(exported);
assert.deepEqual(backupCounts(exported), { sessions: 3, sets: 7, custom: 1 });

// Round-trip into a fresh DB that already holds other data: everything is replaced, nothing merged.
const B = open();
await migrate(B.db);
await createCustom(B.db, { name: 'Old Junk', groups: ['legs'], equipment: 'other', photoUri: null }, 1);
const junk = await startSession(B.db, ['legs'], 1);
await addSet(B.db, junk, 'r:squat', { weightKg: 100, reps: 5, isWarmup: false }, 2);
await importData(B.db, parseBackup(text));
const again = await exportData(B.db, 9e8);
// Photos are files on the phone, not in the JSON: imported custom exercises come back without one.
assert.deepEqual(again, exported);
assert.equal((B.raw.prepare('SELECT photo_uri FROM custom_exercises').get() as { photo_uri: string | null }).photo_uri, null);
assert.equal((B.raw.prepare("SELECT COUNT(*) AS n FROM custom_exercises WHERE name = 'Old Junk'").get() as { n: number }).n, 0);

// Bad files are rejected before anything is written.
const before = await exportData(B.db, 9e8);
const bad = (mutate: (o: Record<string, unknown>) => void) => {
  const o = JSON.parse(text);
  mutate(o);
  return JSON.stringify(o);
};
const cases: [string, string, RegExp][] = [
  ['not json', '{oops', /not JSON/],
  ['other app', JSON.stringify({ app: 'something-else' }), /not an AuraTracker/],
  ['newer schema', bad((o) => (o.schema = 999)), /newer version/],
  ['negative reps', bad((o) => ((o.sessions as any)[0].exercises[0].sets[0].reps = -3)), /reps/],
  ['huge weight', bad((o) => ((o.sessions as any)[0].exercises[0].sets[1].weightKg = 1e9)), /weightKg/],
  ['unknown group', bad((o) => ((o.sessions as any)[0].groups = ['wings'])), /muscle group/],
  ['sql-ish id', bad((o) => ((o.sessions as any)[0].exercises[0].exerciseId = "r:x'; DROP TABLE sets;--")), /exercise id/],
  ['two open sessions', bad((o) => ((o.sessions as any)[0].finishedAt = null)), /unfinished/],
  ['bad units', bad((o) => ((o.profile as any).units = 'stone')), /units/],
  ['duplicate custom', bad((o) => (o.customExercises as unknown[]).push((o.customExercises as unknown[])[0])), /duplicate/],
];
for (const [label, payload, msg] of cases) assert.throws(() => parseBackup(payload), msg, label);
assert.deepEqual(await exportData(B.db, 9e8), before, 'rejected files changed nothing');

// A failure mid-import rolls back to the previous data.
const broken = parseBackup(text);
(broken.sessions[1].exercises[0].sets[0] as { reps: number }).reps = 0; // passes JSON types, violates the DB CHECK
await assert.rejects(importData(B.db, broken));
assert.deepEqual(await exportData(B.db, 9e8), before, 'rolled back');

console.log('backup ok');
