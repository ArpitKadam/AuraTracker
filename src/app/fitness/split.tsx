import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MuscleGroup } from '@/fitness/catalog-types';
import { getSplit, saveSplitDay } from '@/fitness/db/split';
import { GROUPS } from '@/fitness/groups';
import { DEFAULT_SPLIT, isRest, type DayPlan, type Split } from '@/fitness/schedule';
import { colors, fonts, radius, space } from '@/theme/tokens';

// Monday first, like the schedule the user wrote; values are Date.getDay() indexes.
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** off -> main -> secondary -> off */
function cycle(plan: DayPlan, g: MuscleGroup): DayPlan {
  if (plan.primary.includes(g)) return { primary: plan.primary.filter((x) => x !== g), secondary: [...plan.secondary, g] };
  if (plan.secondary.includes(g)) return { ...plan, secondary: plan.secondary.filter((x) => x !== g) };
  return { ...plan, primary: [...plan.primary, g] };
}

export default function SplitEditor() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [split, setSplit] = useState<Split | null>(null);

  useFocusEffect(
    useCallback(() => {
      getSplit(db).then(setSplit);
    }, [db]),
  );

  if (!split) return <View style={styles.root} />;

  const tap = async (day: number, g: MuscleGroup) => {
    const next = cycle(split[day], g);
    setSplit(split.map((p, i) => (i === day ? next : p)));
    await saveSplitDay(db, day, next);
  };

  const reset = async () => {
    for (let d = 0; d < 7; d++) await saveSplitDay(db, d, DEFAULT_SPLIT[d]);
    setSplit(await getSplit(db));
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Workout split</Text>
      </View>
      <Text style={styles.help}>Tap a muscle once for main, again for secondary, a third time to clear. A day with no main group is a rest day.</Text>

      <ScrollView contentContainerStyle={{ gap: space.md, paddingVertical: space.md, paddingBottom: insets.bottom + space.xl }}>
        {WEEK.map((day) => {
          const plan = split[day];
          return (
            <View key={day} style={styles.card}>
              <View style={styles.dayHead}>
                <Text style={styles.day}>{DAY[day]}</Text>
                <Text style={styles.dayNote}>{isRest(plan) ? 'Rest day' : ''}</Text>
              </View>
              <View style={styles.chips}>
                {GROUPS.map((g) => {
                  const main = plan.primary.includes(g.id);
                  const sec = plan.secondary.includes(g.id);
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => tap(day, g.id)}
                      style={[styles.chip, main && styles.chipMain, sec && styles.chipSec]}
                      accessibilityRole="button"
                      accessibilityLabel={`${DAY[day]} ${g.label}: ${main ? 'main' : sec ? 'secondary' : 'off'}`}
                    >
                      <Text style={[styles.chipText, main && styles.chipTextMain]}>{g.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
        <Pressable onPress={reset} style={styles.reset} accessibilityRole="button">
          <Text style={styles.resetText}>Reset to my original split</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base, paddingHorizontal: space.gutter },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.text },
  help: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: space.lg, gap: space.md },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  day: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  dayNote: { fontFamily: fonts.regular, fontSize: 13, color: colors.textFaint },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.chip, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line },
  chipMain: { backgroundColor: colors.fitness, borderColor: colors.fitness },
  chipSec: { backgroundColor: colors.fitnessSoft, borderColor: colors.fitnessSoft },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  chipTextMain: { color: colors.onAccent },
  reset: { alignItems: 'center', paddingVertical: space.md },
  resetText: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted },
});
