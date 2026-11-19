// Run: node scripts/check-lineup.ts
// Lineup picker tiers: history first (count, then recency), must-have list in order, customs, then the rest.
import assert from 'node:assert/strict';

import type { CatalogExercise } from '../src/fitness/catalog-types.ts';
import { lineupOptions } from '../src/fitness/lineup.ts';

const ex = (id: string, groups: CatalogExercise['groups'], extra: Partial<CatalogExercise> = {}): CatalogExercise => ({
  id, name: id, primary: ['chest'], secondary: [], groups, equipment: 'barbell', mechanic: 'compound', level: 'beginner',
  category: 'strength', instructions: [], tips: [], media: [], video: null, curated: null, sources: ['repdb'], ...extra,
});
const all = [
  ex('incline', ['chest'], { curated: 1 }),
  ex('flat', ['chest'], { curated: 0 }),
  ex('fly', ['chest'], { curated: 2 }),
  ex('dips', ['chest', 'triceps'], { curated: 3 }),
  ex('mine', ['chest'], { sources: ['custom'] }),
  ex('pushup', ['chest'], { equipment: 'bodyweight' }),
  ex('cable', ['chest'], { equipment: 'cable' }),
  ex('stretch', ['chest'], { category: 'stretching' }),
  ex('pushdown', ['triceps'], { primary: ['triceps'], curated: 4 }),
  ex('f:flat', ['chest'], { name: 'FLAT-s' }), // look-alike of the curated "flat"
];
const s = (startedAt: number, exerciseIds: string[]) => ({ startedAt, groups: ['chest' as const], exerciseIds });
const gym = { equipment: 'gym' as const, experience: 'advanced' as const };

// No history: must-have order, then customs, then catalog fill (no stretches); every id once.
const [fresh] = lineupOptions(['chest'], all, [], gym);
assert.deepEqual(fresh.history, []);
assert.deepEqual(fresh.curated, ['flat', 'incline', 'fly', 'dips', 'mine']);
assert.deepEqual(fresh.more.sort(), ['cable', 'pushup'], 'look-alike name hidden');

// History rises to the top: fly done twice beats cable done once later; ties break on recency.
const hist = [s(1, ['fly']), s(2, ['fly', 'flat']), s(3, ['cable']), s(4, ['pushdown'])];
const [chest, tri] = lineupOptions(['chest', 'triceps'], all, hist, gym);
assert.deepEqual(chest.history, ['fly', 'cable', 'flat']);
assert.deepEqual(chest.curated, ['incline', 'dips', 'mine']);
assert.deepEqual(chest.more, ['pushup']);
// Dips already listed under chest; pushdown history is triceps-only.
assert.deepEqual(tri, { group: 'triceps', history: ['pushdown'], curated: [], more: [] });

// Equipment filter applies to "more" only; the must-have list is always offered.
const [home] = lineupOptions(['chest'], all, [], { equipment: 'bodyweight', experience: 'beginner' });
assert.deepEqual(home.curated, ['flat', 'incline', 'fly', 'dips', 'mine']);
assert.deepEqual(home.more, ['pushup']);
console.log('lineup ok');
