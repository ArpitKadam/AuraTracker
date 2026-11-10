// Rule-based exercise recommendations (TASK.md "Recommendations"). Pure: no DB, no clock.
import type { CatalogExercise, Equipment, MuscleGroup } from './catalog-types.ts';
import type { EquipmentAccess, Experience } from './db/profile.ts';
import { GROUPS } from './groups.ts';

const GROUP_SLUGS = Object.fromEntries(GROUPS.map((g) => [g.id, g.slugs as string[]])) as Record<MuscleGroup, string[]>;

export type PastSession = { startedAt: number; groups: MuscleGroup[]; exerciseIds: string[] };

export type Reason = 'staple' | 'history' | 'catalog' | 'variety';
export type Pick = { exerciseId: string; reason: Reason };
export type GroupPicks = { group: MuscleGroup; picks: Pick[] };

export const PER_GROUP = 6;
const STAPLE_WINDOW = 5;
const STAPLE_SHARE = 0.8;
const SAME_SESSIONS_FOR_VARIETY = 3;
const TRAINING = new Set(['strength', 'powerlifting', 'olympic', 'olympic weightlifting', 'strongman']);

const ALLOWED: Record<EquipmentAccess, Equipment[] | null> = {
  gym: null,
  dumbbells: ['dumbbell', 'bodyweight'],
  bodyweight: ['bodyweight'],
};
const LEVELS: Record<Experience, (string | null)[]> = {
  beginner: ['beginner', null],
  intermediate: ['beginner', 'intermediate', null],
  advanced: ['beginner', 'intermediate', 'advanced', null],
};

export type Prefs = { equipment: EquipmentAccess; experience: Experience };

// Free weights first, novelty kit (BOSU, sandbag, rings...) last.
const EQUIPMENT_RANK: Record<Equipment, number> = {
  barbell: 0, dumbbell: 1, cable: 2, machine: 3, 'ez-bar': 4, bodyweight: 5, kettlebell: 6, band: 7, other: 8,
};

// Small muscles are mostly trained with isolation work (pushdowns, curls, crunches); big ones with compounds.
const ISOLATION_FIRST = new Set<MuscleGroup>(['biceps', 'triceps', 'forearms', 'abs']);

/**
 * Catalog exercises the user can do for this group: main target first (primary[0] is in the group),
 * then the user's own exercises (they made them to do them), then the group's lead mechanic (compound for big groups, isolation for arms and abs), then RepDB's
 * curated set before free-exercise-db, then common equipment, then most-illustrated, then name.
 */
export function candidates(catalog: CatalogExercise[], group: MuscleGroup, prefs: Prefs): CatalogExercise[] {
  const eq = ALLOWED[prefs.equipment];
  const targets = (e: CatalogExercise) => GROUP_SLUGS[group].includes(e.primary[0]);
  const lead = ISOLATION_FIRST.has(group) ? 'isolation' : 'compound';
  return catalog
    .filter(
      (e) =>
        e.groups.includes(group) &&
        TRAINING.has(e.category ?? '') &&
        (eq === null || eq.includes(e.equipment)) &&
        LEVELS[prefs.experience].includes(e.level),
    )
    .sort(
      (a, b) =>
        Number(targets(b)) - Number(targets(a)) ||
        Number(b.sources[0] === 'custom') - Number(a.sources[0] === 'custom') ||
        Number(b.mechanic === lead) - Number(a.mechanic === lead) ||
        Number(b.sources[0] === 'repdb') - Number(a.sources[0] === 'repdb') ||
        EQUIPMENT_RANK[a.equipment] - EQUIPMENT_RANK[b.equipment] ||
        b.media.length - a.media.length ||
        a.name.localeCompare(b.name),
    );
}

export function recommend(
  groups: MuscleGroup[],
  catalog: CatalogExercise[],
  history: PastSession[],
  prefs: Prefs,
): GroupPicks[] {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const newestFirst = [...history].sort((a, b) => b.startedAt - a.startedAt);
  const taken = new Set<string>(); // an exercise hitting two picked groups shows once, under the first

  return groups.map((group) => {
    const inGroup = (id: string) => byId.get(id)?.groups.includes(group) ?? false;
    const sessions = newestFirst.filter((s) => s.groups.includes(group));
    const recent = sessions.slice(0, STAPLE_WINDOW);
    const picks: Pick[] = [];
    const add = (exerciseId: string, reason: Reason) => {
      if (picks.length < PER_GROUP && !taken.has(exerciseId)) {
        picks.push({ exerciseId, reason });
        taken.add(exerciseId);
      }
    };

    // 1. Staples: in >= 80% of the last 5 sessions for this group, most frequent first.
    const freq = new Map<string, number>();
    for (const s of recent) for (const id of new Set(s.exerciseIds)) if (inGroup(id)) freq.set(id, (freq.get(id) ?? 0) + 1);
    const need = Math.ceil(recent.length * STAPLE_SHARE);
    [...freq.entries()]
      .filter(([, n]) => recent.length > 0 && n >= need)
      .sort((a, b) => b[1] - a[1])
      .forEach(([id]) => add(id, 'staple'));

    // 2. Other history for this group, longest since last done first.
    const lastDone = new Map<string, number>();
    for (const s of sessions) for (const id of s.exerciseIds) if (inGroup(id) && !lastDone.has(id)) lastDone.set(id, s.startedAt);
    [...lastDone.entries()].sort((a, b) => a[1] - b[1]).forEach(([id]) => add(id, 'history'));

    // 3. Variety nudge: last 3 sessions for this group used the exact same exercises.
    const sets = sessions.slice(0, SAME_SESSIONS_FOR_VARIETY).map((s) => [...new Set(s.exerciseIds.filter(inGroup))].sort().join('|'));
    const pool = candidates(catalog, group, prefs);
    if (sets.length === SAME_SESSIONS_FOR_VARIETY && new Set(sets).size === 1) {
      const fresh = pool.find((e) => e.mechanic === 'compound' && !lastDone.has(e.id) && !taken.has(e.id));
      if (fresh) {
        if (picks.length === PER_GROUP) taken.delete(picks.pop()!.exerciseId);
        add(fresh.id, 'variety');
      }
    }

    // 4. Catalog fill up to PER_GROUP.
    for (const e of pool) add(e.id, 'catalog');
    return { group, picks };
  });
}

/** Next replacement for a shown exercise: same group, same first primary muscle when possible, not already shown. */
export function swapFor(
  exerciseId: string,
  group: MuscleGroup,
  shown: Set<string>,
  catalog: CatalogExercise[],
  prefs: Prefs,
): string | null {
  const current = catalog.find((e) => e.id === exerciseId);
  const pool = candidates(catalog, group, prefs).filter((e) => !shown.has(e.id));
  const target = current?.primary[0];
  return (pool.find((e) => e.primary[0] === target) ?? pool[0])?.id ?? null;
}
