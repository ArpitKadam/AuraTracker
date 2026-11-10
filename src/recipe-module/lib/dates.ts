// Plan dates are local calendar days stored as "YYYY-MM-DD".
const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n); // Date normalises month/year overflow and DST
  return toISODate(d);
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const day = fromISODate(iso).getDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayName = (iso: string) => DAY[fromISODate(iso).getDay()];
export const dayNumber = (iso: string) => fromISODate(iso).getDate();
export const monthDay = (iso: string) => `${MONTH[fromISODate(iso).getMonth()]} ${dayNumber(iso)}`;
