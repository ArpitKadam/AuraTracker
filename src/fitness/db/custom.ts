import type { Db } from '../../recipe-module/db/recipes.ts';
import type { CatalogExercise, Equipment, MuscleGroup } from '../catalog-types.ts';
import { slugsFor } from '../groups.ts';

export type CustomInput = { name: string; groups: MuscleGroup[]; equipment: Equipment; photoUri: string | null };

type Row = { id: string; name: string; primary_m: string; secondary: string; groups: string; equipment: Equipment; photo_uri: string | null };

export const NAME_MAX = 60;

/** Trims and validates; throws a user-readable message. */
export function validateCustom(input: CustomInput): CustomInput {
  const name = input.name.replace(/\s+/g, ' ').trim();
  if (name.length < 2) throw new Error('Give the exercise a name');
  if (name.length > NAME_MAX) throw new Error(`Keep the name under ${NAME_MAX} characters`);
  if (!input.groups.length) throw new Error('Pick at least one muscle group');
  return { ...input, name };
}

const toExercise = (r: Row): CatalogExercise => ({
  id: r.id,
  name: r.name,
  primary: JSON.parse(r.primary_m),
  secondary: JSON.parse(r.secondary),
  groups: JSON.parse(r.groups),
  equipment: r.equipment,
  mechanic: null,
  level: null,
  category: 'strength',
  instructions: [],
  tips: [],
  media: [],
  sources: ['custom'],
  photoUri: r.photo_uri,
});

export async function listCustom(db: Db): Promise<CatalogExercise[]> {
  const rows = await db.getAllAsync<Row>('SELECT * FROM custom_exercises ORDER BY name COLLATE NOCASE', []);
  return rows.map(toExercise);
}

export async function createCustom(db: Db, input: CustomInput, now: number): Promise<string> {
  const v = validateCustom(input);
  const dupe = await db.getFirstAsync<{ id: string }>('SELECT id FROM custom_exercises WHERE name = ? COLLATE NOCASE', [v.name]);
  if (dupe) throw new Error('You already have an exercise with that name');
  const id = `c:${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await db.runAsync(
    'INSERT INTO custom_exercises (id, name, primary_m, secondary, groups, equipment, photo_uri, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, v.name, JSON.stringify(slugsFor(v.groups.slice(0, 1))), JSON.stringify(slugsFor(v.groups.slice(1))), JSON.stringify(v.groups), v.equipment, v.photoUri, now],
  );
  return id;
}

export async function updateCustom(db: Db, id: string, input: CustomInput): Promise<void> {
  const v = validateCustom(input);
  const dupe = await db.getFirstAsync<{ id: string }>('SELECT id FROM custom_exercises WHERE name = ? COLLATE NOCASE AND id <> ?', [v.name, id]);
  if (dupe) throw new Error('You already have an exercise with that name');
  await db.runAsync('UPDATE custom_exercises SET name = ?, primary_m = ?, secondary = ?, groups = ?, equipment = ?, photo_uri = ? WHERE id = ?', [
    v.name,
    JSON.stringify(slugsFor(v.groups.slice(0, 1))),
    JSON.stringify(slugsFor(v.groups.slice(1))),
    JSON.stringify(v.groups),
    v.equipment,
    v.photoUri,
    id,
  ]);
}

/** Logged sets reference the exercise id, so an exercise with history can't be deleted (it would orphan them). */
export async function isLogged(db: Db, id: string): Promise<boolean> {
  return !!(await db.getFirstAsync<{ x: number }>('SELECT 1 AS x FROM session_exercises WHERE exercise_id = ? LIMIT 1', [id]));
}

export async function deleteCustom(db: Db, id: string): Promise<void> {
  if (await isLogged(db, id)) throw new Error('This exercise has logged sets, so it stays');
  await db.runAsync('DELETE FROM custom_exercises WHERE id = ?', [id]);
}
