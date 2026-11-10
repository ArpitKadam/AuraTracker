// Run: node scripts/check-overload.ts
// The overload rule from TASK.md, case by case.
import assert from 'node:assert/strict';

import { toKg } from '../src/fitness/db/profile.ts';
import { overloadHint, prefill } from '../src/fitness/overload.ts';
import { formatWeight, toDisplay } from '../src/fitness/units.ts';

const kg = { repMin: 13, weightStepKg: 2.5 };

// Never done: no hint numbers.
assert.deepEqual(overloadHint([], kg), { kind: 'first' });
assert.deepEqual(prefill({ kind: 'first' }), { weightKg: null, reps: null });

// The user's own example: 30 kg x 4 last time -> push for 5-6 at 30 kg.
const h = overloadHint([{ weightKg: 30, reps: 4 }], kg);
assert.deepEqual(h, { kind: 'reps', weightKg: 30, lastReps: 4, from: 5, to: 6 });
assert.deepEqual(prefill(h), { weightKg: 30, reps: 5 });

// 12 reps is still under the 13-15 range: keep weight, push reps.
assert.deepEqual(overloadHint([{ weightKg: 30, reps: 12 }], kg), { kind: 'reps', weightKg: 30, lastReps: 12, from: 13, to: 14 });

// Every top-weight set at 13+ -> add 2.5 kg.
assert.deepEqual(overloadHint([{ weightKg: 30, reps: 13 }, { weightKg: 30, reps: 15 }], kg), {
  kind: 'weight',
  lastWeightKg: 30,
  lastReps: 15,
  weightKg: 32.5,
});

// One top-weight set short of 13 blocks the increase; best reps at that weight drive the target.
assert.deepEqual(overloadHint([{ weightKg: 30, reps: 14 }, { weightKg: 30, reps: 11 }], kg), {
  kind: 'reps',
  weightKg: 30,
  lastReps: 14,
  from: 15,
  to: 16,
});

// Lighter back-off sets don't count against the top weight.
assert.equal(overloadHint([{ weightKg: 40, reps: 13 }, { weightKg: 30, reps: 6 }], kg).kind, 'weight');

// lb mode: step is 5 lb, stored in kg, displayed back as whole plates.
const lb = { repMin: 13, weightStepKg: toKg(5, 'lb') };
const up = overloadHint([{ weightKg: toKg(100, 'lb'), reps: 13 }], lb);
assert.equal(up.kind, 'weight');
assert.equal(up.kind === 'weight' && toDisplay(up.weightKg, 'lb'), 105);
assert.equal(formatWeight(32.5, 'kg'), '32.5 kg');
assert.equal(formatWeight(toKg(45, 'lb'), 'lb'), '45 lb');

console.log('overload ok');
