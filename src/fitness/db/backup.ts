// Fitness backup: one JSON file with profile, custom exercises, sessions and sets.
// Import is a trust boundary (the file can come from anywhere), so validateBackup checks every field
// before importData replaces the database in a single transaction.
import type { Db } from '../../recipe-module/db/recipes.ts';
import type { Equipment, MuscleGroup } from '../catalog-types.ts';
import { GROUPS } from '../groups.ts';
import type { Split } from '../schedule.ts';
import { DATABASE_VERSION } from './schema.ts';
import { getSplit, saveSplitDay } from './split.ts';

export const BACKUP_APP = 'auratracker-fitness';

export type BackupSet = { weightKg: number; reps: number; isWarmup: boolean; doneAt: number };
export type BackupSession = {
  startedAt: number;
  finishedAt: number | null;
  groups: MuscleGroup[];
  exercises: { exerciseId: string; sets: BackupSet[] }[];
};
export type BackupCustom = { id: string; name: string; primary: string[]; secondary: string[]; groups: MuscleGroup[]; equipment: Equipment; createdAt: number };
export type BackupProfile = {
  units: 'kg' | 'lb';
  equipment: 'gym' | 'dumbbells' | 'bodyweight';
  experience: 'beginner' | 'intermediate' | 'advanced';
  bodyWeight: number | null;
  weightStep: number;
  repMin: number;
  repMax: number;
  onboarded: boolean;
};
export type Backup = {
  app: typeof BACKUP_APP;
  schema: number;
  exportedAt: number;
  profile: BackupProfile;
  customExercises: BackupCustom[];
  sessions: BackupSession[];
  /** Weekly split (schema 2+). Older backups have none; importing them keeps the current split. */
  split?: Split;
};

type TxDb = Db & { execAsync(sql: string): Promise<unknown> };

export async function exportData(db: Db, now: number): Promise<Backup> {
  const p = await db.getFirstAsync<{
    units: BackupProfile['units'];
    equipment: BackupProfile['equipment'];
    experience: BackupProfile['experience'];
    body_weight: number | null;
    weight_step: number;
    rep_min: number;
    rep_max: number;
    onboarded: number;
  }>('SELECT * FROM profile WHERE id = 1', []);
  if (!p) throw new Error('No profile to export');

  const custom = await db.getAllAsync<{ id: string; name: string; primary_m: string; secondary: string; groups: string; equipment: Equipment; created_at: number }>(
    'SELECT * FROM custom_exercises ORDER BY created_at',
    [],
  );
  const rows = await db.getAllAsync<{
    sid: number;
    started_at: number;
    finished_at: number | null;
    groups: string;
    exercise_id: string | null;
    weight_kg: number | null;
    reps: number | null;
    is_warmup: number | null;
    done_at: number | null;
  }>(
    `SELECT s.id AS sid, s.started_at, s.finished_at, s.groups, se.exercise_id, st.weight_kg, st.reps, st.is_warmup, st.done_at
       FROM sessions s
       LEFT JOIN session_exercises se ON se.session_id = s.id
       LEFT JOIN sets st ON st.session_exercise_id = se.id
      ORDER BY s.started_at, s.id, se.position, st.position`,
    [],
  );
  const sessions = new Map<number, BackupSession>();
  for (const r of rows) {
    let s = sessions.get(r.sid);
    if (!s) {
      s = { startedAt: r.started_at, finishedAt: r.finished_at, groups: JSON.parse(r.groups), exercises: [] };
      sessions.set(r.sid, s);
    }
    if (r.exercise_id === null) continue;
    let ex = s.exercises.find((e) => e.exerciseId === r.exercise_id);
    if (!ex) s.exercises.push((ex = { exerciseId: r.exercise_id, sets: [] }));
    if (r.weight_kg !== null) ex.sets.push({ weightKg: r.weight_kg, reps: r.reps!, isWarmup: r.is_warmup === 1, doneAt: r.done_at! });
  }

  return {
    app: BACKUP_APP,
    schema: DATABASE_VERSION,
    exportedAt: now,
    profile: {
      units: p.units,
      equipment: p.equipment,
      experience: p.experience,
      bodyWeight: p.body_weight,
      weightStep: p.weight_step,
      repMin: p.rep_min,
      repMax: p.rep_max,
      onboarded: p.onboarded === 1,
    },
    customExercises: custom.map((c) => ({
      id: c.id,
      name: c.name,
      primary: JSON.parse(c.primary_m),
      secondary: JSON.parse(c.secondary),
      groups: JSON.parse(c.groups),
      equipment: c.equipment,
      createdAt: c.created_at,
    })),
    sessions: [...sessions.values()],
    split: await getSplit(db),
  };
}

