// Stats screen math. Pure: every function takes the sessions and `now`, nothing reads the DB or the clock.
// Formulas re-implemented from openGym's documented behaviour (AGPL, no code copied) and Apple Fitness concepts.
// Weeks start Monday 00:00 local time; a session's day is the local date of startedAt.
// Volume = Σ weightKg × reps over working sets (warm-ups never count anywhere here).
import type { MuscleGroup, MuscleSlug } from './catalog-types.ts';
import { GROUPS } from './groups.ts';
import { epley } from './progress.ts';
import { isoDate } from './schedule.ts';

export type InsightSet = { weightKg: number; reps: number; isWarmup: boolean; doneAt: number };
export type InsightSession = {
  id: number;
  startedAt: number;
  finishedAt: number;
  groups: MuscleGroup[];
  exercises: { exerciseId: string; sets: InsightSet[] }[];
};
/** Resolves an exercise id to its muscles and name (catalog + custom). */
export type ExerciseInfo = (id: string) => { name: string; primary: MuscleSlug[]; secondary: MuscleSlug[]; groups: MuscleGroup[] } | undefined;

export type Ring = { value: number; goal: number; /** value / goal, may exceed 1 (overflow laps) */ frac: number };
export type Rings = { volume: Ring; sets: Ring; sessions: Ring };

export type TrendId = 'volume' | 'sets' | 'sessions' | 'duration' | 'e1rm';
export type Trend = {
  id: TrendId;
  label: string;
  unit: 'kg' | 'sets' | 'workouts' | 'min';
  avg90: number;
  avg365: number;
  /** (avg90 - avg365) / avg365; 0 when avg365 is 0 */
  delta: number;
  up: boolean;
  /** Last 52 weekly values, oldest first. */
  series: { weekStart: number; value: number }[];
};

export type HeatDay = { date: string; sessions: number; minutes: number; volume: number };
export type WeekState = 'on' | 'frozen' | 'broke' | 'missed' | 'open';
export type Streak = {
  current: number;
  best: number;
  freezes: number;
  weeks: { weekStart: number; state: WeekState }[];
  badges: { weeks: number; earned: boolean }[];
};

export type MuscleSets = { group: MuscleGroup; sets: number; lo: number; hi: number; status: 'below' | 'in' | 'above' };
export type Recovery = { group: MuscleGroup; fatigue: number; band: 'ready' | 'recovering' | 'fatigued'; readyInHours: number };
export type WeekVolume = { weekStart: number; volume: number; sets: number };
export type Balance = { group: MuscleGroup; load: number; share: number };
export type PR = { exerciseId: string; kind: 'weight' | 'reps' | 'e1rm' | 'volume'; at: number; weightKg: number; reps: number };
export type Award = { id: string; title: string; detail: string; earned: boolean; progress: number };
export type Kpis = { workouts: number; thisMonth: number; totalVolumeKg: number; totalSets: number; hours: number; prs: number };
export type MonthRecap = {
  workouts: number;
  days: number;
  sets: number;
  volume: number;
  avgMinutes: number;
  topExercise: string | null;
  topGroup: MuscleGroup | null;
  favWeekday: number | null;
  timeOfDay: 'morning' | 'midday' | 'afternoon' | 'evening' | 'night' | null;
  deltaVolumePct: number | null;
};
export type CalendarDay = { date: string; sets: number; volume: number; setsFrac: number; volumeFrac: number };

const DAY = 86_400_000;
const HOUR = 3_600_000;
const r1 = (x: number) => Math.round(x * 10) / 10;
const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Local-calendar day arithmetic (DST-safe, unlike adding 86.4M ms). */
const addDays = (t: number, n: number) => {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
};
const addWeeks = (t: number, n: number) => addDays(t, 7 * n);
const monthStart = (t: number, offset = 0) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime();
};

