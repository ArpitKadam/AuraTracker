import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ComponentProps } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import type { Units } from '@/fitness/db/profile';
import type { Kpis } from '@/fitness/insights';
import { LB_PER_KG } from '@/fitness/db/profile';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Counts from 0 to `to` with an ease-out, like a rolling odometer settling. */
function CountUp({ to, decimals = 0, style }: { to: number; decimals?: number; style: StyleProp<TextStyle> }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / 1100);
      setV(to * (1 - (1 - t) ** 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, reduce]);
  return <Text style={style}>{(reduce ? to : v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</Text>;
}

type Icon = ComponentProps<typeof Ionicons>['name'];

/** Lifetime totals: weight moved, workouts, hours, personal records. */
export function KpiTiles({ kpis, units }: { kpis: Kpis; units: Units }) {
  // Tonnes for kg users, thousands of pounds for lb users.
  const lifted = units === 'kg' ? kpis.totalVolumeKg / 1000 : (kpis.totalVolumeKg * LB_PER_KG) / 1000;
  const tiles: { icon: Icon; label: string; value: number; unit: string; decimals: number }[] = [
    { icon: 'barbell-outline', label: 'Total lifted', value: lifted, unit: units === 'kg' ? 't' : 'k lb', decimals: lifted < 100 ? 1 : 0 },
    { icon: 'calendar-outline', label: 'Workouts', value: kpis.workouts, unit: `${kpis.thisMonth} this month`, decimals: 0 },
    { icon: 'time-outline', label: 'Hours trained', value: kpis.hours, unit: 'h', decimals: kpis.hours < 100 ? 1 : 0 },
    { icon: 'trophy-outline', label: 'Personal records', value: kpis.prs, unit: 'PRs', decimals: 0 },
  ];
  return (
    <View
      style={styles.grid}
      accessible
      accessibilityLabel={tiles.map((t) => `${t.label}: ${t.value.toFixed(t.decimals)} ${t.unit}`).join('. ')}
    >
      {tiles.map((t) => (
        <View key={t.label} style={styles.tile}>
          <View style={styles.iconRow}>
            <Ionicons name={t.icon} size={15} color={colors.fitness} />
            <Text style={styles.label}>{t.label}</Text>
          </View>
          <View style={styles.valueRow}>
            <CountUp to={t.value} decimals={t.decimals} style={styles.value} />
            <Text style={styles.unit} numberOfLines={1}>
              {t.unit}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { flexBasis: '48%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.card, padding: space.lg, gap: space.xs },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  value: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: colors.text },
  unit: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
});