// ---- validation -------------------------------------------------------------------------------

const LIMITS = { sessions: 20_000, exercisesPerSession: 100, setsPerExercise: 200, custom: 2_000, name: 60 };
const GROUP_IDS = new Set<string>(GROUPS.map((g) => g.id));
const SLUGS = new Set<string>(GROUPS.flatMap((g) => g.slugs).concat('neck'));
const EQUIPMENT = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'band', 'bodyweight', 'ez-bar', 'other']);

class BackupError extends Error {}
const fail = (path: string, what: string): never => {
  throw new BackupError(`Not a valid AuraTracker backup (${path}: ${what})`);
};
const obj = (v: unknown, path: string) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(path, 'expected an object'));
const arr = (v: unknown, path: string, max: number) => (Array.isArray(v) ? (v.length <= max ? v : fail(path, `more than ${max} items`)) : fail(path, 'expected a list'));
const num = (v: unknown, path: string, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail(path, `expected a number from ${min} to ${max}`);
const int = (v: unknown, path: string, min: number, max: number) => (Number.isInteger(num(v, path, min, max)) ? (v as number) : fail(path, 'expected a whole number'));
const time = (v: unknown, path: string) => int(v, path, 0, 4_102_444_800_000); // up to 2100
const oneOf = <T extends string>(v: unknown, path: string, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : fail(path, `expected one of ${allowed.join(', ')}`));
const str = (v: unknown, path: string, max: number) => (typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v : fail(path, 'expected text'));
const groupList = (v: unknown, path: string) => arr(v, path, GROUPS.length).map((g, i) => (GROUP_IDS.has(g as string) ? (g as MuscleGroup) : fail(`${path}[${i}]`, 'unknown muscle group')));
const slugList = (v: unknown, path: string) => arr(v, path, 20).map((s, i) => (SLUGS.has(s as string) ? (s as string) : fail(`${path}[${i}]`, 'unknown muscle')));
const exerciseId = (v: unknown, path: string) =>
  typeof v === 'string' && /^[rfc]:[A-Za-z0-9_.'()-]{1,120}$/.test(v) ? v : fail(path, 'bad exercise id');

export function validateBackup(input: unknown): Backup {
  const root = obj(input, 'file');
  if (root.app !== BACKUP_APP) fail('app', 'this file is not an AuraTracker fitness backup');
  const schema = int(root.schema, 'schema', 1, 1000);
  if (schema > DATABASE_VERSION) fail('schema', 'made by a newer version of the app; update first');

  const p = obj(root.profile, 'profile');
  const units = oneOf(p.units, 'profile.units', ['kg', 'lb'] as const);
  const repMin = int(p.repMin, 'profile.repMin', 1, 100);
  const profile: BackupProfile = {
    units,
    equipment: oneOf(p.equipment, 'profile.equipment', ['gym', 'dumbbells', 'bodyweight'] as const),
    experience: oneOf(p.experience, 'profile.experience', ['beginner', 'intermediate', 'advanced'] as const),
    bodyWeight: p.bodyWeight === null ? null : num(p.bodyWeight, 'profile.bodyWeight', 20, 400),
    weightStep: num(p.weightStep, 'profile.weightStep', 0.1, 50),
    repMin,
    repMax: int(p.repMax, 'profile.repMax', repMin, 100),
    onboarded: typeof p.onboarded === 'boolean' ? p.onboarded : fail('profile.onboarded', 'expected true or false'),
  };

  const seen = new Set<string>();
  const customExercises = arr(root.customExercises, 'customExercises', LIMITS.custom).map((c0, i) => {
    const path = `customExercises[${i}]`;
    const c = obj(c0, path);
    const id = exerciseId(c.id, `${path}.id`);
    if (!id.startsWith('c:')) fail(`${path}.id`, 'custom ids start with c:');
    const name = str(c.name, `${path}.name`, LIMITS.name).trim();
    const key = name.toLowerCase();
    if (seen.has(id) || seen.has(key)) fail(path, 'duplicate custom exercise');
    seen.add(id).add(key);
    const groups = groupList(c.groups, `${path}.groups`);
    if (!groups.length) fail(`${path}.groups`, 'needs at least one group');
    return {
      id,
      name,
      primary: slugList(c.primary, `${path}.primary`),
      secondary: slugList(c.secondary, `${path}.secondary`),
      groups,
      equipment: EQUIPMENT.has(c.equipment as string) ? (c.equipment as Equipment) : fail(`${path}.equipment`, 'unknown equipment'),
      createdAt: time(c.createdAt, `${path}.createdAt`),
    };
  });

  let open = 0;
  const sessions = arr(root.sessions, 'sessions', LIMITS.sessions).map((s0, i) => {
    const path = `sessions[${i}]`;
    const s = obj(s0, path);
    const startedAt = time(s.startedAt, `${path}.startedAt`);
    const finishedAt = s.finishedAt === null ? null : time(s.finishedAt, `${path}.finishedAt`);
    if (finishedAt !== null && finishedAt < startedAt) fail(`${path}.finishedAt`, 'before the start');
    if (finishedAt === null && ++open > 1) fail(path, 'more than one unfinished workout');
    const exercises = arr(s.exercises, `${path}.exercises`, LIMITS.exercisesPerSession).map((e0, j) => {
      const ep = `${path}.exercises[${j}]`;
      const e = obj(e0, ep);
      return {
        exerciseId: exerciseId(e.exerciseId, `${ep}.exerciseId`),
        sets: arr(e.sets, `${ep}.sets`, LIMITS.setsPerExercise).map((x0, k) => {
          const sp = `${ep}.sets[${k}]`;
          const x = obj(x0, sp);
          return {
            weightKg: num(x.weightKg, `${sp}.weightKg`, 0, 1000),
            reps: int(x.reps, `${sp}.reps`, 1, 200),
            isWarmup: typeof x.isWarmup === 'boolean' ? x.isWarmup : fail(`${sp}.isWarmup`, 'expected true or false'),
            doneAt: time(x.doneAt, `${sp}.doneAt`),
          };
        }),
      };
    });
    return { startedAt, finishedAt, groups: groupList(s.groups, `${path}.groups`), exercises };
  });

  let split: Split | undefined;
  if (root.split !== undefined) {
    const days = arr(root.split, 'split', 7);
    if (days.length !== 7) fail('split', 'expected 7 days');
    split = days.map((d0, i) => {
      const d = obj(d0, `split[${i}]`);
      return { primary: groupList(d.primary, `split[${i}].primary`), secondary: groupList(d.secondary, `split[${i}].secondary`) };
    });
  }

  return { app: BACKUP_APP, schema, exportedAt: time(root.exportedAt, 'exportedAt'), profile, customExercises, sessions, ...(split ? { split } : {}) };
}

export function parseBackup(text: string): Backup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError('Not a valid AuraTracker backup (the file is not JSON)');
  }
  return validateBackup(json);
}

