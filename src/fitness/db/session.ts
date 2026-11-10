import type { Db } from '../../recipe-module/db/recipes.ts';
import type { MuscleGroup } from '../catalog-types.ts';
import type { WorkingSet } from '../overload.ts';

export type ActiveSession = { id: number; startedAt: number; groups: MuscleGroup[] };
export type LoggedSet = { id: number; position: number; weightKg: number; reps: number; isWarmup: boolean; doneAt: number };

type SetRow = { id: number; position: number; weight_kg: number; reps: number; is_warmup: number; done_at: number };
const toSet = (r: SetRow): LoggedSet => ({
  id: r.id,
  position: r.position,
  weightKg: r.weight_kg,
  reps: r.reps,
  isWarmup: r.is_warmup === 1,
  doneAt: r.done_at,
});

/** The unfinished session, if any. There is at most one: startSession reuses it. */
export async function getActiveSession(db: Db): Promise<ActiveSession | null> {
  const r = await db.getFirstAsync<{ id: number; started_at: number; groups: string }>(
    'SELECT id, started_at, groups FROM sessions WHERE finished_at IS NULL ORDER BY started_at DESC LIMIT 1',
    [],
  );
  return r ? { id: r.id, startedAt: r.started_at, groups: JSON.parse(r.groups) } : null;
}

/** Returns the active session, widening its groups if needed, or starts a new one. */
export async function startSession(db: Db, groups: MuscleGroup[], now: number): Promise<number> {
  const active = await getActiveSession(db);
  if (active) {
    const merged = [...new Set([...active.groups, ...groups])];
    if (merged.length !== active.groups.length) await db.runAsync('UPDATE sessions SET groups = ? WHERE id = ?', [JSON.stringify(merged), active.id]);
    return active.id;
  }
  const r = await db.runAsync('INSERT INTO sessions (started_at, groups) VALUES (?, ?)', [now, JSON.stringify(groups)]);
  return r.lastInsertRowId;
}

async function sessionExerciseId(db: Db, sessionId: number, exerciseId: string): Promise<number> {
  const hit = await db.getFirstAsync<{ id: number }>('SELECT id FROM session_exercises WHERE session_id = ? AND exercise_id = ?', [sessionId, exerciseId]);
  if (hit) return hit.id;
  const pos = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM session_exercises WHERE session_id = ?', [sessionId]);
  const r = await db.runAsync('INSERT INTO session_exercises (session_id, exercise_id, position) VALUES (?, ?, ?)', [sessionId, exerciseId, pos?.n ?? 0]);
  return r.lastInsertRowId;
}

export async function addSet(
  db: Db,
  sessionId: number,
  exerciseId: string,
  set: { weightKg: number; reps: number; isWarmup: boolean },
  now: number,
): Promise<number> {
  if (!(set.reps > 0) || !(set.weightKg >= 0)) throw new Error('reps must be > 0 and weight >= 0');
  const seId = await sessionExerciseId(db, sessionId, exerciseId);
  const pos = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sets WHERE session_exercise_id = ?', [seId]);
  const r = await db.runAsync(
    'INSERT INTO sets (session_exercise_id, position, weight_kg, reps, is_warmup, done_at) VALUES (?, ?, ?, ?, ?, ?)',
    [seId, pos?.n ?? 0, set.weightKg, set.reps, set.isWarmup ? 1 : 0, now],
  );
  return r.lastInsertRowId;
}

export async function deleteSet(db: Db, setId: number): Promise<void> {
  await db.runAsync('DELETE FROM sets WHERE id = ?', [setId]);
}

export async function setsFor(db: Db, sessionId: number, exerciseId: string): Promise<LoggedSet[]> {
  const rows = await db.getAllAsync<SetRow>(
    `SELECT st.id, st.position, st.weight_kg, st.reps, st.is_warmup, st.done_at
       FROM sets st JOIN session_exercises se ON se.id = st.session_exercise_id
      WHERE se.session_id = ? AND se.exercise_id = ?
      ORDER BY st.done_at, st.id`,
    [sessionId, exerciseId],
  );
  return rows.map(toSet);
}

