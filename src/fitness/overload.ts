// Progressive-overload hint (TASK.md "Overload rule"). Pure: compares against the last session of the same
// exercise, working sets only. Rule, with the default 13-15 target range:
//   - every set at the top weight reached repMin (13+): add one weight step (2.5 kg)
//   - otherwise: same top weight, aim for the best reps there +1 to +2
export type WorkingSet = { weightKg: number; reps: number };

export type Hint =
  | { kind: 'first' }
  | { kind: 'reps'; weightKg: number; lastReps: number; from: number; to: number }
  | { kind: 'weight'; lastWeightKg: number; lastReps: number; weightKg: number };

export type HintPrefs = { repMin: number; weightStepKg: number };

export function overloadHint(last: WorkingSet[], prefs: HintPrefs): Hint {
  if (!last.length) return { kind: 'first' };
  const top = Math.max(...last.map((s) => s.weightKg));
  const atTop = last.filter((s) => s.weightKg === top);
  const best = Math.max(...atTop.map((s) => s.reps));
  if (atTop.every((s) => s.reps >= prefs.repMin)) {
    return { kind: 'weight', lastWeightKg: top, lastReps: best, weightKg: roundKg(top + prefs.weightStepKg) };
  }
  return { kind: 'reps', weightKg: top, lastReps: best, from: best + 1, to: best + 2 };
}

/** What the set entry starts at: the hint's weight and its lowest rep target. */
export function prefill(hint: Hint): { weightKg: number | null; reps: number | null } {
  if (hint.kind === 'reps') return { weightKg: hint.weightKg, reps: hint.from };
  if (hint.kind === 'weight') return { weightKg: hint.weightKg, reps: null };
  return { weightKg: null, reps: null };
}

// Plate maths in lb mode produces values like 13.6077; keep storage to 0.001 kg.
const roundKg = (kg: number) => Math.round(kg * 1000) / 1000;
