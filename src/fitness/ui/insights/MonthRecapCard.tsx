import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { Units } from '@/fitness/db/profile';
import type { MonthRecap } from '@/fitness/insights';
import { groupLabel } from '@/fitness/groups';
import { colors, fonts, insightColors as ic, radius, space } from '@/theme/tokens';

import { vol } from './shared';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']; // favWeekday: 0 = Monday

/** "This month" story card. `exerciseName` resolves recap.topExercise (an exercise id). */
export function MonthRecapCard({ recap, now, units, exerciseName }: { recap: MonthRecap; now: number; units: Units; exerciseName: (id: string) => string }) {
  const month = new Date(now).toLocaleDateString(undefined, { month: 'long' });
  const delta = recap.deltaVolumePct;
  const facts: [string, string][] = [
    ['Days trained', String(recap.days)],
    ['Volume', vol(recap.volume, units)],
    ['Avg session', `${Math.round(recap.avgMinutes)} min`],
    ['Working sets', recap.sets.toLocaleString()],
    ['Top exercise', recap.topExercise ? exerciseName(recap.topExercise) : '–'],
    ['Top group', recap.topGroup ? groupLabel(recap.topGroup) : '–'],
    ['Favorite day', recap.favWeekday !== null ? WEEKDAYS[recap.favWeekday] : '–'],
    ['Usually trains', recap.timeOfDay ? `In the ${recap.timeOfDay === 'midday' ? 'middle of the day' : recap.timeOfDay}` : '–'],
  ];
  const deltaText = delta === null ? 'First month on record' : `${delta >= 0 ? '+' : ''}${Math.round(delta)}% volume vs last month`;
  const label = `${month} so far: ${recap.workouts} workouts. ${facts.map(([k, v]) => `${k}: ${v}`).join('. ')}. ${deltaText}.`;

  return (
    <View style={styles.card} accessible accessibilityLabel={label}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="recap" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.fitness} stopOpacity={0.22} />
            <Stop offset="0.55" stopColor={colors.fitness} stopOpacity={0.04} />
            <Stop offset="1" stopColor={ic.ringSessions[0]} stopOpacity={0.1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#recap)" />
      </Svg>
      <Text style={styles.eyebrow}>THIS MONTH</Text>
      <View style={styles.heroRow}>
        <Text style={styles.hero}>{recap.workouts}</Text>
        <View style={styles.heroSide}>
          <Text style={styles.heroUnit}>{recap.workouts === 1 ? 'workout' : 'workouts'}</Text>
          <Text style={styles.month}>{`in ${month}`}</Text>
        </View>
      </View>
      {delta !== null ? (
        <View style={styles.delta}>
          <Ionicons name={delta >= 0 ? 'arrow-up' : 'arrow-down'} size={14} color={delta >= 0 ? colors.fitness : colors.textMuted} />
          <Text style={styles.deltaText}>{deltaText}</Text>
        </View>
      ) : (
        <Text style={styles.deltaText}>{deltaText}</Text>
      )}
      <View style={styles.grid}>
        {facts.map(([k, v]) => (
          <View key={k} style={styles.fact}>
            <Text style={styles.k}>{k}</Text>
            <Text style={styles.v} numberOfLines={2}>
              {v}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: space.xl, gap: space.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.fitnessSoft },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.4, color: colors.fitness },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  hero: { fontFamily: fonts.display, fontSize: 72, lineHeight: 74, color: colors.text },
  heroSide: { paddingBottom: 10 },
  heroUnit: { fontFamily: fonts.displaySemi, fontSize: 22, color: colors.text },
  month: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deltaText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md, marginTop: space.sm },
  fact: { width: '50%', paddingRight: space.sm, gap: 2 },
  k: { fontFamily: fonts.regular, fontSize: 12, color: colors.textFaint },
  v: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
});
