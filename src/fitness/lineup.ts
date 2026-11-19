// What the lineup picker offers per muscle group. Pure: no DB, no clock.
import type { CatalogExercise, MuscleGroup } from './catalog-types.ts';
import { candidates, type PastSession, type Prefs } from './recommend.ts';

export type GroupOptions = {
  group: MuscleGroup;
  /** Done before: most sessions first, then most recent. */
  history: string[];
  /** The must-have list (catalog order), then the user's own exercises. */
  curated: string[];
  /** Rest of the catalog for this group, filtered by equipment and experience. */
  more: string[];
};

// "Wide-Grip Lat Pulldown" and "Wide Grip Lat Pull-Down" are the same pick.
const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');

export function lineupOptions(groups: MuscleGroup[], all: CatalogExercise[], history: PastSession[], prefs: Prefs): GroupOptions[] {
  const byId = new Map(all.map((e) => [e.id, e]));
  const stats = new Map<string, { n: number; last: number }>();
  for (const s of history)
    for (const id of new Set(s.exerciseIds)) {
      const x = stats.get(id) ?? { n: 0, last: 0 };
      stats.set(id, { n: x.n + 1, last: Math.max(x.last, s.startedAt) });
    }
  const taken = new Set<string>(); // an exercise in two picked groups shows once, under the first

  return groups.map((group) => {
    const free = (e: CatalogExercise | undefined): e is CatalogExercise => !!e && e.groups.includes(group) && !taken.has(e.id);
    const claim = (ids: string[]) => (ids.forEach((id) => taken.add(id)), ids);
    const done = claim(
      [...stats.keys()]
        .map((id) => byId.get(id))
        .filter(free)
        .sort((a, b) => stats.get(b.id)!.n - stats.get(a.id)!.n || stats.get(b.id)!.last - stats.get(a.id)!.last)
        .map((e) => e.id),
    );
    const curated = claim([
      ...all.filter((e) => e.curated !== null && free(e)).sort((a, b) => a.curated! - b.curated!).map((e) => e.id),
      ...all.filter((e) => e.sources[0] === 'custom' && free(e)).map((e) => e.id),
    ]);
    // Catalog look-alikes of a listed exercise stay hidden (they would split history); done-before ones already show above.
    const listed = new Set([...done, ...curated].map((id) => nameKey(byId.get(id)!.name)));
    const more = claim(candidates(all, group, prefs).filter((e) => free(e) && !listed.has(nameKey(e.name))).map((e) => e.id));
    return { group, history: done, curated, more };
  });
}
