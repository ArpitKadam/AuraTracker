// Schedules the "next time" reminders with expo-notifications. Local alarms survive the app being killed and
// (via expo-notifications' boot receiver) a reboot. Recomputed for the next 7 days whenever anything that
// changes them happens; calls are serialised so overlapping reschedules can't double-book.
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Storage } from 'expo-sqlite/kv-store';

import type { Db } from '../recipe-module/db/recipes';
import type { MuscleGroup } from './catalog-types';
import { listPastSessions } from './db/history';
import { getProfile, type Profile } from './db/profile';
import { lastSessionSets } from './db/session';
import { getOverrides, getSplit } from './db/split';
import { loadExercises } from './exercises';
import { groupLabel } from './groups';
import { overloadHint } from './overload';
import { recommend } from './recommend';
import { parseLastMinutes, planReminders, type ReminderDay } from './reminders';
import { dayStatus, groupsOf } from './schedule';
import { formatWeight } from './units';

const CHANNEL = 'next-time';
const DAYS_AHEAD = 7;
const KEY_ON = 'fitness.notify.on';
const KEY_LAST = 'fitness.notify.last';
const MAX_TARGETS = 4;

// Device-local settings: reminders belong to this phone, not to the exported workout data.
export function getReminderSettings(): { on: boolean; lastMinutes: number } {
  return {
    on: Storage.getItemSync(KEY_ON) !== '0',
    lastMinutes: parseLastMinutes(Storage.getItemSync(KEY_LAST)),
  };
}

export function setReminderSettings(s: { on?: boolean; lastMinutes?: number }) {
  if (s.on !== undefined) Storage.setItemSync(KEY_ON, s.on ? '1' : '0');
  if (s.lastMinutes !== undefined) Storage.setItemSync(KEY_LAST, String(s.lastMinutes));
}

/** Asks once (Android 13+ needs POST_NOTIFICATIONS at runtime). Returns whether we may post. */
export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function targetsFor(db: Db, groups: MuscleGroup[], profile: Profile): Promise<string[]> {
  const [{ all, byId }, history] = await Promise.all([loadExercises(db), listPastSessions(db)]);
  const picks = recommend(groups, all, history, profile)
    .flatMap((g) => g.picks)
    .filter((p) => p.reason === 'staple' || p.reason === 'history');
  const out: string[] = [];
  for (const p of picks) {
    if (out.length >= MAX_TARGETS) break;
    const hint = overloadHint(await lastSessionSets(db, p.exerciseId), { repMin: profile.repMin, weightStepKg: profile.weightStep });
    const name = byId.get(p.exerciseId)?.name ?? 'Exercise';
    if (hint.kind === 'reps') out.push(`${name}: push for ${hint.from}-${hint.to} reps at ${formatWeight(hint.weightKg, profile.units)}`);
    if (hint.kind === 'weight') out.push(`${name}: add weight, go for ${formatWeight(hint.weightKg, profile.units)}`);
  }
  return out;
}

async function trainedOn(db: Db, date: Date): Promise<boolean> {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sessions WHERE started_at >= ? AND started_at < ?', [start, start + 86_400_000]);
  return (row?.n ?? 0) > 0;
}

async function reschedule(db: Db): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const settings = getReminderSettings();
  if (!settings.on || !(await Notifications.getPermissionsAsync()).granted) return 0;

  await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Workout reminders', importance: AndroidImportance.DEFAULT });
  const now = new Date();
  const [split, overrides, profile] = await Promise.all([getSplit(db), getOverrides(db, now), getProfile(db)]);
  const cache = new Map<string, string[]>();
  const days: ReminderDay[] = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const status = dayStatus(date, split, overrides);
    if (status.kind !== 'planned' && status.kind !== 'moved') continue;
    const groups = groupsOf(status.plan);
    const key = groups.join(',');
    if (!cache.has(key)) cache.set(key, await targetsFor(db, groups, profile));
    days.push({ date, status, trained: i === 0 && (await trainedOn(db, date)), title: groups.map(groupLabel).join(' + '), targets: cache.get(key)! });
  }
  const reminders = planReminders(days, settings.lastMinutes, now);
  for (const r of reminders) {
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: CHANNEL },
    });
  }
  return reminders.length;
}

let chain: Promise<unknown> = Promise.resolve();
/** Recompute and schedule; safe to call often. Failures are swallowed so they never break logging. */
export function rescheduleReminders(db: Db): Promise<number> {
  const next = chain.then(() => reschedule(db)).catch(() => 0);
  chain = next;
  return next;
}
