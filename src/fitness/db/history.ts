import type { Db } from '../../recipe-module/db/recipes.ts';
import type { MuscleGroup } from '../catalog-types.ts';
import type { PastSession } from '../recommend.ts';

/** Finished sessions, newest first, with the exercises logged in each. */
export async function listPastSessions(db: Db, limit = 60): Promise<PastSession[]> {
  const rows = await db.getAllAsync<{ id: number; started_at: number; groups: string; exercise_id: string | null }>(
    `SELECT s.id, s.started_at, s.groups, se.exercise_id
       FROM (SELECT * FROM sessions WHERE finished_at IS NOT NULL ORDER BY started_at DESC LIMIT ?) s
       LEFT JOIN session_exercises se ON se.session_id = s.id
      ORDER BY s.started_at DESC, se.position`,
    [limit],
  );
  const out = new Map<number, PastSession>();
  for (const r of rows) {
    let s = out.get(r.id);
    if (!s) {
      s = { startedAt: r.started_at, groups: JSON.parse(r.groups) as MuscleGroup[], exerciseIds: [] };
      out.set(r.id, s);
    }
    if (r.exercise_id) s.exerciseIds.push(r.exercise_id);
  }
  return [...out.values()];
}

export type TopSet = { weightKg: number; reps: number };

/** Heaviest working set (warm-ups excluded) from the most recent finished session of each exercise. */
export async function lastTopSets(db: Db, exerciseIds: string[]): Promise<Map<string, TopSet>> {
  if (!exerciseIds.length) return new Map();
  const rows = await db.getAllAsync<{ exercise_id: string; weight_kg: number; reps: number }>(
    `WITH latest AS (
       SELECT se.exercise_id, MAX(s.started_at) AS at
         FROM session_exercises se JOIN sessions s ON s.id = se.session_id
        WHERE s.finished_at IS NOT NULL AND se.exercise_id IN (${exerciseIds.map(() => '?').join(',')})
        GROUP BY se.exercise_id)
     SELECT se.exercise_id, st.weight_kg, st.reps
       FROM latest l
       JOIN sessions s ON s.started_at = l.at
       JOIN session_exercises se ON se.session_id = s.id AND se.exercise_id = l.exercise_id
       JOIN sets st ON st.session_exercise_id = se.id AND st.is_warmup = 0
      ORDER BY st.weight_kg DESC, st.reps DESC`,
    exerciseIds,
  );
  const out = new Map<string, TopSet>();
  for (const r of rows) if (!out.has(r.exercise_id)) out.set(r.exercise_id, { weightKg: r.weight_kg, reps: r.reps });
  return out;
}
