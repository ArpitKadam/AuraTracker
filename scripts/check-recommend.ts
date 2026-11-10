// Run: node scripts/check-recommend.ts
// Exercises every ranking rule in src/fitness/recommend.ts against a small synthetic catalog.
import assert from 'node:assert/strict';

import type { CatalogExercise } from '../src/fitness/catalog-types.ts';
import { groupFromName } from '../src/fitness/groups.ts';
import { PER_GROUP, recommend, swapFor, type PastSession } from '../src/fitness/recommend.ts';

const ex = (id: string, o: Partial<CatalogExercise> = {}): CatalogExercise => ({
  id,
  name: id,
  primary: ['chest'],
  secondary: [],
  groups: ['chest'],
  equipment: 'barbell',
  mechanic: 'compound',
  level: 'beginner',
  category: 'strength',
  instructions: [],
  tips: [],
  media: ['a.webp'],
  sources: ['repdb'],
  ...o,
});

const catalog = [
  ex('bench'),
  ex('incline-db', { equipment: 'dumbbell' }),
  ex('fly', { mechanic: 'isolation', equipment: 'cable' }),
  ex('pushup', { equipment: 'bodyweight' }),
  ex('dips', { groups: ['chest', 'triceps'], primary: ['chest', 'triceps'], equipment: 'bodyweight' }),
  ex('pec-deck', { mechanic: 'isolation', equipment: 'machine' }),
  ex('decline', { level: 'advanced' }),
  ex('chest-stretch', { category: 'stretching', equipment: 'bodyweight' }),
  ex('floor-press', { equipment: 'dumbbell' }),
  ex('svend', { mechanic: 'isolation', equipment: 'other' }),
  ex('pushdown', { groups: ['triceps'], primary: ['triceps'], equipment: 'cable', mechanic: 'isolation' }),
  ex('skull', { groups: ['triceps'], primary: ['triceps'], equipment: 'ez-bar', mechanic: 'isolation' }),
];
const gym = { equipment: 'gym' as const, experience: 'intermediate' as const };
const s = (day: number, groups: PastSession['groups'], exerciseIds: string[]): PastSession => ({ startedAt: day * 86_400_000, groups, exerciseIds });
const ids = (g: { picks: { exerciseId: string }[] }) => g.picks.map((p) => p.exerciseId);

// No history: catalog fill only, compound first, no stretches, no advanced for intermediate.
{
  const [chest] = recommend(['chest'], catalog, [], gym);
  assert.equal(chest.picks.length, PER_GROUP);
  assert.ok(chest.picks.every((p) => p.reason === 'catalog'));
  assert.ok(!ids(chest).includes('chest-stretch') && !ids(chest).includes('decline'));
  const firstIso = chest.picks.findIndex((p) => catalog.find((e) => e.id === p.exerciseId)!.mechanic === 'isolation');
  assert.ok(chest.picks.slice(firstIso).every((p) => catalog.find((e) => e.id === p.exerciseId)!.mechanic === 'isolation'));
}

// Staples (>= 80% of last 5 chest sessions) first, then other history oldest-first, then catalog.
{
  const history = [
    s(1, ['chest'], ['bench', 'fly']),
    s(3, ['chest'], ['bench', 'incline-db']),
    s(5, ['chest'], ['bench', 'pec-deck']),
    s(7, ['chest'], ['bench', 'incline-db']),
    s(9, ['chest', 'triceps'], ['bench', 'incline-db', 'pushdown']),
  ];
  const [chest] = recommend(['chest'], catalog, history, gym);
  assert.deepEqual(chest.picks.slice(0, 1), [{ exerciseId: 'bench', reason: 'staple' }]); // 5/5
  // incline-db is 3/5 = 60%, so history; fly (day 1) is longer ago than pec-deck (day 5) and incline (day 9)
  assert.deepEqual(chest.picks.slice(1, 4), [
    { exerciseId: 'fly', reason: 'history' },
    { exerciseId: 'pec-deck', reason: 'history' },
    { exerciseId: 'incline-db', reason: 'history' },
  ]);
  assert.equal(chest.picks[4].reason, 'catalog');
}

// Exercise done every single session is a staple even with one session; triceps-only ids never leak into chest.
{
  const [chest, tri] = recommend(['chest', 'triceps'], catalog, [s(2, ['chest', 'triceps'], ['bench', 'pushdown'])], gym);
  assert.deepEqual(chest.picks[0], { exerciseId: 'bench', reason: 'staple' });
  assert.ok(!ids(chest).includes('pushdown'));
  assert.deepEqual(tri.picks[0], { exerciseId: 'pushdown', reason: 'staple' });
  // dips hits both groups but appears once
  assert.equal([...ids(chest), ...ids(tri)].filter((i) => i === 'dips').length, 1);
}

// Variety nudge after 3 identical chest sessions: one never-done compound is offered.
{
  const same = ['bench', 'incline-db', 'fly', 'pec-deck', 'pushup', 'dips'];
  const history = [s(1, ['chest'], same), s(3, ['chest'], same), s(5, ['chest'], same)];
  const [chest] = recommend(['chest'], catalog, history, gym);
  const fresh = chest.picks.find((p) => p.reason === 'variety');
  assert.ok(fresh, 'variety pick present');
  assert.ok(!same.includes(fresh.exerciseId));
  assert.equal(catalog.find((e) => e.id === fresh.exerciseId)!.mechanic, 'compound');
  assert.equal(chest.picks.length, PER_GROUP);
}

// Equipment access filters the catalog fill.
{
  const [db] = recommend(['chest'], catalog, [], { equipment: 'dumbbells', experience: 'intermediate' });
  assert.ok(ids(db).every((i) => ['dumbbell', 'bodyweight'].includes(catalog.find((e) => e.id === i)!.equipment)));
  const [bw] = recommend(['chest'], catalog, [], { equipment: 'bodyweight', experience: 'advanced' });
  assert.deepEqual(new Set(ids(bw)), new Set(['pushup', 'dips']));
}

// Swap: same group, not already shown, prefers the same primary muscle.
{
  const shown = new Set(['bench', 'incline-db', 'fly']);
  const next = swapFor('bench', 'chest', shown, catalog, gym);
  assert.ok(next && !shown.has(next));
  assert.equal(swapFor('bench', 'chest', new Set(catalog.map((e) => e.id)), catalog, gym), null);
}

// Split names map to picker groups.
assert.equal(groupFromName('Shoulder'), 'shoulders');
assert.equal(groupFromName('Legs'), 'legs');
assert.equal(groupFromName('Triceps'), 'triceps');
assert.equal(groupFromName('Cardio'), null);

console.log('recommend ok');