/** Monday 00:00 local of the week containing t. */
export function weekStartOf(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

const working = (s: InsightSession) => s.exercises.flatMap((e) => e.sets.filter((x) => !x.isWarmup));
const volumeOf = (s: InsightSession) => total(working(s).map((x) => x.weightKg * x.reps));
const setsOf = (s: InsightSession) => working(s).length;
// ponytail: a workout left open for hours would skew time stats; cap at 4 h. Derive from set times if that proves too blunt.
const minutesOf = (s: InsightSession) => Math.min(240, (s.finishedAt - s.startedAt) / 60000);
const inRange = (s: InsightSession[], from: number, to: number) => s.filter((x) => x.startedAt >= from && x.startedAt < to);

/** `n` weekly buckets ending at the current week + `end` (0 = this week, -1 = last full week), oldest first. */
function weekBuckets(s: InsightSession[], now: number, n: number, end: number) {
  const last = addWeeks(weekStartOf(now), end);
  return Array.from({ length: n }, (_, i) => {
    const weekStart = addWeeks(last, i - n + 1);
    return { weekStart, s: inRange(s, weekStart, addWeeks(weekStart, 1)) };
  });
}

const SLUG_GROUP = new Map(GROUPS.flatMap((g) => g.slugs.map((s) => [s, g.id] as const)));

/** Credit one set gives each group: +1 per distinct primary group, +0.4 per distinct secondary group not already primary. */
export function groupCredit(info: ExerciseInfo, exerciseId: string): Map<MuscleGroup, number> {
  const out = new Map<MuscleGroup, number>();
  const ex = info(exerciseId);
  if (!ex) return out;
  for (const slug of ex.primary) {
    const g = SLUG_GROUP.get(slug);
    if (g) out.set(g, 1);
  }
  for (const slug of ex.secondary) {
    const g = SLUG_GROUP.get(slug);
    if (g && !out.has(g)) out.set(g, 0.4);
  }
  return out;
}

/** Credited working sets per group. */
function groupSets(s: InsightSession[], info: ExerciseInfo): Map<MuscleGroup, number> {
  const out = new Map<MuscleGroup, number>();
  for (const x of s)
    for (const e of x.exercises) {
      const n = e.sets.filter((st) => !st.isWarmup).length;
      if (n) for (const [g, c] of groupCredit(info, e.exerciseId)) out.set(g, (out.get(g) ?? 0) + c * n);
    }
  return out;
}

function byDay(s: InsightSession[]) {
  const out = new Map<string, { sessions: number; minutes: number; volume: number; sets: number }>();
  for (const x of s) {
    const date = isoDate(new Date(x.startedAt));
    const d = out.get(date) ?? { sessions: 0, minutes: 0, volume: 0, sets: 0 };
    d.sessions++;
    d.minutes += minutesOf(x);
    d.volume += volumeOf(x);
    d.sets += setsOf(x);
    out.set(date, d);
  }
  return out;
}

const argmax = <K>(m: Map<K, number>): K | null => [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
const counts = <K>(xs: K[]) => {
  const m = new Map<K, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};

/** Week to date vs the average of the previous 8 full weeks that had any training. */
export const weeklyRings = (s: InsightSession[], now: number): Rings => {
  const cur = weekBuckets(s, now, 1, 0)[0].s;
  const past = weekBuckets(s, now, 8, -1).filter((w) => w.s.length);
  const avg = (f: (x: InsightSession) => number, fallback: number) =>
    (past.length ? total(past.map((w) => total(w.s.map(f)))) / past.length : 0) || fallback;
  const ring = (value: number, goal: number): Ring => ({ value: r1(value), goal: r1(goal), frac: value / goal });
  return {
    volume: ring(total(cur.map(volumeOf)), avg(volumeOf, 10000)),
    sets: ring(total(cur.map(setsOf)), avg(setsOf, 60)),
    sessions: ring(cur.length, 4),
  };
};

export const trends = (s: InsightSession[], now: number): Trend[] => {
  const weeks = weekBuckets(s, now, 52, -1);
  const e1rm = (w: InsightSession[]) => {
    const best = new Map<string, number>();
    for (const x of w)
      for (const e of x.exercises)
        for (const st of e.sets)
          if (!st.isWarmup && st.reps <= 12) best.set(e.exerciseId, Math.max(best.get(e.exerciseId) ?? 0, epley(st.weightKg, st.reps)));
    return best.size ? total([...best.values()]) / best.size : null;
  };
  // null = no data that week; those weeks are skipped by the averages (only duration and e1rm return null).
  const metrics: [TrendId, string, Trend['unit'], (w: InsightSession[]) => number | null][] = [
    ['volume', 'Weekly volume', 'kg', (w) => total(w.map(volumeOf))],
    ['sets', 'Working sets', 'sets', (w) => total(w.map(setsOf))],
    ['sessions', 'Workouts / week', 'workouts', (w) => w.length],
    ['duration', 'Session length', 'min', (w) => (w.length ? total(w.map(minutesOf)) / w.length : null)],
    ['e1rm', 'Est. 1RM (avg)', 'kg', e1rm],
  ];
  const mean = (v: (number | null)[]) => {
    const xs = v.filter((x): x is number => x !== null);
    return xs.length ? total(xs) / xs.length : 0;
  };
  return metrics.map(([id, label, unit, f]) => {
    const vals = weeks.map((w) => f(w.s));
    const avg90 = mean(vals.slice(-13));
    const avg365 = mean(vals);
    const delta = avg365 ? (avg90 - avg365) / avg365 : 0;
    return {
      id,
      label,
      unit,
      avg90: r1(avg90),
      avg365: r1(avg365),
      delta,
      up: delta >= -0.02,
      series: weeks.map((w, i) => ({ weekStart: w.weekStart, value: r1(vals[i] ?? 0) })),
    };
  });
};

export const heatmap = (s: InsightSession[], now: number, weeks = 53): HeatDay[] => {
  const days = byDay(s);
  const start = addWeeks(weekStartOf(now), 1 - weeks);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const date = isoDate(new Date(addDays(start, i)));
    const d = days.get(date);
    return { date, sessions: d?.sessions ?? 0, minutes: r1(d?.minutes ?? 0), volume: r1(d?.volume ?? 0) };
  });
};

