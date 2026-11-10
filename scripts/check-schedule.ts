// Run: node scripts/check-schedule.ts
// Split defaults, editing, skip / postpone / undo, and the migration from schema 1 to 2.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { MIGRATIONS, migrate } from '../src/fitness/db/schema.ts';
import { getOverrides, getSplit, postponeDay, saveSplitDay, skipDay, undoDay } from '../src/fitness/db/split.ts';
import { DEFAULT_SPLIT, dayStatus, isoDate, postponeTarget } from '../src/fitness/schedule.ts';

const raw = new DatabaseSync(':memory:');
const db = {
  execAsync: async (sql: string) => raw.exec(sql),
  getFirstAsync: async <T>(sql: string, p: (string | number | null)[] = []) => (raw.prepare(sql).get(...p) as T) ?? null,
  getAllAsync: async <T>(sql: string, p: (string | number | null)[] = []) => raw.prepare(sql).all(...p) as T[],
  runAsync: async (sql: string, p: (string | number | null)[] = []) => ({ lastInsertRowId: Number(raw.prepare(sql).run(...p).lastInsertRowid) }),
};

// Existing installs are on schema 1: data there must survive the upgrade to 2.
raw.exec(`BEGIN;${MIGRATIONS[1]}PRAGMA user_version = 1;COMMIT;`);
raw.exec("UPDATE profile SET onboarded = 1, body_weight = 71 WHERE id = 1");
await migrate(db);
assert.equal((raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 2);
assert.equal((raw.prepare('SELECT body_weight FROM profile').get() as { body_weight: number }).body_weight, 71, 'profile kept');

// The seeded split is the user's schedule.
assert.deepEqual(await getSplit(db), DEFAULT_SPLIT);
const tue = new Date(2026, 10, 10); // Tue 10 Nov 2026
const sun = new Date(2026, 10, 15);
assert.equal(isoDate(tue), '2026-11-10');
assert.deepEqual(dayStatus(tue, DEFAULT_SPLIT, new Map()), { kind: 'planned', plan: { primary: ['chest'], secondary: ['triceps', 'abs'] } });
assert.deepEqual(dayStatus(sun, DEFAULT_SPLIT, new Map()), { kind: 'rest' });

// Editing a day: duplicates collapse, a group can't be both primary and secondary.
await saveSplitDay(db, 0, { primary: ['legs', 'legs'], secondary: ['legs', 'abs'] });
assert.deepEqual((await getSplit(db))[0], { primary: ['legs'], secondary: ['abs'] });
await assert.rejects(saveSplitDay(db, 7, { primary: [], secondary: [] }));
await saveSplitDay(db, 0, { primary: [], secondary: [] }); // back to rest

// Skip: the day is marked off, nothing moves.
const plan = DEFAULT_SPLIT[2];
await skipDay(db, tue, plan);
assert.equal(dayStatus(tue, await getSplit(db), await getOverrides(db, tue)).kind, 'skipped');
await undoDay(db, tue);
assert.equal(dayStatus(tue, await getSplit(db), await getOverrides(db, tue)).kind, 'planned');

// Postpone: Tuesday's chest day moves to Sunday (the next rest day); Sunday shows it, Tuesday points to it.
const to = await postponeDay(db, tue, plan);
assert.equal(to && isoDate(to), '2026-11-15');
let ov = await getOverrides(db, tue);
assert.deepEqual(dayStatus(tue, await getSplit(db), ov), { kind: 'postponed', plan, to: '2026-11-15' });
assert.deepEqual(dayStatus(sun, await getSplit(db), ov), { kind: 'moved', plan, from: '2026-11-10' });
// A second postpone in the same week can't land on the already-used Sunday.
assert.equal(isoDate(postponeTarget(new Date(2026, 10, 11), DEFAULT_SPLIT, ov)!), '2026-11-22');
// Undo removes both halves.
await undoDay(db, tue);
ov = await getOverrides(db, tue);
assert.equal(ov.size, 0);

// No rest day in the week -> postpone is refused rather than inventing one.
for (let d = 0; d < 7; d++) await saveSplitDay(db, d, { primary: ['legs'], secondary: [] });
assert.equal(await postponeDay(db, tue, plan), null);

// Bad dates are rejected by the table.
assert.throws(() => raw.exec("INSERT INTO plan_overrides (date, kind) VALUES ('10/11/2026', 'skip')"));

console.log('schedule ok');
