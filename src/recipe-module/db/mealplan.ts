import type { Db } from './recipes';

export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABEL: Record<Slot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

export type PlannedMeal = { id: number; date: string; slot: Slot; recipeId: number; title: string; thumbnailUri: string | null };

type Row = { id: number; plan_date: string; slot: Slot; recipe_id: number; title: string; thumbnail_uri: string | null };

/** Meals from `from` to `to` inclusive, in slot order within each day. */
export async function listMeals(db: Db, from: string, to: string): Promise<PlannedMeal[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT m.id, m.plan_date, m.slot, m.recipe_id, r.title, r.thumbnail_uri
       FROM meal_plan m JOIN recipes r ON r.id = m.recipe_id
      WHERE m.plan_date BETWEEN ? AND ?
      ORDER BY m.plan_date,
        CASE m.slot WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'dinner' THEN 2 ELSE 3 END, m.id`,
    [from, to],
  );
  return rows.map((r) => ({ id: r.id, date: r.plan_date, slot: r.slot, recipeId: r.recipe_id, title: r.title, thumbnailUri: r.thumbnail_uri }));
}

/** Adds a recipe to a slot. The same recipe twice in one slot is a no-op; returns false then. */
export async function addMeal(db: Db, date: string, slot: Slot, recipeId: number): Promise<boolean> {
  const dup = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM meal_plan WHERE plan_date = ? AND slot = ? AND recipe_id = ?',
    [date, slot, recipeId],
  );
  if (dup) return false;
  await db.runAsync('INSERT INTO meal_plan (plan_date, slot, recipe_id) VALUES (?,?,?)', [date, slot, recipeId]);
  return true;
}

export async function removeMeal(db: Db, id: number): Promise<void> {
  await db.runAsync('DELETE FROM meal_plan WHERE id = ?', [id]);
}