/** Set counts per exercise in a session (for the plan screen). */
export async function setCounts(db: Db, sessionId: number): Promise<Map<string, number>> {
  const rows = await db.getAllAsync<{ exercise_id: string; n: number }>(
    `SELECT se.exercise_id, COUNT(st.id) AS n FROM session_exercises se
       LEFT JOIN sets st ON st.session_exercise_id = se.id
      WHERE se.session_id = ? GROUP BY se.exercise_id`,
    [sessionId],
  );
  return new Map(rows.map((r) => [r.exercise_id, r.n]));
}

/** Working sets of this exercise from its most recent finished session (the overload baseline). */
export async function lastSessionSets(db: Db, exerciseId: string): Promise<WorkingSet[]> {
  const rows = await db.getAllAsync<{ weight_kg: number; reps: number }>(
    `SELECT st.weight_kg, st.reps
       FROM sets st JOIN session_exercises se ON se.id = st.session_exercise_id
      WHERE st.is_warmup = 0 AND se.id = (
        SELECT se2.id FROM session_exercises se2 JOIN sessions s ON s.id = se2.session_id
         WHERE se2.exercise_id = ? AND s.finished_at IS NOT NULL
           AND EXISTS (SELECT 1 FROM sets x WHERE x.session_exercise_id = se2.id AND x.is_warmup = 0)
         ORDER BY s.started_at DESC LIMIT 1)
      ORDER BY st.position`,
    [exerciseId],
  );
  return rows.map((r) => ({ weightKg: r.weight_kg, reps: r.reps }));
}

/** Finishes the session. A session with no sets is deleted instead; returns null then. */
export async function finishSession(db: Db, sessionId: number, now: number): Promise<number | null> {
  const n = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(st.id) AS n FROM session_exercises se JOIN sets st ON st.session_exercise_id = se.id WHERE se.session_id = ?',
    [sessionId],
  );
  if (!n?.n) {
    await db.runAsync('DELETE FROM sessions WHERE id = ?', [sessionId]);
    return null;
  }
  // Drop exercises that were opened but never logged, so they don't count as history.
  await db.runAsync('DELETE FROM session_exercises WHERE session_id = ? AND id NOT IN (SELECT session_exercise_id FROM sets)', [sessionId]);
  await db.runAsync('UPDATE sessions SET finished_at = ? WHERE id = ?', [now, sessionId]);
  return sessionId;
}

export type SessionDetail = {
  id: number;
  startedAt: number;
  finishedAt: number | null;
  groups: MuscleGroup[];
  exercises: { exerciseId: string; sets: LoggedSet[] }[];
};

export async function getSession(db: Db, sessionId: number): Promise<SessionDetail | null> {
  const s = await db.getFirstAsync<{ id: number; started_at: number; finished_at: number | null; groups: string }>(
    'SELECT id, started_at, finished_at, groups FROM sessions WHERE id = ?',
    [sessionId],
  );
  if (!s) return null;
  const rows = await db.getAllAsync<SetRow & { exercise_id: string }>(
    `SELECT se.exercise_id, st.id, st.position, st.weight_kg, st.reps, st.is_warmup, st.done_at
       FROM session_exercises se JOIN sets st ON st.session_exercise_id = se.id
      WHERE se.session_id = ? ORDER BY se.position, st.position`,
    [sessionId],
  );
  const byEx = new Map<string, LoggedSet[]>();
  for (const r of rows) byEx.set(r.exercise_id, [...(byEx.get(r.exercise_id) ?? []), toSet(r)]);
  return {
    id: s.id,
    startedAt: s.started_at,
    finishedAt: s.finished_at,
    groups: JSON.parse(s.groups),
    exercises: [...byEx.entries()].map(([exerciseId, sets]) => ({ exerciseId, sets })),
  };
}

/** Best working set of an exercise in finished sessions that started before `before` (PR baseline). */
export async function bestBefore(db: Db, exerciseId: string, before: number): Promise<WorkingSet | null> {
  const r = await db.getFirstAsync<{ weight_kg: number; reps: number }>(
    `SELECT st.weight_kg, st.reps
       FROM sets st JOIN session_exercises se ON se.id = st.session_exercise_id JOIN sessions s ON s.id = se.session_id
      WHERE se.exercise_id = ? AND st.is_warmup = 0 AND s.finished_at IS NOT NULL AND s.started_at < ?
      ORDER BY st.weight_kg DESC, st.reps DESC LIMIT 1`,
    [exerciseId, before],
  );
  return r ? { weightKg: r.weight_kg, reps: r.reps } : null;
}
