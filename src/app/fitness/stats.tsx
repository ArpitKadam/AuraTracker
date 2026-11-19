import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Storage } from 'expo-sqlite/kv-store';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CatalogExercise, MuscleGroup } from '@/fitness/catalog-types';
import { loadInsightSessions } from '@/fitness/db/insights';
import { getProfile, type Units } from '@/fitness/db/profile';
import { DEMO_NOTE, demoSessions } from '@/fitness/demo';
import { loadExercises } from '@/fitness/exercises';
import { GROUPS } from '@/fitness/groups';
import * as I from '@/fitness/insights';
import { ActivityRings } from '@/fitness/ui/insights/ActivityRings';
import { Awards } from '@/fitness/ui/insights/Awards';
import { BalanceRadar } from '@/fitness/ui/insights/BalanceRadar';
import { KpiTiles } from '@/fitness/ui/insights/KpiTiles';
import { MonthCalendar } from '@/fitness/ui/insights/MonthCalendar';
import { MonthRecapCard } from '@/fitness/ui/insights/MonthRecapCard';
import { MuscleSets } from '@/fitness/ui/insights/MuscleSets';
import { RecoveryMap } from '@/fitness/ui/insights/RecoveryMap';
import { Card } from '@/fitness/ui/insights/shared';
import { TrainingHeatmap } from '@/fitness/ui/insights/TrainingHeatmap';
import { Trends } from '@/fitness/ui/insights/Trends';
import { WeeklyVolumeBars } from '@/fitness/ui/insights/WeeklyVolumeBars';
import { WeekStreak } from '@/fitness/ui/insights/WeekStreak';
import { colors, fonts, radius, space } from '@/theme/tokens';

// ─── DEMO DATA ────────────────────────────────────────────────────────────────
// Everything demo lives here plus the lines tagged `DEMO` below. To drop demo mode: delete this block,
// the DEMO lines, and src/fitness/demo.ts; `sessions` then always comes from loadInsightSessions.
const DEMO_KEY = 'fitness.demo';
function readDemo() {
  try {
    return Storage.getItemSync(DEMO_KEY) !== '0'; // default ON
  } catch {
    return true;
  }
}
function writeDemo(on: boolean) {
  try {
    Storage.setItemSync(DEMO_KEY, on ? '1' : '0');
  } catch {
    // Not persisting the toggle is harmless; it just resets to ON next launch.
  }
}
/** Per group: the curated picks, else any exercise of that group, so demo sets resolve to real muscles. */
function demoIds(all: CatalogExercise[]): Record<MuscleGroup, string[]> {
  const out = {} as Record<MuscleGroup, string[]>;
  for (const { id } of GROUPS) {
    const of = all.filter((e) => e.groups.includes(id));
    const curated = of.filter((e) => e.curated !== null);
    out[id] = (curated.length ? curated : of).map((e) => e.id);
  }
  return out;
}
// ──────────────────────────────────────────────────────────────────────────────

type Loaded = { sessions: I.InsightSession[]; byId: Map<string, CatalogExercise>; units: Units; now: number };

export default function Stats() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [demo, setDemo] = useState(readDemo); // DEMO
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const now = Date.now();
      const [ex, profile] = await Promise.all([loadExercises(db), getProfile(db)]);
      const sessions = demo ? demoSessions(now, demoIds(ex.all)) : await loadInsightSessions(db); // DEMO
      if (live) setData({ sessions, byId: ex.byId, units: profile.units, now });
    })();
    return () => {
      live = false;
    };
  }, [db, demo]);

  const toggleDemo = () => {
    // DEMO
    writeDemo(!demo);
    setDemo(!demo);
  };

  const v = useMemo(() => {
    if (!data || !data.sessions.length) return null;
    const { sessions: s, byId, now } = data;
    const info: I.ExerciseInfo = (id) => {
      const e = byId.get(id);
      return e && { name: e.name, primary: e.primary, secondary: e.secondary, groups: e.groups };
    };
    return {
      info,
      rings: I.weeklyRings(s, now),
      kpis: I.kpis(s, now),
      trends: I.trends(s, now),
      weeks: I.weeklyVolume(s, now, 12),
      heat: I.heatmap(s, now, 53),
      streak: I.weekStreak(s, now),
      recovery: I.recovery(s, info, now),
      sets: I.weeklyMuscleSets(s, info, now),
      balance30: I.muscleBalance(s, info, now, 30),
      balance7: I.muscleBalance(s, info, now, 7),
      recap: I.monthRecap(s, info, now),
      calendar: I.calendarMonth(s, now),
      awards: I.awards(s, now),
    };
  }, [data]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Your numbers</Text>
        {/* DEMO */}
        <Pressable
          onPress={toggleDemo}
          style={[styles.demo, demo && styles.demoOn]}
          accessibilityRole="switch"
          accessibilityState={{ checked: demo }}
          accessibilityLabel={DEMO_NOTE}
          hitSlop={6}
        >
          <Ionicons name={demo ? 'flask' : 'flask-outline'} size={14} color={demo ? colors.onAccent : colors.textMuted} />
          <Text style={[styles.demoText, demo && styles.demoTextOn]}>{DEMO_NOTE}</Text>
        </Pressable>
      </View>
      {demo ? <Text style={styles.note}>Showing demo data. Switch it off to see your own workouts.</Text> : null}

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xl }]} showsVerticalScrollIndicator={false}>
        {!data ? null : !v ? (
          <Card>
            <View style={styles.empty}>
              <Ionicons name="stats-chart-outline" size={32} color={colors.textFaint} />
              <Text style={styles.emptyTitle}>No workouts yet</Text>
              <Text style={styles.emptyText}>Finish your first workout and your rings, streak, trends and records fill in here.</Text>
            </View>
          </Card>
        ) : (
          <>
            <Card title="This week" note="Against your average week">
              <ActivityRings rings={v.rings} units={data.units} />
            </Card>
            <KpiTiles kpis={v.kpis} units={data.units} />
            <Trends trends={v.trends} units={data.units} />
            <WeeklyVolumeBars weeks={v.weeks} units={data.units} />
            <TrainingHeatmap days={v.heat} now={data.now} units={data.units} />
            <WeekStreak streak={v.streak} />
            <RecoveryMap recovery={v.recovery} />
            <MuscleSets rows={v.sets} />
            <BalanceRadar month={v.balance30} week={v.balance7} />
            <MonthRecapCard recap={v.recap} now={data.now} units={data.units} exerciseName={(id) => v.info(id)?.name ?? id} />
            <MonthCalendar days={v.calendar} now={data.now} />
            <Awards awards={v.awards} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.gutter },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: colors.text },
  demo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.md,
    height: 32,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  demoOn: { backgroundColor: colors.fitness, borderColor: colors.fitness },
  demoText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  demoTextOn: { color: colors.onAccent },
  note: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, paddingHorizontal: space.gutter, marginTop: space.xs },
  body: { gap: space.md, paddingHorizontal: space.gutter, paddingTop: space.md },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  emptyTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  emptyText: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', maxWidth: 260 },
});
