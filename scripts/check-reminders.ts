// Run: node scripts/check-reminders.ts
// Which reminders get scheduled, and when (TASK.md 10b).
import assert from 'node:assert/strict';

import { DEFAULT_LAST_MINUTES, formatClock, parseLastMinutes, planReminders, slotMinutes, type ReminderDay } from '../src/fitness/reminders.ts';

const plan = { primary: ['chest' as const], secondary: ['triceps' as const, 'abs' as const] };
const tue = new Date(2026, 10, 10);
const day = (o: Partial<ReminderDay> = {}): ReminderDay => ({
  date: tue,
  status: { kind: 'planned', plan },
  trained: false,
  title: 'Chest + Triceps + Abs',
  targets: ['Bench Press: push for 5-6 reps at 30 kg', 'Rope Pushdown: add 2.5 kg, go for 25 kg'],
  ...o,
});
const hhmm = (d: Date) => formatClock(d.getHours() * 60 + d.getMinutes());

// 07:00, 11:00, 15:00, 19:00 with the default; moving the last time moves all four.
assert.deepEqual(slotMinutes(DEFAULT_LAST_MINUTES).map(formatClock), ['07:00', '11:00', '15:00', '19:00']);
assert.deepEqual(slotMinutes(18 * 60 + 30).map(formatClock), ['06:30', '10:30', '14:30', '18:30']);
assert.deepEqual(slotMinutes(10 * 60).map(formatClock), ['02:00', '06:00', '10:00'], 'slots before midnight dropped');

// Morning of a planned day: four reminders, targets rotate, last one says "in a bit".
const early = new Date(2026, 10, 10, 6, 0);
const r = planReminders([day()], DEFAULT_LAST_MINUTES, early);
assert.deepEqual(r.map((x) => hhmm(x.at)), ['07:00', '11:00', '15:00', '19:00']);
assert.deepEqual(r.map((x) => x.body), [
  'Bench Press: push for 5-6 reps at 30 kg',
  'Rope Pushdown: add 2.5 kg, go for 25 kg',
  'Bench Press: push for 5-6 reps at 30 kg',
  'Rope Pushdown: add 2.5 kg, go for 25 kg',
]);
assert.equal(r[3].title, 'Chest + Triceps + Abs in a bit');

// Past slots are not scheduled.
assert.deepEqual(planReminders([day()], DEFAULT_LAST_MINUTES, new Date(2026, 10, 10, 12, 0)).map((x) => hhmm(x.at)), ['15:00', '19:00']);

// Started training -> stop. Skipped / postponed-away / rest -> none. Moved-in day -> yes.
assert.equal(planReminders([day({ trained: true })], DEFAULT_LAST_MINUTES, early).length, 0);
assert.equal(planReminders([day({ status: { kind: 'skipped', plan } })], DEFAULT_LAST_MINUTES, early).length, 0);
assert.equal(planReminders([day({ status: { kind: 'postponed', plan, to: '2026-11-15' } })], DEFAULT_LAST_MINUTES, early).length, 0);
assert.equal(planReminders([day({ status: { kind: 'rest' } })], DEFAULT_LAST_MINUTES, early).length, 0);
const sun = new Date(2026, 10, 15);
assert.equal(planReminders([day({ date: sun, status: { kind: 'moved', plan, from: '2026-11-10' } })], DEFAULT_LAST_MINUTES, early).length, 4);

// No history yet: a single plain reminder at the last slot.
const fresh = planReminders([day({ targets: [] })], DEFAULT_LAST_MINUTES, early);
assert.equal(fresh.length, 1);
assert.equal(hhmm(fresh[0].at), '19:00');
assert.match(fresh[0].body, /13-15/);

// Stored setting: nothing saved yet must mean 19:00, not midnight (Number(null) === 0 bit us on device).
assert.equal(parseLastMinutes(null), DEFAULT_LAST_MINUTES);
assert.equal(parseLastMinutes(''), DEFAULT_LAST_MINUTES);
assert.equal(parseLastMinutes('abc'), DEFAULT_LAST_MINUTES);
assert.equal(parseLastMinutes('1500'), DEFAULT_LAST_MINUTES);
assert.equal(parseLastMinutes('1110'), 1110);
assert.equal(parseLastMinutes('0'), 0, 'an explicit 00:00 is still honoured');

console.log('reminders ok');
