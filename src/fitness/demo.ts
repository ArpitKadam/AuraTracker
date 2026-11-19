// TEMPORARY fake training history so the Stats charts have something to show. Delete this file (and its import) once
// real data is enough. Deterministic: same `now` and ids give the same sessions.
import type { MuscleGroup } from './catalog-types.ts';
import { weekStartOf, weeklyRings, type InsightSession, type InsightSet } from './insights.ts';

export const DEMO_NOTE = 'Demo data';

/** Monday..Sunday. */
const SPLIT: MuscleGroup[][] = [
  ['legs', 'shoulders'],
  ['chest', 'triceps', 'abs'],
  ['back', 'biceps', 'forearms'],
  ['shoulders', 'legs', 'abs'],
  ['biceps', 'triceps', 'forearms'],
  ['chest', 'back', 'abs'],
  [],
];
const BASE_KG: Record<MuscleGroup, number> = { legs: 100, chest: 60, back: 60, shoulders: 30, biceps: 14, triceps: 25, forearms: 18, abs: 20 };
const WEEKS = 61; // ~14 months including this one
// Week 3 breaks the streak (no freeze banked yet); 22-23 and 44 spend freezes.
const BREAKS = new Set([3, 22, 23, 44]);

// mulberry32, a tiny public-domain PRNG.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => Math.abs([...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
const roundTo = (x: number, step: number) => Math.max(step, Math.round(x / step) * step);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Spreads the sets' doneAt evenly through the session. */
function spread(s: InsightSession) {
  const all = s.exercises.flatMap((e) => e.sets);
  all.forEach((x, k) => (x.doneAt = Math.round(s.startedAt + ((s.finishedAt - s.startedAt) * (k + 1)) / (all.length + 1))));
}

export function demoSessions(now: number, ids: Record<MuscleGroup, string[]>): InsightSession[] {
  const rnd = mulberry32(0x5eed);
  const first = new Date(weekStartOf(now));
  first.setDate(first.getDate() - 7 * (WEEKS - 1));
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const rot = new Map<MuscleGroup, number>();
  const out: InsightSession[] = [];

  for (let i = 0; ; i++) {
    const day = new Date(first);
    day.setDate(first.getDate() + i);
    if (day.getTime() > today.getTime()) break;
    const week = Math.floor(i / 7);
    const groups = SPLIT[i % 7];
    const thisWeek = week === WEEKS - 1; // always trained, so the rings have something to show
    if (!groups.length || BREAKS.has(week) || (!thisWeek && rnd() > 0.85)) continue;

    const roll = rnd();
    const startMin = roll < 0.06 ? 6 * 60 + 15 : roll < 0.12 ? 22 * 60 : 18 * 60 + 30 + Math.floor(rnd() * 121);
    const dur = (55 + Math.floor(rnd() * 31)) * 60000;
    const d = new Date(day);
    d.setHours(0, startMin, 0, 0);
    let start = d.getTime();
    let end = start + dur;
    if (end > now) {
      if (day.getTime() !== today.getTime()) continue;
      start = Math.max(day.getTime(), now - dur - 10 * 60000); // today's session: already finished
      end = Math.min(start + dur, now);
    }

    // 4-6 exercises, round-robin over the day's groups, rotating through each group's ids.
    const n = 4 + Math.floor(rnd() * 3);
    const picks: [string, MuscleGroup][] = [];
    for (let k = 0, miss = 0; picks.length < n && miss < groups.length; k++) {
      const g = groups[k % groups.length];
      const pool = ids[g] ?? [];
      const r = rot.get(g) ?? 0;
      const id = pool[r % pool.length];
      if (pool.length) rot.set(g, r + 1);
      if (id && !picks.some((p) => p[0] === id)) {
        picks.push([id, g]);
        miss = 0;
      } else miss++;
    }
    if (!picks.length) continue;

    const progress = 1 + 0.28 * (i / (WEEKS * 7));
    const exercises = picks.map(([exerciseId, g]) => {
      const jump = rnd() < 0.05 ? 1.06 : 1;
      const step = BASE_KG[g] >= 30 ? 2.5 : 1;
      const kg = roundTo(BASE_KG[g] * (0.7 + (hash(exerciseId) % 50) / 100) * progress * (0.96 + rnd() * 0.07) * jump, step);
      const sets: InsightSet[] = [{ weightKg: roundTo(kg * 0.5, 1), reps: 10, isWarmup: true, doneAt: 0 }];
      const work = 3 + Math.floor(rnd() * 2);
      const reps0 = 7 + Math.floor(rnd() * 8);
      for (let k = 0; k < work; k++) sets.push({ weightKg: kg, reps: clamp(reps0 - k + Math.round((rnd() - 0.5) * 3), 6, 15), isWarmup: false, doneAt: 0 });
      return { exerciseId, sets };
    });
    const s: InsightSession = { id: -(out.length + 1), startedAt: start, finishedAt: end, groups, exercises };
    spread(s);
    out.push(s);
  }

  // Early in the week no ring may be full yet: pad the latest session this week until the sets ring overflows.
  const r = weeklyRings(out, now);
  const last = out[out.length - 1];
  if (last && last.startedAt >= weekStartOf(now) && r.volume.frac <= 1 && r.sets.frac <= 1 && r.sessions.frac <= 1) {
    const extra = Math.ceil(r.sets.goal * 1.1 - r.sets.value);
    for (let k = 0; k < extra; k++) {
      const e = last.exercises[k % last.exercises.length];
      e.sets.push({ ...e.sets[e.sets.length - 1] });
    }
    spread(last);
  }
  return out;
}
