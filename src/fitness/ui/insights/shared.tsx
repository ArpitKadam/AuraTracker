import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { Units } from '@/fitness/db/profile';
import { toDisplay } from '@/fitness/units';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Inner width of a full-width card on the stats screen (screen gutter + card padding on both sides). */
export function useCardWidth() {
  return useWindowDimensions().width - 2 * space.gutter - 2 * space.lg;
}

export function Card({ title, note, right, children, label }: { title?: string; note?: string; right?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <View style={styles.card} accessible={!!label} accessibilityLabel={label}>
      {title ? (
        <View style={styles.head}>
          <View style={styles.flex}>
            <Text style={styles.title}>{title}</Text>
            {note ? <Text style={styles.note}>{note}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.pillRow} accessibilityRole="tablist">
      {options.map((o) => (
        <Pressable
          key={o.id}
          onPress={() => onChange(o.id)}
          style={[styles.pill, o.id === value && styles.pillOn]}
          accessibilityRole="tab"
          accessibilityState={{ selected: o.id === value }}
          hitSlop={4}
        >
          <Text style={[styles.pillText, o.id === value && styles.pillTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Clockwise arc from 12 o'clock, angles as fractions of a turn (0..1). */
export function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a0 = from * 2 * Math.PI - Math.PI / 2;
  const a1 = to * 2 * Math.PI - Math.PI / 2;
  const large = to - from > 0.5 ? 1 : 0;
  return `M${(cx + r * Math.cos(a0)).toFixed(2)} ${(cy + r * Math.sin(a0)).toFixed(2)} A${r} ${r} 0 ${large} 1 ${(cx + r * Math.cos(a1)).toFixed(2)} ${(cy + r * Math.sin(a1)).toFixed(2)}`;
}

/** A full circle as a path starting at 12 o'clock, clockwise (dash offsets then sweep from the top). */
export const fullCircle = (cx: number, cy: number, r: number) => `M${cx} ${cy - r} A${r} ${r} 0 1 1 ${cx} ${cy + r} A${r} ${r} 0 1 1 ${cx} ${cy - r}`;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** Linear mix of two #RRGGBB tokens. */
export function mix(a: string, b: string, t: number) {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const int = (v: number) => Math.round(v).toLocaleString();
/** Volume in the user's unit with grouping: "12,450 kg". */
export const vol = (kg: number, units: Units) => `${Math.round(toDisplay(kg, units)).toLocaleString()} ${units}`;
/** Short volume for tight spots: "12.4k kg". */
export const volShort = (kg: number, units: Units) => {
  const v = toDisplay(kg, units);
  return `${v >= 10_000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)} ${units}`;
};

const pad = (n: number) => String(n).padStart(2, '0');
/** Local YYYY-MM-DD, the key insights.ts uses for days. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Monday 00:00 local of the week containing `t`. */
export function mondayOf(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
export const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: space.lg, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  note: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  faint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textFaint },
  pillRow: { flexDirection: 'row', gap: space.xs, backgroundColor: colors.raised, borderRadius: radius.chip, padding: 3 },
  pill: { paddingHorizontal: space.md, paddingVertical: 5, borderRadius: radius.chip },
  pillOn: { backgroundColor: colors.fitness },
  pillText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  pillTextOn: { color: colors.onAccent },
});
