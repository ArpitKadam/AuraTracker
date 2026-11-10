// Run: node scripts/check-nutrition.ts
// Offline: estimate validation and the merge that never overwrites printed values.
import assert from 'node:assert/strict';

import { canEstimate, mergeEstimate, parseEstimate } from '../src/recipe-module/extraction/nutrition.ts';

const good = { calories: 412.4, protein_g: 31.6, carbs_g: 20, fat_g: 18, fiber_g: 2 };
assert.deepEqual(parseEstimate(good), { calories: 412, proteinG: 32, carbsG: 20, fatG: 18, fiberG: 2 }, 'rounded to whole numbers');
assert.throws(() => parseEstimate({ ...good, calories: -5 }));
assert.throws(() => parseEstimate({ ...good, calories: 9000 }), /absurd|Unusable/);
assert.throws(() => parseEstimate({ ...good, protein_g: '30' }), /Unusable/);
assert.throws(() => parseEstimate({ ...good, fat_g: NaN }));
assert.throws(() => parseEstimate({ calories: 100 }), 'missing fields rejected');
assert.throws(() => parseEstimate(null));
assert.deepEqual(parseEstimate({ ...good, fiber_g: 0 }).fiberG, 0, 'zero is a valid value');

const est = parseEstimate(good);

// nothing printed: everything is estimated
let n = mergeEstimate(null, est);
assert.deepEqual([n.calories, n.proteinG, n.carbsG, n.fatG, n.fiberG], [412, 32, 20, 18, 2]);
assert.deepEqual(n.estimated, ['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG']);

// printed calories + protein stay exactly as printed; only the gaps are filled and marked
n = mergeEstimate({ calories: 390, proteinG: 40, carbsG: null, fatG: null, fiberG: null }, est);
assert.deepEqual([n.calories, n.proteinG, n.carbsG, n.fatG, n.fiberG], [390, 40, 20, 18, 2]);
assert.deepEqual(n.estimated, ['carbsG', 'fatG', 'fiberG']);

// a printed zero is a value, not a gap
n = mergeEstimate({ calories: 100, proteinG: 0, carbsG: 5, fatG: 1, fiberG: 0 }, est);
assert.deepEqual([n.proteinG, n.fiberG], [0, 0]);
assert.equal(n.estimated, undefined, 'fully printed: nothing marked');

// running it again changes nothing and keeps earlier marks
const once = mergeEstimate({ calories: 390, proteinG: null, carbsG: null, fatG: null, fiberG: null }, est);
const twice = mergeEstimate(once, parseEstimate({ calories: 1, protein_g: 1, carbs_g: 1, fat_g: 1, fiber_g: 1 }));
assert.deepEqual(twice, once, 'already-estimated values are kept, not re-estimated');

assert.equal(canEstimate(null), true);
assert.equal(canEstimate({ calories: 1, proteinG: null, carbsG: 1, fatG: 1, fiberG: 1 }), true);
assert.equal(canEstimate(once), false, 'after an estimate there is nothing left to fill');
assert.equal(canEstimate({ calories: 1, proteinG: 1, carbsG: 1, fatG: 1, fiberG: 1 }), false);
console.log('check-nutrition OK');