/** Quartile buckets of the nonzero values: 0 = no session, 1..4 = low..high. */
export const heatLevels = (values: number[]): ((v: number, hasSession: boolean) => 0 | 1 | 2 | 3 | 4) => {
  const nz = values.filter((v) => v > 0).sort((a, b) => a - b);
  const [q25, q50, q75] = [0.25, 0.5, 0.75].map((p) => nz[Math.floor(p * nz.length)]);
  return (v, hasSession) => (!hasSession ? 0 : !nz.length || v < q25 ? 1 : v < q50 ? 2 : v < q75 ? 3 : 4);
};

export const weekStreak = (s: InsightSession[], now: number): Streak => {
  const trained = new Set(s.map((x) => weekStartOf(x.startedAt)));
  const cur = weekStartOf(now);
  const weeks: Streak['weeks'] = [];
  let current = 0;
  let best = 0;
  let bank = 0;
  let run = 0; // trained weeks since the last break; every 4th earns a freeze
  const first = s.length ? Math.min(...trained) : Infinity;
  for (let w = first; w <= cur; w = addWeeks(w, 1)) {
    let state: WeekState;
    if (trained.has(w)) {
      current++;
      run++;
      if (run % 4 === 0) bank = Math.min(2, bank + 1);
      state = 'on';
    } else if (w === cur) state = 'open';
    else if (bank) {
      bank--;
      state = 'frozen';
    } else {
      current = bank = run = 0;
      state = 'broke';
    }
    best = Math.max(best, current);
    weeks.push({ weekStart: w, state });
  }
  return { current, best, freezes: bank, weeks: weeks.slice(-26), badges: [4, 12, 26, 52, 104].map((n) => ({ weeks: n, earned: best >= n })) };
};

const RANGES: Record<MuscleGroup, [number, number]> = {
  chest: [10, 20],
  back: [10, 20],
  shoulders: [8, 20],
  biceps: [8, 18],
  triceps: [6, 16],
  forearms: [4, 12],
  abs: [6, 16],
  legs: [12, 24],
};

export const weeklyMuscleSets = (s: InsightSession[], info: ExerciseInfo, now: number): MuscleSets[] => {
  const m = groupSets(weekBuckets(s, now, 1, 0)[0].s, info);
  return GROUPS.map(({ id }) => {
    const sets = r1(m.get(id) ?? 0);
    const [lo, hi] = RANGES[id];
    return { group: id, sets, lo, hi, status: sets < lo ? 'below' : sets > hi ? 'above' : 'in' };
  });
};

const HALF_LIFE_H: Record<MuscleGroup, number> = { chest: 30, back: 30, shoulders: 24, biceps: 24, triceps: 24, forearms: 24, abs: 24, legs: 48 };
const READY_V = -Math.log(0.75); // fatigue = 1 - e^-v < 0.25  <=>  v < READY_V

/** Decaying fatigue per group from the last 30 days; each session's stimulus is timed at its finishedAt. */
export const recovery = (s: InsightSession[], info: ExerciseInfo, now: number): Recovery[] => {
  const events = s
    .filter((x) => x.finishedAt >= now - 30 * DAY && x.finishedAt <= now)
    .sort((a, b) => a.finishedAt - b.finishedAt)
    .map((x) => ({ t: x.finishedAt, sets: groupSets([x], info) }));
  return GROUPS.map(({ id }) => {
    const hl = HALF_LIFE_H[id] * HOUR;
    let v = 0;
    let t = now;
    for (const e of events) {
      const n = e.sets.get(id);
      if (!n) continue;
      v = v * 0.5 ** ((e.t - t) / hl) + Math.min(n, 12) / 8;
      t = e.t;
    }
    v *= 0.5 ** ((now - t) / hl);
    const fatigue = 1 - Math.exp(-v);
    return {
      group: id,
      fatigue,
      band: fatigue < 0.25 ? 'ready' : fatigue < 0.5 ? 'recovering' : 'fatigued',
      readyInHours: fatigue < 0.25 ? 0 : r1(HALF_LIFE_H[id] * Math.log2(v / READY_V)),
    };
  });
};

