// Run: node scripts/check-insights.ts
// Stats math on hand-made sessions (fixed `now`), the DB loader on real migrations, and the demo generator.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import type { MuscleGroup, MuscleSlug } from '../src/fitness/catalog-types.ts';
import { loadInsightSessions } from '../src/fitness/db/insights.ts';
import { migrate } from '../src/fitness/db/schema.ts';
import { addSet, finishSession, startSession } from '../src/fitness/db/session.ts';
import { demoSessions } from '../src/fitness/demo.ts';
import { GROUPS } from '../src/fitness/groups.ts';
import {
  awards,
  calendarMonth,
  heatLevels,
  heatmap,
  kpis,
  monthRecap,
  muscleBalance,
  records,
  recovery,
  trends,
  weeklyMuscleSets,
  weeklyRings,
  weeklyVolume,
  weekStreak,
  type ExerciseInfo,
  type InsightSession,
} from '../src/fitness/insights.ts';
import { isoDate } from '../src/fitness/schedule.ts';

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** Local time in the week of Mon 2026-11-16: wk(-1) = the Monday before, day 0 = Monday. */
const wk = (n: number, day = 0, h = 18, m = 0) => new Date(2026, 10, 16 + 7 * n + day, h, m).getTime();
const now = wk(0, 2, 12); // Wednesday 2026-11-18 12:00
const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} != ${b}`);

let nextId = 1;
type Spec = [string, [number, number, boolean?][]][];
const S = (start: number, minutes: number, ex: Spec, groups: MuscleGroup[] = []): InsightSession => ({
  id: nextId++,
  startedAt: start,
  finishedAt: start + minutes * 60000,
  groups,
  exercises: ex.map(([exerciseId, sets]) => ({
    exerciseId,
    sets: sets.map(([weightKg, reps, isWarmup = false], k) => ({ weightKg, reps, isWarmup, doneAt: start + (k + 1) * 60000 })),
  })),
});
const reps = (n: number, w: number, r: number): [number, number][] => Array.from({ length: n }, () => [w, r]);

const CAT: Record<string, { primary: MuscleSlug[]; secondary: MuscleSlug[] }> = {
  bench: { primary: ['chest'], secondary: ['triceps', 'deltoids'] },
  squat: { primary: ['quadriceps', 'gluteal'], secondary: ['hamstring', 'lower-back'] }, // legs 1.0 once, back 0.4
  crunch: { primary: ['abs', 'obliques'], secondary: [] },
  wrist: { primary: ['forearm'], secondary: [] },
};
const info: ExerciseInfo = (id) => (CAT[id] ? { name: id, ...CAT[id], groups: [] } : undefined);

// Rings: goal = average of the previous 8 weeks that had training; week -9 is outside the window.
{
  const s = [
    S(wk(-9), 60, [['bench', [[100, 100]]]]),
    S(wk(-3), 60, [['bench', [[50, 10], [50, 10], [20, 10, true]]]]),
    S(wk(-1), 60, [['bench', [[100, 5], [100, 5]]]]),
    S(wk(0, 1), 60, [['bench', [[100, 10], [25, 10], [25, 10]]]]),
  ];
  const r = weeklyRings(s, now);
  assert.deepEqual(r.volume, { value: 1500, goal: 1000, frac: 1.5 }, 'volume ring overflows');
  assert.deepEqual(r.sets, { value: 3, goal: 2, frac: 1.5 });
  assert.deepEqual(r.sessions, { value: 1, goal: 4, frac: 0.25 });
  const empty = weeklyRings([], now);
  assert.deepEqual([empty.volume.goal, empty.sets.goal, empty.volume.frac], [10000, 60, 0], 'fallback goals');
}

// Trends: arrow up when the last 13 weeks beat the year, down when they lag; duration/e1rm average weeks with data only.
{
  const up = Array.from({ length: 52 }, (_, i) => S(wk(i - 52), 60, [['bench', [[i >= 39 ? 200 : 100, 10]]]]));
  const t = trends(up, now);
  assert.deepEqual(t.map((x) => x.label), ['Weekly volume', 'Working sets', 'Workouts / week', 'Session length', 'Est. 1RM (avg)']);
  const vol = t[0];
  assert.deepEqual([vol.avg90, vol.avg365, vol.up], [2000, 1250, true]);
  near(vol.delta, 0.6);
  assert.equal(vol.series.length, 52);
  assert.equal(vol.series[51].weekStart, wk(-1, 0, 0), 'series ends with the last full week');
  assert.equal(t[3].avg90, 60);

  const down = trends(up.slice(0, 39), now)[0];
  assert.deepEqual([down.avg90, down.avg365, down.delta, down.up], [0, 750, -1, false]);

  const sparse = trends([S(wk(-20), 45, [['bench', [[100, 1]]]]), S(wk(-1), 45, [['bench', [[100, 1]]]])], now);
  assert.equal(sparse[4].avg365, 100, 'e1rm averages only weeks with data');
  assert.equal(sparse[3].avg365, 45);
  assert.equal(sparse[0].avg365, 3.8, 'volume counts empty weeks as 0 (200 / 52)');
}

// Heatmap: 53 Monday-to-Sunday weeks, future days zero; quartile levels.
{
  const s = [S(wk(0, 1), 30, [['bench', [[100, 5]]]]), S(wk(0, 1, 19), 30, [['bench', [[100, 5]]]])];
  const h = heatmap(s, now);
  assert.equal(h.length, 371);
  assert.equal(h[0].date, isoDate(new Date(wk(-52, 0, 0))));
  assert.equal(new Date(wk(-52)).getDay(), 1);
  assert.equal(h[h.length - 1].date, '2026-11-22');
  assert.deepEqual(h.find((d) => d.date === '2026-11-17'), { date: '2026-11-17', sessions: 2, minutes: 60, volume: 1000 });
  assert.deepEqual(h.find((d) => d.date === '2026-11-20'), { date: '2026-11-20', sessions: 0, minutes: 0, volume: 0 });

  const lv = heatLevels([0, 40, 10, 30, 20]); // nonzero sorted [10,20,30,40]: q25=20, q50=30, q75=40
  assert.deepEqual([lv(0, false), lv(0, true), lv(10, true), lv(20, true), lv(29, true), lv(30, true), lv(40, true)], [0, 1, 1, 2, 2, 3, 4]);
  assert.equal(heatLevels([])(0, true), 1);
}

// Streak: 4 trained weeks earn a freeze, a missed week spends it, the next miss breaks; the open current week neither counts nor breaks.
{
  const s = [-10, -9, -8, -7, -5, -3, -2, -1].map((n) => S(wk(n, 3), 60, [['bench', [[100, 5]]]]));
  const st = weekStreak(s, now);
  assert.deepEqual(st.weeks.map((w) => w.state), ['on', 'on', 'on', 'on', 'frozen', 'on', 'broke', 'on', 'on', 'on', 'open']);
  assert.equal(st.weeks[0].weekStart, wk(-10, 0, 0));
  assert.deepEqual([st.current, st.best, st.freezes], [3, 5, 0]);
  assert.deepEqual(st.badges.slice(0, 2), [{ weeks: 4, earned: true }, { weeks: 12, earned: false }]);
  const withNow = weekStreak([...s, S(wk(0, 0), 60, [['bench', [[100, 5]]]])], now);
  assert.equal(withNow.current, 4);
  assert.equal(withNow.weeks[withNow.weeks.length - 1].state, 'on');
  assert.deepEqual(weekStreak([], now), { current: 0, best: 0, freezes: 0, weeks: [], badges: st.badges.map((b) => ({ ...b, earned: false })) });
}

// Muscle sets: primary 1.0 per distinct group, secondary 0.4; warm-ups and last week ignored.
{
  const s = [
    S(wk(-1, 2), 60, [['bench', reps(10, 100, 5)]]),
    S(wk(0, 0), 60, [
      ['bench', [[60, 10, true], ...reps(3, 100, 5)]],
      ['squat', reps(2, 140, 5)],
      ['crunch', reps(10, 0, 15)],
      ['wrist', reps(13, 20, 12)],
    ]),
  ];
  const m = Object.fromEntries(weeklyMuscleSets(s, info, now).map((x) => [x.group, x]));
  assert.deepEqual(Object.keys(m), GROUPS.map((g) => g.id));
  assert.deepEqual(
    GROUPS.map((g) => m[g.id].sets),
    [3, 0.8, 1.2, 0, 1.2, 13, 10, 2], // chest back shoulders biceps triceps forearms abs legs
  );
  assert.deepEqual([m.chest.status, m.abs.status, m.forearms.status], ['below', 'in', 'above']);
  assert.deepEqual([m.legs.lo, m.legs.hi], [12, 24]);

  const bal = muscleBalance(s, info, now);
  assert.equal(bal.find((b) => b.group === 'forearms')!.share, 1);
  assert.deepEqual(bal.find((b) => b.group === 'chest'), { group: 'chest', load: 13, share: 1 }, 'last week counts in the 30 days');
  near(bal.find((b) => b.group === 'legs')!.share, 2 / 13);
}

// Recovery: a legs session finished 48h ago at stimulus 1 is one legs half-life old -> v = 0.5.
{
  const s = [
    S(now - 40 * DAY, 60, [['bench', reps(12, 100, 5)]]), // older than 30 days
    S(now - 48 * HOUR - 60 * 60000, 60, [['squat', reps(8, 100, 5)]]),
  ];
  const r = Object.fromEntries(recovery(s, info, now).map((x) => [x.group, x]));
  near(r.legs.fatigue, 1 - Math.exp(-0.5));
  assert.equal(r.legs.band, 'recovering');
  assert.equal(r.legs.readyInHours, Math.round(48 * Math.log2(0.5 / -Math.log(0.75)) * 10) / 10);
  assert.equal(r.legs.readyInHours, 38.3);
  near(r.back.fatigue, 1 - Math.exp(-0.4 * 0.5 ** (48 / 30)), 'back: 8 x 0.4 credit, 30h half-life');
  assert.deepEqual([r.back.band, r.back.readyInHours, r.chest.fatigue], ['ready', 0, 0]);
  const hammered = recovery([S(now - 2 * HOUR, 60, [['squat', reps(20, 100, 5)]])], info, now).find((x) => x.group === 'legs')!;
  assert.equal(hammered.band, 'fatigued');
  near(hammered.fatigue, 1 - Math.exp(-1.5 * 0.5 ** (1 / 48)), 'stimulus capped at 12 sets, 1h of decay');
}

// Records: none on an exercise's first session; in-session sets count as history (set 3 beats set 2).
const prSessions = [
  S(wk(-2), 60, [['bench', [[100, 5], [90, 8], [200, 1, true]]]]),
  S(wk(-1), 60, [
    ['bench', [[100, 5], [102.5, 5], [105, 5], [90, 9]]],
    ['squat', [[140, 5], [150, 5]]],
  ]),
];
{
  const prs = records(prSessions);
  const by = Object.fromEntries(prs.map((p) => [p.kind, [p.exerciseId, p.weightKg, p.reps]]));
  assert.equal(prs.length, 4, JSON.stringify(prs));
  assert.deepEqual(by, { weight: ['bench', 105, 5], e1rm: ['bench', 105, 5], reps: ['bench', 90, 9], volume: ['bench', 90, 9] });
  assert.ok(prs.every((p, i) => i === 0 || prs[i - 1].at <= p.at), 'chronological');
  assert.deepEqual(records([prSessions[0]]), []);
}

// Awards: progress toward each threshold.
{
  const s = [
    S(wk(-1, 0, 6, 15), 60, [['bench', [[100, 824]]]], ['chest']),
    ...Array.from({ length: 6 }, (_, i) => S(wk(-1, i % 6, 21, 30), 60, [['bench', [[10, 1]]]], GROUPS.map((g) => g.id))),
  ];
  const a = Object.fromEntries(awards(s, now).map((x) => [x.id, x]));
  assert.equal(a['workouts-1'].earned, true);
  assert.deepEqual([a['workouts-10'].earned, a['workouts-10'].progress, a['workouts-10'].detail], [false, 0.7, '7 of 10 workouts']);
  assert.equal(a['volume-10t'].earned, true);
  assert.equal(a['volume-10t'].detail, 'Lift 10 tonnes in total');
  assert.equal(a['volume-100t'].detail, '82.5 of 100 t'); // 82400 + 6 x 10 kg
  near(a['volume-100t'].progress, 0.8246);
  assert.deepEqual([a['full-body-week'].earned, a['night-owl'].earned, a['early-bird'].progress], [true, true, 0.2]);
  assert.ok(['workouts-50', 'workouts-100', 'workouts-250', 'prs-1', 'prs-10', 'prs-50', 'prs-100', 'streak-4', 'streak-12', 'streak-26', 'streak-52', 'volume-500t', 'volume-1000t'].every((id) => a[id]));
}

// Month recap, calendar, KPIs, weekly volume.
{
  const s = [
    S(new Date(2026, 9, 15, 18).getTime(), 60, [['bench', [[100, 25]]]]), // October: 2500
    S(new Date(2026, 10, 2, 7, 30).getTime(), 50, [['bench', [[100, 10]]]]),
    S(new Date(2026, 10, 9, 7, 30).getTime(), 60, [['bench', [[100, 10]]]]),
    S(new Date(2026, 10, 12, 19).getTime(), 70, [['squat', reps(3, 100, 5)]]),
  ];
  const r = monthRecap(s, info, now);
  assert.deepEqual(r, {
    workouts: 3,
    days: 3,
    sets: 5,
    volume: 3500,
    avgMinutes: 60,
    topExercise: 'squat',
    topGroup: 'legs',
    favWeekday: 0,
    timeOfDay: 'morning',
    deltaVolumePct: 40,
  });
  const night = monthRecap([S(new Date(2026, 10, 3, 21, 30).getTime(), 60, [['bench', [[100, 1]]]])], info, now);
  assert.deepEqual([night.timeOfDay, night.favWeekday, night.deltaVolumePct], ['night', 1, null]);
  assert.deepEqual(monthRecap([], info, now).timeOfDay, null);

  const cal = calendarMonth(s, now);
  assert.equal(cal.length, 30);
  assert.equal(cal[0].date, '2026-11-01');
  assert.deepEqual(cal[11], { date: '2026-11-12', sets: 3, volume: 1500, setsFrac: 0.15, volumeFrac: 1 });
  near(cal[1].volumeFrac, 1000 / 1500);

  assert.deepEqual(kpis(prSessions, now), { workouts: 2, thisMonth: 2, totalVolumeKg: 1220 + 2347.5 + 1450, totalSets: 8, hours: 2, prs: 4 });
  assert.equal(kpis(s, now).thisMonth, 3);

  const wv = weeklyVolume(s, now);
  assert.equal(wv.length, 12);
  assert.equal(wv[11].weekStart, wk(0, 0, 0));
  assert.deepEqual(wv[10], { weekStart: wk(-1, 0, 0), volume: 2500, sets: 4 }); // Nov 9 + Nov 12
}

// DB loader: finished sessions only, oldest first, exercises and sets in position order.
{
  const raw = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql: string) => raw.exec(sql),
    getFirstAsync: async <T>(sql: string, p: (string | number | null)[] = []) => (raw.prepare(sql).get(...p) as T) ?? null,
    getAllAsync: async <T>(sql: string, p: (string | number | null)[] = []) => raw.prepare(sql).all(...p) as T[],
    runAsync: async (sql: string, p: (string | number | null)[] = []) => ({ lastInsertRowId: Number(raw.prepare(sql).run(...p).lastInsertRowid) }),
  };
  await migrate(db);
  const b = await startSession(db, ['legs'], 5000);
  await addSet(db, b, 'r:squat', { weightKg: 60, reps: 10, isWarmup: true }, 5100);
  await addSet(db, b, 'r:squat', { weightKg: 100, reps: 5, isWarmup: false }, 5200);
  await addSet(db, b, 'r:lunge', { weightKg: 20, reps: 12, isWarmup: false }, 5300);
  await finishSession(db, b, 9000);
  const a = await startSession(db, ['chest'], 1000); // inserted later, started earlier
  await addSet(db, a, 'r:bench', { weightKg: 80, reps: 8, isWarmup: false }, 1100);
  await finishSession(db, a, 2000);
  const open = await startSession(db, ['back'], 10_000);
  await addSet(db, open, 'r:row', { weightKg: 50, reps: 10, isWarmup: false }, 10_100);
  assert.deepEqual(await loadInsightSessions(db), [
    { id: a, startedAt: 1000, finishedAt: 2000, groups: ['chest'], exercises: [{ exerciseId: 'r:bench', sets: [{ weightKg: 80, reps: 8, isWarmup: false, doneAt: 1100 }] }] },
    {
      id: b,
      startedAt: 5000,
      finishedAt: 9000,
      groups: ['legs'],
      exercises: [
        { exerciseId: 'r:squat', sets: [{ weightKg: 60, reps: 10, isWarmup: true, doneAt: 5100 }, { weightKg: 100, reps: 5, isWarmup: false, doneAt: 5200 }] },
        { exerciseId: 'r:lunge', sets: [{ weightKg: 20, reps: 12, isWarmup: false, doneAt: 5300 }] },
      ],
    },
  ]);
}

// Demo data: deterministic, ~14 months, every function runs, a ring overflows (also early in the week).
{
  const ids: Record<MuscleGroup, string[]> = {
    chest: ['d:bench', 'd:fly'],
    back: ['d:row'],
    shoulders: ['d:ohp', 'd:raise'],
    biceps: ['d:curl'],
    triceps: ['d:pushdown'],
    forearms: [],
    abs: ['d:crunch'],
    legs: ['d:squat', 'd:rdl', 'd:press'],
  };
  const group = new Map(Object.entries(ids).flatMap(([g, xs]) => xs.map((x) => [x, g as MuscleGroup] as const)));
  const demoInfo: ExerciseInfo = (id) => {
    const g = group.get(id);
    return g ? { name: id, primary: [GROUPS.find((x) => x.id === g)!.slugs[0]], secondary: [], groups: [g] } : undefined;
  };
  for (const t of [now, wk(0, 0, 20), wk(0, 0, 0, 30), wk(0, 6, 23)]) {
    const d = demoSessions(t, ids);
    assert.deepEqual(d, demoSessions(t, ids), 'deterministic');
    const span = (t - d[0].startedAt) / DAY;
    assert.ok(span > 400 && span < 435, `span ${span}`);
    assert.ok(d.every((x) => x.finishedAt <= t && x.startedAt < x.finishedAt), 'nothing in the future');
    assert.ok(d.every((x, i) => i === 0 || d[i - 1].startedAt < x.startedAt), 'oldest first');
    const r = weeklyRings(d, t);
    assert.ok([r.volume, r.sets, r.sessions].some((x) => x.frac > 1), `ring overflow at ${new Date(t)}: ${JSON.stringify(r)}`);
    trends(d, t);
    heatmap(d, t);
    weeklyMuscleSets(d, demoInfo, t);
    recovery(d, demoInfo, t);
    weeklyVolume(d, t);
    muscleBalance(d, demoInfo, t);
    monthRecap(d, demoInfo, t);
    calendarMonth(d, t);
    kpis(d, t);
    const st = weekStreak(d, t);
    assert.ok(st.best >= 26 && st.weeks.some((w) => w.state === 'frozen'), JSON.stringify([st.best, st.current]));
    const a = Object.fromEntries(awards(d, t).map((x) => [x.id, x]));
    assert.ok(a['early-bird'].earned && a['night-owl'].earned && a['full-body-week'].earned && a['prs-10'].earned);
  }
  const d = demoSessions(now, ids);
  const today = isoDate(new Date(now));
  assert.ok(d.some((x) => isoDate(new Date(x.startedAt)) === today), 'Wednesday is a training day: session today');
  assert.ok(d.flatMap((x) => x.exercises).every((e) => !e.exerciseId.startsWith('d:') || group.has(e.exerciseId)));
  const t0 = trends(d, now);
  console.log(
    `demo: ${d.length} sessions, rings ${JSON.stringify(weeklyRings(d, now))}, vol trend ${t0[0].avg365}->${t0[0].avg90}, prs ${records(d).length}`,
  );
}

console.log('insights ok');
