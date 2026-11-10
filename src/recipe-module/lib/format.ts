import type { Ingredient } from '../extraction/types';

export type UnitSystem = 'original' | 'metric' | 'us';

const FRACTIONS: [number, string][] = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [3 / 8, '⅜'],
  [1 / 2, '½'],
  [5 / 8, '⅝'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [7 / 8, '⅞'],
];

/** 1.5 -> "1½", 0.25 -> "¼", 0.1 -> "0.1", 250 -> "250". */
export function formatQuantity(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n >= 10) return String(Math.round(n * 10) / 10).replace(/\.0$/, '');
  let whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.03) return String(whole);
  if (frac > 0.97) return String(whole + 1);
  for (const [v, glyph] of FRACTIONS) {
    if (Math.abs(frac - v) < 0.015) return whole > 0 ? `${whole}${glyph}` : glyph;
  }
  // one decimal from 1 up (2.82 oz -> 2.8), two below (0.17)
  return String(n >= 1 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100);
}

export function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

type Canon = 'tsp' | 'tbsp' | 'cup' | 'ml' | 'l' | 'g' | 'kg' | 'oz' | 'lb' | 'floz';
const UNIT_ALIASES: Record<string, Canon> = {
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp',
  cup: 'cup', cups: 'cup',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  g: 'g', gram: 'g', grams: 'g', gm: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  'fl oz': 'floz',
};
const canon = (u: string | null): Canon | null => (u ? UNIT_ALIASES[u.toLowerCase().trim()] ?? null : null);

// Base amounts in ml (volume) and g (weight).
const ML: Partial<Record<Canon, number>> = { tsp: 4.93, tbsp: 14.79, cup: 240, ml: 1, l: 1000, floz: 29.57 };
const G: Partial<Record<Canon, number>> = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 };

const roundNice = (n: number) => (n >= 100 ? Math.round(n / 5) * 5 : n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

/** Converts a quantity+unit to the chosen system. Count-style units (clove, pinch, whole) pass through. */
export function convertQuantity(q: number, unit: string | null, system: UnitSystem): { quantity: number; unit: string | null } {
  const c = canon(unit);
  if (system === 'original' || !c) return { quantity: q, unit };

  if (c in ML) {
    const ml = q * ML[c]!;
    if (system === 'metric') {
      return ml >= 1000 ? { quantity: roundNice(ml / 1000), unit: 'l' } : { quantity: roundNice(ml), unit: 'ml' };
    }
    if (ml < 15) return { quantity: ml / ML.tsp!, unit: 'tsp' };
    if (ml < 60) return { quantity: ml / ML.tbsp!, unit: 'tbsp' };
    return { quantity: ml / ML.cup!, unit: 'cup' };
  }
  const g = q * G[c]!;
  if (system === 'metric') {
    return g >= 1000 ? { quantity: roundNice(g / 1000), unit: 'kg' } : { quantity: roundNice(g), unit: 'g' };
  }
  return g >= G.lb! ? { quantity: g / G.lb!, unit: 'lb' } : { quantity: g / G.oz!, unit: 'oz' };
}

export type ShownIngredient = {
  /** Bold lead, e.g. "1½ tbsp", or null for "to taste" items. */
  amount: string | null;
  name: string;
  note: string | null;
  section: string | null;
};

export function showIngredient(i: Ingredient, factor: number, system: UnitSystem): ShownIngredient {
  let amount: string | null = null;
  if (i.quantity !== null) {
    const lo = convertQuantity(i.quantity * factor, i.unit, system);
    let text = formatQuantity(lo.quantity);
    if (i.quantityMax !== null) {
      const hi = convertQuantity(i.quantityMax * factor, i.unit, system);
      text = `${text}–${formatQuantity(hi.quantity)}`;
    }
    amount = [text, lo.unit].filter(Boolean).join(' ');
  } else if (i.unit) {
    amount = i.unit;
  }
  return { amount, name: i.name, note: i.note, section: i.section };
}
