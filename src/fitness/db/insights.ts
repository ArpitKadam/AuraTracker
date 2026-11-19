import type { Db } from '../../recipe-module/db/recipes.ts';
import type { MuscleGroup } from '../catalog-types.ts';
import type { InsightSession } from '../insights.ts';

/** Every finished session with its exercises and sets (position order), oldest first: the Stats screen input. */
export async function loadInsightSessions(db: Db): Promise<InsightSession[]> {
  const rows = await db.getAllAsync<{
    id: number;
    started_at: number;
    finished_at: number;
    groups: string;
    se_id: number;
    exercise_id: string;
    weight_kg: number;
    reps: number;
    is_warmup: number;
    done_at: number;
  }>(
    `SELECT s.id, s.started_at, s.finished_at, s.groups, se.id AS se_id, se.exercise_id,
            st.weight_kg, st.reps, st.is_warmup, st.done_at
       FROM sessions s
       JOIN session_exercises se ON se.session_id = s.id
       JOIN sets st ON st.session_exercise_id = se.id
      WHERE s.finished_at IS NOT NULL
      ORDER BY s.started_at, s.id, se.position, se.id, st.position`,
    [],
  );
  const sessions = new Map<number, InsightSession>();
  const exercises = new Map<number, InsightSession['exercises'][number]>();
  for (const r of rows) {
    let s = sessions.get(r.id);
    if (!s) {
      s = { id: r.id, startedAt: r.started_at, finishedAt: r.finished_at, groups: JSON.parse(r.groups) as MuscleGroup[], exercises: [] };
      sessions.set(r.id, s);
    }
    let e = exercises.get(r.se_id);
    if (!e) {
      e = { exerciseId: r.exercise_id, sets: [] };
      exercises.set(r.se_id, e);
      s.exercises.push(e);
    }
    e.sets.push({ weightKg: r.weight_kg, reps: r.reps, isWarmup: r.is_warmup === 1, doneAt: r.done_at });
  }
  return [...sessions.values()];
}