export const weeklyVolume = (s: InsightSession[], now: number, weeks = 12): WeekVolume[] =>
  weekBuckets(s, now, weeks, 0).map((w) => ({ weekStart: w.weekStart, volume: r1(total(w.s.map(volumeOf))), sets: total(w.s.map(setsOf)) }));

/** Load = credited working sets per group over the last `days` days; share is relative to the most-trained group. */
export const muscleBalance = (s: InsightSession[], info: ExerciseInfo, now: number, days = 30): Balance[] => {
  const m = groupSets(
    s.filter((x) => x.startedAt >= now - days * DAY && x.startedAt <= now),
    info,
  );
  const max = Math.max(0, ...m.values());
  return GROUPS.map(({ id }) => {
    const load = m.get(id) ?? 0;
    return { group: id, load: r1(load), share: max ? load / max : 0 };
  });
};

/** Every PR in time order. A reps PR is more reps than any earlier set at the same or a heavier weight. */
export const records = (s: InsightSession[]): PR[] => {
  type Best = { w: number; e1rm: number; vol: number; repsAt: Map<number, number> };
  const hist = new Map<string, Best>();
  const out: PR[] = [];
  for (const x of [...s].sort((a, b) => a.startedAt - b.startedAt))
    for (const e of x.exercises) {
      const sets = e.sets.filter((st) => !st.isWarmup);
      if (!sets.length) continue;
      const seen = hist.has(e.exerciseId); // first-ever session of an exercise sets the baseline, no PRs
      const b = hist.get(e.exerciseId) ?? { w: -Infinity, e1rm: -Infinity, vol: -Infinity, repsAt: new Map() };
      const top = new Map<PR['kind'], { score: number; set: InsightSet }>();
      const win = (kind: PR['kind'], score: number, set: InsightSet) => {
        const t = top.get(kind);
        if (!t || score > t.score) top.set(kind, { score, set });
      };
      for (const st of sets) {
        const e1 = epley(st.weightKg, st.reps);
        const vol = st.weightKg * st.reps;
        if (seen) {
          let repsBest = -1;
          for (const [w, r] of b.repsAt) if (w >= st.weightKg && r > repsBest) repsBest = r;
          if (st.weightKg > b.w) win('weight', st.weightKg, st);
          if (repsBest >= 0 && st.reps > repsBest) win('reps', st.reps * 1e4 + st.weightKg, st); // most reps, then heaviest
          if (e1 > b.e1rm + 1e-9) win('e1rm', e1, st);
          if (vol > b.vol) win('volume', vol, st);
        }
        b.w = Math.max(b.w, st.weightKg);
        b.e1rm = Math.max(b.e1rm, e1);
        b.vol = Math.max(b.vol, vol);
        b.repsAt.set(st.weightKg, Math.max(b.repsAt.get(st.weightKg) ?? 0, st.reps));
      }
      hist.set(e.exerciseId, b);
      for (const [kind, { set }] of top) out.push({ exerciseId: e.exerciseId, kind, at: set.doneAt, weightKg: set.weightKg, reps: set.reps });
    }
  return out.sort((a, b) => a.at - b.at);
};

