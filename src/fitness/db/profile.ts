import type { Db } from '../../recipe-module/db/recipes.ts';

export type Units = 'kg' | 'lb';
export type EquipmentAccess = 'gym' | 'dumbbells' | 'bodyweight';
export type Experience = 'beginner' | 'intermediate' | 'advanced';

export type Profile = {
  units: Units;
  equipment: EquipmentAccess;
  experience: Experience;
  /** kg */
  bodyWeight: number | null;
  /** kg */
  weightStep: number;
  repMin: number;
  repMax: number;
  onboarded: boolean;
};

type Row = {
  units: Units;
  equipment: EquipmentAccess;
  experience: Experience;
  body_weight: number | null;
  weight_step: number;
  rep_min: number;
  rep_max: number;
  onboarded: number;
};

export async function getProfile(db: Db): Promise<Profile> {
  const r = await db.getFirstAsync<Row>('SELECT * FROM profile WHERE id = 1', []);
  if (!r) throw new Error('profile row missing; migration did not run');
  return {
    units: r.units,
    equipment: r.equipment,
    experience: r.experience,
    bodyWeight: r.body_weight,
    weightStep: r.weight_step,
    repMin: r.rep_min,
    repMax: r.rep_max,
    onboarded: r.onboarded === 1,
  };
}

export async function saveProfile(db: Db, p: Partial<Profile>): Promise<void> {
  const cols: Record<keyof Profile, string> = {
    units: 'units',
    equipment: 'equipment',
    experience: 'experience',
    bodyWeight: 'body_weight',
    weightStep: 'weight_step',
    repMin: 'rep_min',
    repMax: 'rep_max',
    onboarded: 'onboarded',
  };
  const entries = Object.entries(p) as [keyof Profile, Profile[keyof Profile]][];
  if (!entries.length) return;
  const sql = `UPDATE profile SET ${entries.map(([k]) => `${cols[k]} = ?`).join(', ')} WHERE id = 1`;
  await db.runAsync(sql, entries.map(([, v]) => (typeof v === 'boolean' ? Number(v) : v)));
}

export const LB_PER_KG = 2.20462;
/** Body weight / lifting weight as the user enters it, converted to kg for storage. */
export const toKg = (value: number, units: Units) => (units === 'lb' ? value / LB_PER_KG : value);
