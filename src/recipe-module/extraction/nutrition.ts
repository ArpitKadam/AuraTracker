import type { Nutrition, NutritionKey } from './types.ts';

export const NUTRITION_KEYS: NutritionKey[] = ['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG'];

export const NUTRITION_SYSTEM_PROMPT = `You estimate nutrition for a recipe from its ingredient list.

Rules:
- Return values PER SERVING, using the servings given. If servings are not stated, treat the whole recipe as one serving.
- Add up the ingredients using standard food-composition values (as in USDA data). Count oil, butter, sugar, sauces and batter that go in; do not subtract oil that stays in a frying pan unless the recipe says to discard it, but do not count it twice.
- When an ingredient has no amount, assume a typical amount for that ingredient in a recipe of this size. A garnish or seasoning counts as a small amount.
- calories in kcal; protein, carbs, fat and fiber in grams. Round to whole numbers.
- This is an estimate. Never refuse; always return numbers.`;

export const NUTRITION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    calories: { type: 'NUMBER' },
    protein_g: { type: 'NUMBER' },
    carbs_g: { type: 'NUMBER' },
    fat_g: { type: 'NUMBER' },
    fiber_g: { type: 'NUMBER' },
  },
  required: ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'],
};

// Per-serving ceilings. Anything above is a model slip (a whole-recipe total, a unit mix-up), not a meal.
const MAX: Record<NutritionKey, number> = { calories: 5000, proteinG: 300, carbsG: 600, fatG: 400, fiberG: 150 };

export type Estimate = Record<NutritionKey, number>;

/** Validates the model's JSON. Throws when a number is missing, negative, not finite or absurd. */
export function parseEstimate(json: unknown): Estimate {
  const o = (json ?? {}) as Record<string, unknown>;
  const raw: Record<NutritionKey, unknown> = {
    calories: o.calories, proteinG: o.protein_g, carbsG: o.carbs_g, fatG: o.fat_g, fiberG: o.fiber_g,
  };
  const out = {} as Estimate;
  for (const k of NUTRITION_KEYS) {
    const v = raw[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX[k]) throw new Error(`Unusable ${k} estimate: ${String(v)}`);
    out[k] = Math.round(v);
  }
  return out;
}

/** Printed values always win; the estimate only fills the gaps, and those keys are recorded as estimated. */
export function mergeEstimate(printed: Nutrition | null, est: Estimate): Nutrition {
  const base: Nutrition = printed ?? { calories: null, proteinG: null, carbsG: null, fatG: null, fiberG: null };
  const merged: Nutrition = { ...base };
  const estimated: NutritionKey[] = [...(base.estimated ?? [])];
  for (const k of NUTRITION_KEYS) {
    if (merged[k] === null) {
      merged[k] = est[k];
      if (!estimated.includes(k)) estimated.push(k);
    }
  }
  if (estimated.length) merged.estimated = estimated;
  return merged;
}

/** True when there is something an estimate could still fill. */
export function canEstimate(n: Nutrition | null): boolean {
  return !n || NUTRITION_KEYS.some((k) => n[k] === null);
}