/** Milestones. "Full body week" uses each session's chosen groups (no ExerciseInfo here). */
export const awards = (s: InsightSession[], now: number): Award[] => {
  const n = s.length;
  const prs = records(s).length;
  const best = weekStreak(s, now).best;
  const tonnes = total(s.map(volumeOf)) / 1000;
  const weekGroups = new Map<number, Set<MuscleGroup>>();
  for (const x of s) {
    const k = weekStartOf(x.startedAt);
    weekGroups.set(k, new Set([...(weekGroups.get(k) ?? []), ...x.groups]));
  }
  const fullBody = Math.max(0, ...[...weekGroups.values()].map((g) => g.size));
  const hour = (x: InsightSession) => new Date(x.startedAt).getHours();
  const early = s.filter((x) => hour(x) < 7).length;
  const owl = s.filter((x) => hour(x) >= 21).length;
  type Row = [id: string, title: string, goal: number, have: number, sentence: string, unit: string];
  const rows: Row[] = [
    ...[1, 10, 50, 100, 250, 500].map((k): Row =>
      [`workouts-${k}`, k === 1 ? 'First workout' : `${k} workouts`, k, n, k === 1 ? 'Finish your first workout' : `Finish ${k} workouts`, 'workouts']),
    ...[1, 10, 50, 100].map((k): Row =>
      [`prs-${k}`, k === 1 ? 'First PR' : `${k} PRs`, k, prs, k === 1 ? 'Set a personal record' : `Set ${k} personal records`, 'PRs']),
    ...[4, 12, 26, 52, 104].map((k): Row =>
      [`streak-${k}`, `${k}-week streak`, k, best, `Train ${k} weeks in a row`, 'weeks']),
    ...[10, 100, 500, 1000, 5000].map((k): Row =>
      [`volume-${k}t`, `${k} tonnes`, k, tonnes, `Lift ${k} tonnes in total`, 't']),
    ['full-body-week', 'Full body week', 8, fullBody, 'Train all 8 muscle groups in one week', 'groups'],
    ['early-bird', 'Early bird', 5, early, 'Start 5 workouts before 7:00', 'workouts'],
    ['night-owl', 'Night owl', 5, owl, 'Start 5 workouts after 21:00', 'workouts'],
  ];
  return rows.map(([id, title, goal, have, sentence, unit]) => {
    const earned = have >= goal;
    return { id, title, detail: earned ? sentence : `${r1(have)} of ${goal} ${unit}`, earned, progress: Math.min(1, have / goal) };
  });
};

export const kpis = (s: InsightSession[], now: number): Kpis => ({
  workouts: s.length,
  thisMonth: inRange(s, monthStart(now), monthStart(now, 1)).length,
  totalVolumeKg: r1(total(s.map(volumeOf))),
  totalSets: total(s.map(setsOf)),
  hours: r1(total(s.map(minutesOf)) / 60),
  prs: records(s).length,
});

const timeOfDay = (h: number): NonNullable<MonthRecap['timeOfDay']> =>
  h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 14 ? 'midday' : h >= 14 && h < 17 ? 'afternoon' : h >= 17 && h < 21 ? 'evening' : 'night';

/** This calendar month so far; deltaVolumePct compares with the whole previous month. */
export const monthRecap = (s: InsightSession[], info: ExerciseInfo, now: number): MonthRecap => {
  const cur = inRange(s, monthStart(now), monthStart(now, 1));
  const prevVolume = total(inRange(s, monthStart(now, -1), monthStart(now)).map(volumeOf));
  const volume = total(cur.map(volumeOf));
  const ex = new Map<string, { sets: number; volume: number }>();
  for (const x of cur)
    for (const e of x.exercises)
      for (const st of e.sets)
        if (!st.isWarmup) {
          const a = ex.get(e.exerciseId) ?? { sets: 0, volume: 0 };
          a.sets++;
          a.volume += st.weightKg * st.reps;
          ex.set(e.exerciseId, a);
        }
  const starts = cur.map((x) => new Date(x.startedAt));
  return {
    workouts: cur.length,
    days: new Set(starts.map(isoDate)).size,
    sets: total(cur.map(setsOf)),
    volume: r1(volume),
    avgMinutes: cur.length ? r1(total(cur.map(minutesOf)) / cur.length) : 0,
    topExercise: [...ex].sort((a, b) => b[1].sets - a[1].sets || b[1].volume - a[1].volume)[0]?.[0] ?? null,
    topGroup: argmax(groupSets(cur, info)),
    favWeekday: argmax(counts(starts.map((d) => (d.getDay() + 6) % 7))),
    timeOfDay: argmax(counts(starts.map((d) => timeOfDay(d.getHours())))),
    deltaVolumePct: prevVolume ? r1(((volume - prevVolume) / prevVolume) * 100) : null,
  };
};

export const calendarMonth = (s: InsightSession[], now: number): CalendarDay[] => {
  const from = monthStart(now);
  const to = monthStart(now, 1);
  const days = byDay(inRange(s, from, to));
  const max = Math.max(0, ...[...days.values()].map((d) => d.volume)) || 1;
  const out: CalendarDay[] = [];
  for (let t = from; t < to; t = addDays(t, 1)) {
    const date = isoDate(new Date(t));
    const d = days.get(date);
    const sets = d?.sets ?? 0;
    const volume = d?.volume ?? 0;
    out.push({ date, sets, volume: r1(volume), setsFrac: sets / 20, volumeFrac: volume / max });
  }
  return out;
};
