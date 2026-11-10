import type { WorkingSet } from './overload.ts';

type AnySet = { weightKg: number; reps: number; isWarmup: boolean };

export const working = <T extends AnySet>(sets: T[]) => sets.filter((s) => !s.isWarmup);

/** Sum of weight x reps over working sets, kg. */
export const volumeKg = (sets: AnySet[]) => working(sets).reduce((v, s) => v + s.weightKg * s.reps, 0);

/** Heaviest working set, most reps on ties. */
export function topSet(sets: AnySet[]): WorkingSet | null {
  let best: WorkingSet | null = null;
  for (const s of working(sets)) if (!best || s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps)) best = s;
  return best ? { weightKg: best.weightKg, reps: best.reps } : null;
}

/** A new top set beats the previous best by weight, or by reps at the same weight. First-ever sessions are not PRs. */
export const isPr = (today: WorkingSet | null, before: WorkingSet | null) =>
  !!today && !!before && (today.weightKg > before.weightKg || (today.weightKg === before.weightKg && today.reps > before.reps));
