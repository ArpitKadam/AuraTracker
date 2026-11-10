export type Ingredient = {
  /** Group header from the source ("For the sauce"), null when the recipe has no groups. */
  section: string | null;
  name: string;
  quantity: number | null;
  /** Upper bound when the source gives a range ("6-8"), else null. */
  quantityMax: number | null;
  unit: string | null;
  note: string | null;
  emoji: string;
};

export type Step = {
  text: string;
  /** One emoji for the action or main food of the step; null until generated. */
  emoji: string | null;
};

export type NutritionKey = 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG';

export type Nutrition = {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  /** Keys whose value is a model estimate, not printed in the source. Absent when everything is printed. */
  estimated?: NutritionKey[];
};

export type RecipeDraft = {
  isRecipe: boolean;
  title: string;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  ingredients: Ingredient[];
  steps: Step[];
  /** Only values printed in the source; never estimated here. */
  nutrition: Nutrition | null;
  allergens: string[];
  tags: string[];
};

export type ImagePart = { mimeType: string; base64: string };
export type VideoPart = { mimeType: string; base64: string };

export type GeminiConfig = {
  apiKey: string;
  /** e.g. gemini-3.5-flash-lite */
  model: string;
};
