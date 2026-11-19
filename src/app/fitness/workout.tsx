import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CatalogExercise } from '@/fitness/catalog-types';
import { lastTopSets, type TopSet } from '@/fitness/db/history';
import { getProfile, type Profile } from '@/fitness/db/profile';
import { finishSession, getActiveSession, lineupOf, removeFromLineup, type ActiveSession } from '@/fitness/db/session';
import { loadExercises } from '@/fitness/exercises';
import { groupLabel } from '@/fitness/groups';
import { rescheduleReminders } from '@/fitness/notify';
import { ExerciseThumb } from '@/fitness/ui/ExerciseThumb';
import { formatWeight } from '@/fitness/units';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** The open workout: today's lineup, tap one to log it, add one you forgot, finish. */
export default function Workout() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [session, setSession] = useState<ActiveSession | null | undefined>(undefined);
  const [lineup, setLineup] = useState<{ exerciseId: string; sets: number }[]>([]);
  const [byId, setById] = useState<Map<string, CatalogExercise>>(new Map());
  const [tops, setTops] = useState<Map<string, TopSet>>(new Map());
  const [profile, setProfile] = useState<Profile | null>(null);

  const loads = useRef(0); // only the latest load may set state
  const finishing = useRef(false);

  const load = useCallback(async () => {
    const mine = ++loads.current;
    const [open, ex, p] = await Promise.all([getActiveSession(db), loadExercises(db), getProfile(db)]);
    const l = open ? await lineupOf(db, open.id) : [];
    const t = await lastTopSets(db, l.map((x) => x.exerciseId));
    if (mine !== loads.current) return;
    setTops(t);
    setById(ex.byId);
    setProfile(p);
    setLineup(l);
    setSession(open);
  }, [db]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (session === undefined || !profile) return <View style={styles.root} />;
  if (session === null) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.title}>No workout open</Text>
        <Pressable onPress={() => router.dismissTo('/fitness')} style={[styles.cta, styles.ctaInline]} accessibilityRole="button">
          <Text style={styles.ctaText}>Pick today&apos;s groups</Text>
        </Pressable>
      </View>
    );
  }

  const logged = lineup.reduce((n, x) => n + x.sets, 0);
  const done = lineup.filter((x) => x.sets > 0).length;
  const finish = async () => {
    if (finishing.current) return;
    finishing.current = true;
    const id = await finishSession(db, session.id, Date.now());
    rescheduleReminders(db); // new history -> new targets for the coming days
    if (id === null) return router.dismissTo('/fitness');
    router.replace({ pathname: '/fitness/summary', params: { session: String(id) } });
  };
  const remove = async (exerciseId: string) => {
    await removeFromLineup(db, session.id, exerciseId);
    await load();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={1}>
            {session.groups.map(groupLabel).join(' + ')}
          </Text>
          <Text style={styles.sub}>{`${done} of ${lineup.length} done · ${logged} set${logged === 1 ? '' : 's'}`}</Text>
        </View>
      </View>

      <View style={styles.progress} accessibilityLabel={`${done} of ${lineup.length} exercises done`}>
        <View style={[styles.progressFill, { width: `${lineup.length ? (done / lineup.length) * 100 : 0}%` }]} />
      </View>

      <ScrollView contentContainerStyle={{ gap: space.sm, paddingBottom: space.xl }} showsVerticalScrollIndicator={false}>
        {lineup.map(({ exerciseId, sets }) => {
          const e = byId.get(exerciseId);
          if (!e) return null;
          const top = tops.get(exerciseId);
          return (
            <Pressable
              key={exerciseId}
              onPress={() => router.push({ pathname: '/fitness/exercise/[id]', params: { id: exerciseId, groups: session.groups.join(',') } })}
              style={({ pressed }) => [styles.row, sets > 0 && styles.rowDone, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Log ${e.name}`}
            >
              <ExerciseThumb exercise={e} />
              <View style={styles.flex}>
                <Text style={styles.name} numberOfLines={2}>
                  {e.name}
                </Text>
                {sets > 0 ? (
                  <Text style={styles.doneText}>{`${sets} set${sets === 1 ? '' : 's'} today`}</Text>
                ) : (
                  <Text style={styles.meta}>{top ? `Last ${formatWeight(top.weightKg, profile.units)} × ${top.reps}` : 'Not tried yet'}</Text>
                )}
              </View>
              {sets > 0 ? (
                <Ionicons name="checkmark-circle" size={24} color={colors.fitness} />
              ) : (
                <Pressable onPress={() => remove(exerciseId)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${e.name} from today`}>
                  <Ionicons name="close" size={22} color={colors.textFaint} />
                </Pressable>
              )}
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => router.push({ pathname: '/fitness/plan', params: { groups: session.groups.join(',') } })}
          style={styles.add}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={20} color={colors.fitness} />
          <Text style={styles.addText}>Add an exercise</Text>
        </Pressable>
      </ScrollView>

      <Pressable onPress={finish} style={({ pressed }) => [styles.cta, !logged && styles.ctaQuiet, pressed && styles.pressed, { marginBottom: insets.bottom + space.md }]} accessibilityRole="button">
        <Text style={[styles.ctaText, !logged && styles.ctaQuietText]}>{logged ? `Finish workout (${logged} sets)` : 'End without logging'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base, paddingHorizontal: space.gutter },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.lg },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 28, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  progress: { height: 4, borderRadius: 2, backgroundColor: colors.raised, overflow: 'hidden', marginBottom: space.md },
  progressFill: { height: 4, backgroundColor: colors.fitness },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  rowDone: { borderColor: colors.fitnessSoft },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, marginTop: 4 },
  doneText: { fontFamily: fonts.medium, fontSize: 13, color: colors.fitness, marginTop: 4 },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.fitnessSoft,
  },
  addText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.fitness },
  pressed: { opacity: 0.85 },
  cta: { height: 56, borderRadius: radius.button, backgroundColor: colors.fitness, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
  ctaInline: { alignSelf: 'stretch', paddingHorizontal: space.xl },
  ctaText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onAccent },
  ctaQuiet: { backgroundColor: colors.raised },
  ctaQuietText: { color: colors.text },
});
