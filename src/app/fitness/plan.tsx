import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CatalogExercise, MuscleGroup, MuscleSlug } from '@/fitness/catalog-types';
import { lastTopSets, listPastSessions, type TopSet } from '@/fitness/db/history';
import { getProfile, type Profile } from '@/fitness/db/profile';
import { finishSession, getActiveSession, setCounts } from '@/fitness/db/session';
import { GROUPS, groupLabel } from '@/fitness/groups';
import { recommend, swapFor, type GroupPicks } from '@/fitness/recommend';
import { exerciseImage, loadExercises } from '@/fitness/exercises';
import { rescheduleReminders } from '@/fitness/notify';
import { BodyMap } from '@/fitness/ui/BodyMap';
import { formatWeight } from '@/fitness/units';
import { colors, fonts, radius, space } from '@/theme/tokens';

const isGroup = (g: string): g is MuscleGroup => GROUPS.some((x) => x.id === g);

export default function Plan() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ groups?: string }>();
  const groups = useMemo(() => (params.groups ?? '').split(',').filter(isGroup), [params.groups]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sections, setSections] = useState<GroupPicks[]>([]);
  const [tops, setTops] = useState<Map<string, TopSet>>(new Map());
  const [active, setActive] = useState<number | null>(null);
  const [counts, setCountsState] = useState<Map<string, number>>(new Map());
  const [exercises, setExercises] = useState<{ all: CatalogExercise[]; byId: Map<string, CatalogExercise> }>({ all: [], byId: new Map() });
  // Recommendations are rebuilt only when the exercise list changes (a custom exercise was added or edited),
  // not on every return from logging, so swaps stay put.
  const builtFor = useRef<string | null>(null);

  // Set counts change while the user logs on the exercise screen; refresh on every return.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      getActiveSession(db).then(async (a) => {
        const c = a ? await setCounts(db, a.id) : new Map<string, number>();
        if (live) {
          setActive(a?.id ?? null);
          setCountsState(c);
        }
      });
      (async () => {
        const ex = await loadExercises(db);
        const signature = `${groups.join(',')}|${ex.all.filter((e) => e.sources[0] === 'custom').map((e) => `${e.id}:${e.name}:${e.groups}:${e.equipment}`).join(';')}`;
        if (!live) return;
        setExercises(ex);
        if (builtFor.current === signature) return;
        const [p, history] = await Promise.all([getProfile(db), listPastSessions(db)]);
        const recs = recommend(groups, ex.all, history, p);
        const t = await lastTopSets(db, recs.flatMap((r) => r.picks.map((x) => x.exerciseId)));
        if (!live) return;
        builtFor.current = signature;
        setProfile(p);
        setSections(recs);
        setTops(t);
      })();
      return () => {
        live = false;
      };
    }, [db, groups]),
  );

  const swap = (group: MuscleGroup, index: number) => {
    if (!profile) return;
    const shown = new Set(sections.flatMap((s) => s.picks.map((p) => p.exerciseId)));
    const next = swapFor(sections.find((s) => s.group === group)!.picks[index].exerciseId, group, shown, exercises.all, profile);
    if (!next) return;
    setSections((all) =>
      all.map((s) => (s.group !== group ? s : { ...s, picks: s.picks.map((p, i) => (i === index ? { exerciseId: next, reason: 'catalog' } : p)) })),
    );
  };

  const primary = useMemo(() => GROUPS.filter((g) => groups.includes(g.id)).flatMap((g) => g.slugs), [groups]);
  // The 3 assisting muscles the picks hit most often.
  const secondary = useMemo(() => {
    const count = new Map<MuscleSlug, number>();
    for (const s of sections)
      for (const p of s.picks)
        for (const m of exercises.byId.get(p.exerciseId)?.secondary ?? []) if (!primary.includes(m)) count.set(m, (count.get(m) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m);
  }, [sections, primary, exercises]);
  const loggedTotal = [...counts.values()].reduce((a, b) => a + b, 0);
  const finish = async () => {
    if (active === null) return;
    const id = await finishSession(db, active, Date.now());
    rescheduleReminders(db); // new history -> new targets for the coming days
    if (id === null) return router.back();
    router.replace({ pathname: '/fitness/summary', params: { session: String(id) } });
  };
  const total = sections.reduce((n, s) => n + s.picks.length, 0);
  const staples = sections.reduce((n, s) => n + s.picks.filter((p) => p.reason === 'staple').length, 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={1}>
            {groups.map(groupLabel).join(' + ')}
          </Text>
          <Text style={styles.sub}>{profile ? `${total} picks${staples ? `, ${staples} staple${staples === 1 ? '' : 's'}` : ''}` : ' '}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: insets.bottom + space.xl }} showsVerticalScrollIndicator={false}>
        <View style={styles.strip}>
          <BodyMap primary={primary} secondary={secondary} scale={0.26} />
          <View style={styles.flex}>
            <Text style={styles.stripLabel}>Primary</Text>
            <Text style={styles.stripValue}>{groups.map(groupLabel).join(', ')}</Text>
            {secondary.length ? (
              <>
                <Text style={styles.stripLabel}>Assisting</Text>
                <Text style={styles.stripMuted} numberOfLines={2}>
                  {secondary.join(', ').replace(/-/g, ' ')}
                </Text>
              </>
            ) : null}
          </View>
        </View>

        {profile
          ? sections.map((s) => (
              <View key={s.group} style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>{groupLabel(s.group)}</Text>
                  <Text style={styles.sectionCount}>{s.picks.length ? `${s.picks.length} picks` : 'Nothing matches your equipment'}</Text>
                </View>
                {s.picks.map((p, i) => {
                  const e = exercises.byId.get(p.exerciseId);
                  return e ? (
                    <ExerciseRow
                      key={p.exerciseId}
                      exercise={e}
                      badge={p.reason === 'staple' ? 'Staple' : p.reason === 'variety' ? 'Try something new' : null}
                      last={tops.get(p.exerciseId)}
                      profile={profile}
                      logged={counts.get(p.exerciseId) ?? 0}
                      onOpen={() => router.push({ pathname: '/fitness/exercise/[id]', params: { id: p.exerciseId, groups: groups.join(',') } })}
                      onSwap={() => swap(s.group, i)}
                    />
                  ) : null;
                })}
                <Pressable
                  onPress={() => router.push({ pathname: '/fitness/custom', params: { group: s.group } })}
                  style={styles.addOwn}
                  accessibilityRole="button"
                >
                  <Ionicons name="add" size={18} color={colors.textMuted} />
                  <Text style={styles.addOwnText}>{`Add your own ${groupLabel(s.group).toLowerCase()} exercise`}</Text>
                </Pressable>
              </View>
            ))
          : null}
      </ScrollView>

      {active !== null && loggedTotal > 0 ? (
        <Pressable onPress={finish} style={({ pressed }) => [styles.finish, { marginBottom: insets.bottom + space.md }, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.finishText}>{`Finish workout (${loggedTotal} sets)`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ExerciseRow({
  exercise,
  badge,
  last,
  profile,
  logged,
  onOpen,
  onSwap,
}: {
  exercise: CatalogExercise;
  badge: string | null;
  last: TopSet | undefined;
  profile: Profile;
  logged: number;
  onOpen: () => void;
  onSwap: () => void;
}) {
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.row, logged > 0 && styles.rowDone, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Log ${exercise.name}`}>
      {exerciseImage(exercise) ? (
        <Image source={exerciseImage(exercise)} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Ionicons name="barbell-outline" size={24} color={colors.textFaint} />
        </View>
      )}
      <View style={styles.flex}>
        <Text style={styles.name} numberOfLines={2}>
          {exercise.name}
        </Text>
        <View style={styles.meta}>
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
          {logged > 0 ? (
            <Text style={styles.done}>{`${logged} set${logged === 1 ? '' : 's'} today`}</Text>
          ) : (
            <Text style={styles.last}>{last ? `Last ${formatWeight(last.weightKg, profile.units)} × ${last.reps}` : 'Not tried yet'}</Text>
          )}
        </View>
      </View>
      {logged > 0 ? (
        <Ionicons name="checkmark-circle" size={24} color={colors.fitness} />
      ) : (
        <Pressable onPress={onSwap} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Swap ${exercise.name}`}>
          <Ionicons name="swap-horizontal" size={22} color={colors.textMuted} />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base, paddingHorizontal: space.gutter },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 28, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
  },
  stripLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  stripValue: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, marginBottom: 4 },
  stripMuted: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, textTransform: 'capitalize' },
  section: { gap: space.sm },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: space.sm },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  sectionCount: { fontFamily: fonts.regular, fontSize: 13, color: colors.textFaint },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  addOwn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
  },
  addOwnText: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
  },
  thumb: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.raised },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 4, flexWrap: 'wrap' },
  badge: { backgroundColor: colors.fitnessSoft, borderRadius: radius.chip, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontFamily: fonts.medium, fontSize: 12, color: colors.text },
  last: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  done: { fontFamily: fonts.medium, fontSize: 13, color: colors.fitness },
  rowDone: { borderWidth: 1, borderColor: colors.fitnessSoft },
  pressed: { opacity: 0.85 },
  finish: { height: 56, borderRadius: radius.button, backgroundColor: colors.fitness, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
  finishText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onAccent },
});
