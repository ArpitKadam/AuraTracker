// Per-exercise progress series. Pure; warm-ups are already excluded by the query.
import type { WorkingSet } from './overload.ts';

export type Metric = 'top' | 'e1rm' | 'volume';
export type SessionSets = { startedAt: number; sets: WorkingSet[] };
export type Point = { t: number; v: number };

/** Epley estimated one-rep max. A single rep is the lift itself. */
export const epley = (weightKg: number, reps: number) => (reps <= 1 ? weightKg : weightKg * (1 + reps / 30));

export function series(sessions: SessionSets[], metric: Metric): Point[] {
  return sessions
    .filter((s) => s.sets.length)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => ({
      t: s.startedAt,
      v:
        metric === 'top'
          ? Math.max(...s.sets.map((x) => x.weightKg))
          : metric === 'e1rm'
            ? Math.max(...s.sets.map((x) => epley(x.weightKg, x.reps)))
            : s.sets.reduce((sum, x) => sum + x.weightKg * x.reps, 0),
    }));
}

/** 2-4 round y-axis ticks covering [min, max]; a flat series gets a band around its value. */
export function niceTicks(min: number, max: number): number[] {
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.1);
    [min, max] = [min - pad, max + pad];
  }
  const raw = (max - min) / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}
