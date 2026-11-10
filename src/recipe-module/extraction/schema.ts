import { parseStep } from './step';
import type { Ingredient, Nutrition, RecipeDraft, Step } from './types';

const nullableNumber = { type: 'NUMBER', nullable: true } as const;
const nullableInt = { type: 'INTEGER', nullable: true } as const;
const nullableString = { type: 'STRING', nullable: true } as const;

/** Gemini responseSchema (OpenAPI subset). Snake_case; mapped to camelCase by parseRecipeDraft. */
export const RECIPE_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_recipe: { type: 'BOOLEAN' },
    title: { type: 'STRING' },
    servings: nullableNumber,
    prep_minutes: nullableInt,
    cook_minutes: nullableInt,
    total_minutes: nullableInt,
    ingredients: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          section: nullableString,
          name: { type: 'STRING' },
          quantity: nullableNumber,
          quantity_max: nullableNumber,
          unit: nullableString,
          note: nullableString,
          emoji: { type: 'STRING' },
        },
        required: ['name', 'emoji', 'note'],
      },
    },
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { text: { type: 'STRING' }, emoji: { type: 'STRING' } },
        required: ['text', 'emoji'],
      },
    },
    nutrition_per_serving: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        calories: nullableNumber,
        protein_g: nullableNumber,
        carbs_g: nullableNumber,
        fat_g: nullableNumber,
        fiber_g: nullableNumber,
      },
    },
    allergens: { type: 'ARRAY', items: { type: 'STRING' } },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['is_recipe', 'title', 'ingredients', 'steps'],
} as const;

const FALLBACK_EMOJI = '🍽️';

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter((s): s is string => s !== null) : [];

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseIngredient(raw: unknown): Ingredient | null {
  if (!isObj(raw)) return null;
  const name = str(raw.name);
  if (!name) return null;
  const emoji = str(raw.emoji);
  return {
    section: str(raw.section),
    name,
    quantity: num(raw.quantity),
    quantityMax: num(raw.quantity_max),
    unit: str(raw.unit),
    note: str(raw.note),
    // Reject long strings: a model that returns words instead of one emoji is wrong.
    emoji: emoji && [...emoji].length <= 4 ? emoji : FALLBACK_EMOJI,
  };
}

function parseNutrition(raw: unknown): Nutrition | null {
  if (!isObj(raw)) return null;
  const n: Nutrition = {
    calories: num(raw.calories),
    proteinG: num(raw.protein_g),
    carbsG: num(raw.carbs_g),
    fatG: num(raw.fat_g),
    fiberG: num(raw.fiber_g),
  };
  return Object.values(n).every((v) => v === null) ? null : n;
}

/** Throws on non-object input; otherwise returns a cleaned draft. */
export function parseRecipeDraft(json: unknown): RecipeDraft {
  if (!isObj(json)) throw new Error('Gemini returned a non-object recipe');
  const ingredients = Array.isArray(json.ingredients)
    ? json.ingredients.map(parseIngredient).filter((i): i is Ingredient => i !== null)
    : [];
  const steps = Array.isArray(json.steps) ? json.steps.map(parseStep).filter((x): x is Step => x !== null) : [];
  const prep = int(json.prep_minutes);
  const cook = int(json.cook_minutes);
  let total = int(json.total_minutes);
  if (total === null && prep !== null && cook !== null) total = prep + cook;

  return {
    // A "recipe" with neither ingredients nor steps is not usable, whatever the model said.
    isRecipe: json.is_recipe === true && (ingredients.length > 0 || steps.length > 0),
    title: str(json.title) ?? 'Untitled recipe',
    servings: num(json.servings),
    prepMinutes: prep,
    cookMinutes: cook,
    totalMinutes: total,
    ingredients,
    steps,
    nutrition: parseNutrition(json.nutrition_per_serving),
    allergens: strList(json.allergens),
    tags: strList(json.tags),
  };
}

/** Nothing usable to cook from yet: no recipe, no ingredients, or no method at all. */
export function isIncomplete(d: RecipeDraft): boolean {
  return !d.isRecipe || d.ingredients.length === 0 || d.steps.length === 0;
}

/** A method that uses foods but lists no ingredients is internally inconsistent. */
export function hasStepsButNoIngredients(d: RecipeDraft): boolean {
  return d.steps.length > 0 && d.ingredients.length === 0;
}
