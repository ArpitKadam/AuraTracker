import type { Db } from '../../recipe-module/db/recipes.ts';
import { DEFAULT_SPLIT, isoDate, postponeTarget, type DayPlan, type Override, type Split } from '../schedule.ts';

type DayRow = { day: number; primary_g: string; second_g: string };
type OvRow = { date: string; kind: Override['kind']; primary_g: string; second_g: string; other: string | null };

export async function getSplit(db: Db): Promise<Split> {
  const rows = await db.getAllAsync<DayRow>('SELECT day, primary_g, second_g FROM split_days ORDER BY day', []);
  const split = DEFAULT_SPLIT.map((d) => ({ ...d }));
  for (const r of rows) split[r.day] = { primary: JSON.parse(r.primary_g), secondary: JSON.parse(r.second_g) };
  return split;
}

/** A group can be primary or secondary on a day, not both; primary wins. */
export async function saveSplitDay(db: Db, day: number, plan: DayPlan): Promise<void> {
  if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error('day must be 0-6');
  const primary = [...new Set(plan.primary)];
  const secondary = [...new Set(plan.secondary)].filter((g) => !primary.includes(g));
  await db.runAsync('INSERT OR REPLACE INTO split_days (day, primary_g, second_g) VALUES (?, ?, ?)', [day, JSON.stringify(primary), JSON.stringify(secondary)]);
}

/** Overrides from `from` (inclusive) onward; old ones don't matter for planning. */
export async function getOverrides(db: Db, from: Date): Promise<Map<string, Override>> {
  const rows = await db.getAllAsync<OvRow>('SELECT * FROM plan_overrides WHERE date >= ?', [isoDate(from)]);
  return new Map(rows.map((r) => [r.date, { date: r.date, kind: r.kind, plan: { primary: JSON.parse(r.primary_g), secondary: JSON.parse(r.second_g) }, other: r.other }]));
}

export async function skipDay(db: Db, date: Date, plan: DayPlan): Promise<void> {
  await db.runAsync("INSERT OR REPLACE INTO plan_overrides (date, kind, primary_g, second_g, other) VALUES (?, 'skip', ?, ?, NULL)", [
    isoDate(date),
    JSON.stringify(plan.primary),
    JSON.stringify(plan.secondary),
  ]);
}

/** Moves the day's plan to the next free rest day. Returns the target date, or null if none in the next 2 weeks. */
export async function postponeDay(db: Db, date: Date, plan: DayPlan): Promise<Date | null> {
  const [split, overrides] = await Promise.all([getSplit(db), getOverrides(db, date)]);
  const target = postponeTarget(date, split, overrides);
  if (!target) return null;
  const [from, to] = [isoDate(date), isoDate(target)];
  const p = [JSON.stringify(plan.primary), JSON.stringify(plan.secondary)];
  await db.runAsync("INSERT OR REPLACE INTO plan_overrides (date, kind, primary_g, second_g, other) VALUES (?, 'postponed', ?, ?, ?)", [from, ...p, to]);
  await db.runAsync("INSERT OR REPLACE INTO plan_overrides (date, kind, primary_g, second_g, other) VALUES (?, 'moved', ?, ?, ?)", [to, ...p, from]);
  return target;
}

/** Undo a skip or postpone on `date` (removing the moved copy too). */
export async function undoDay(db: Db, date: Date): Promise<void> {
  const iso = isoDate(date);
  await db.runAsync("DELETE FROM plan_overrides WHERE (kind = 'moved' AND other = ?) OR date = ?", [iso, iso]);
}
