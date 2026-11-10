// Weekly training plan. Index = Date.getDay() (0 = Sunday).
// ponytail: fixed default for now; Task 10a stores an editable copy in fitness.db and adds skip/postpone.
export type DayPlan = { primary: string[]; secondary: string[] } | null;

export const DEFAULT_SPLIT: DayPlan[] = [
  null,
  { primary: ['Legs'], secondary: ['Shoulder'] },
  { primary: ['Chest'], secondary: ['Triceps', 'Abs'] },
  { primary: ['Back'], secondary: ['Biceps', 'Forearms'] },
  { primary: ['Shoulder'], secondary: ['Legs', 'Abs'] },
  { primary: ['Biceps', 'Triceps'], secondary: ['Forearms'] },
  { primary: ['Chest', 'Back'], secondary: ['Abs'] },
];

export const planFor = (date: Date, split: DayPlan[] = DEFAULT_SPLIT): DayPlan => split[date.getDay()];