export const backupCounts = (b: Backup) => ({
  sessions: b.sessions.length,
  sets: b.sessions.reduce((n, s) => n + s.exercises.reduce((m, e) => m + e.sets.length, 0), 0),
  custom: b.customExercises.length,
});

// ---- import -----------------------------------------------------------------------------------

/** Replaces all fitness data with the (already validated) backup. All or nothing. */
export async function importData(db: TxDb, b: Backup): Promise<void> {
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    await db.execAsync('DELETE FROM sets; DELETE FROM session_exercises; DELETE FROM sessions; DELETE FROM custom_exercises;');
    const p = b.profile;
    await db.runAsync(
      'UPDATE profile SET units = ?, equipment = ?, experience = ?, body_weight = ?, weight_step = ?, rep_min = ?, rep_max = ?, onboarded = ? WHERE id = 1',
      [p.units, p.equipment, p.experience, p.bodyWeight, p.weightStep, p.repMin, p.repMax, p.onboarded ? 1 : 0],
    );
    for (const c of b.customExercises) {
      await db.runAsync(
        'INSERT INTO custom_exercises (id, name, primary_m, secondary, groups, equipment, photo_uri, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)',
        [c.id, c.name, JSON.stringify(c.primary), JSON.stringify(c.secondary), JSON.stringify(c.groups), c.equipment, c.createdAt],
      );
    }
    for (const s of b.sessions) {
      const sid = (await db.runAsync('INSERT INTO sessions (started_at, finished_at, groups) VALUES (?, ?, ?)', [s.startedAt, s.finishedAt, JSON.stringify(s.groups)]))
        .lastInsertRowId;
      for (const [pos, e] of s.exercises.entries()) {
        const seid = (await db.runAsync('INSERT INTO session_exercises (session_id, exercise_id, position) VALUES (?, ?, ?)', [sid, e.exerciseId, pos]))
          .lastInsertRowId;
        for (const [k, x] of e.sets.entries()) {
          await db.runAsync('INSERT INTO sets (session_exercise_id, position, weight_kg, reps, is_warmup, done_at) VALUES (?, ?, ?, ?, ?, ?)', [
            seid,
            k,
            x.weightKg,
            x.reps,
            x.isWarmup ? 1 : 0,
            x.doneAt,
          ]);
        }
      }
    }
    if (b.split) for (const [day, plan] of b.split.entries()) await saveSplitDay(db, day, plan);
    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}
