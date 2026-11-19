import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CatalogExercise, MuscleGroup } from '@/fitness/catalog-types';
import { lastTopSets, listPastSessions, type TopSet } from '@/fitness/db/history';
import { getProfile, type Profile } from '@/fitness/db/profile';
import { addToLineup, getActiveSession, lineupOf, startWorkout } from '@/fitness/db/session';
import { loadExercises } from '@/fitness/exercises';
import { GROUPS, groupLabel } from '@/fitness/groups';
import { lineupOptions, type GroupOptions } from '@/fitness/lineup';
import { rescheduleReminders } from '@/fitness/notify';
import { ExerciseThumb } from '@/fitness/ui/ExerciseThumb';
import { formatWeight } from '@/fitness/units';
import { colors, fonts, radius, space } from '@/theme/tokens';

const isGroup = (g: string): g is MuscleGroup => GROUPS.some((x) => x.id === g);
const PAGE = 30;

/**
 * "What's on today's hit list?": pick the exercises for today's groups, then start.
 * With a workout open it adds to that workout instead (exercises already in it are shown locked).
 */
export default function Lineup() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ groups?: string }>();
  const groups = useMemo(() => (params.groups ?? '').split(',').filter(isGroup), [params.groups]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [options, setOptions] = useState<GroupOptions[]>([]);
  const [byId, setById] = useState<Map<string, CatalogExercise>>(new Map());
  const [tops, setTops] = useState<Map<string, TopSet>>(new Map());
  const [inWorkout, setInWorkout] = useState<Set<string> | null>(null); // null = no workout open
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState<Partial<Record<MuscleGroup, number>>>({});
  const busy = useRef(false); // double-tap guard

  // Reloaded on focus so a custom exercise made from here shows up on return.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const [ex, p, history, open] = await Promise.all([loadExercises(db), getProfile(db), listPastSessions(db), getActiveSession(db)]);
        const opts = lineupOptions(groups, ex.all, history, p);
        const [t, lineup] = await Promise.all([lastTopSets(db, opts.flatMap((o) => o.history)), open ? lineupOf(db, open.id) : null]);
        if (!live) return;
        setProfile(p);
        setById(ex.byId);
        setOptions(opts);
        setTops(t);
        setInWorkout(lineup ? new Set(lineup.map((x) => x.exerciseId)) : null);
      })();
      return () => {
        live = false;
      };
    }, [db, groups]),
  );

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const q = query.trim().toLowerCase();
  const matches = (id: string) => byId.get(id)?.name.toLowerCase().includes(q) ?? false;

  const go = async () => {
    if (!picked.length || busy.current) return;
    busy.current = true;
    try {
      const open = await getActiveSession(db);
      if (open) {
        await addToLineup(db, open.id, picked);
        await startWorkout(db, groups, [], Date.now()); // widens the open session's groups
        router.dismissTo('/fitness/workout');
      } else {
        await startWorkout(db, groups, picked, Date.now());
        rescheduleReminders(db); // a workout started today: today's reminders stop
        router.replace('/fitness/workout');
      }
    } finally {
      busy.current = false;
    }
  };

  const adding = inWorkout !== null;
  const row = (id: string) => {
    const e = byId.get(id);
    if (!e || !profile) return null;
    const locked = inWorkout?.has(id) ?? false;
    return (
      <PickRow
        key={id}
        exercise={e}
        meta={locked ? 'In this workout' : tops.get(id) ? `Last ${formatWeight(tops.get(id)!.weightKg, profile.units)} × ${tops.get(id)!.reps}` : 'Not tried yet'}
        on={locked || picked.includes(id)}
        locked={locked}
        onPress={() => toggle(id)}
      />
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>{adding ? 'Forgot one?' : "What's on today's\nhit list?"}</Text>
          <Text style={styles.sub}>{`${groups.map(groupLabel).join(' + ')}: ${adding ? 'add to your workout' : 'pick what you’re doing'}`}</Text>
        </View>
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${groups.map((g) => groupLabel(g).toLowerCase()).join(' & ')} exercises`}
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          accessibilityLabel="Search exercises"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ gap: space.sm, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {profile
          ? options.map((o) => {
              if (q) {
                const hits = [...o.history, ...o.curated, ...o.more].filter(matches);
                return (
                  <View key={o.group} style={styles.section}>
                    <SectionHead title={groupLabel(o.group)} note={hits.length ? `${hits.length} found` : 'No match'} />
                    {hits.slice(0, PAGE * 2).map(row)}
                  </View>
                );
              }
              const n = shown[o.group] ?? 0;
              return (
                <View key={o.group} style={styles.section}>
                  <SectionHead title={groupLabel(o.group)} note={`${o.history.length + o.curated.length + o.more.length} exercises`} />
                  {o.history.length ? <Text style={styles.tier}>Your go-tos</Text> : null}
                  {o.history.map(row)}
                  {o.history.length && o.curated.length ? <Text style={styles.tier}>More to pick from</Text> : null}
                  {o.curated.map(row)}
                  {o.more.slice(0, n).map(row)}
                  {o.more.length > n ? (
                    <Pressable onPress={() => setShown((s) => ({ ...s, [o.group]: n + PAGE }))} style={styles.ghost} accessibilityRole="button">
                      <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                      <Text style={styles.ghostText}>{n ? `Show more (${o.more.length - n} left)` : `Browse ${o.more.length} more ${groupLabel(o.group).toLowerCase()} exercises`}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => router.push({ pathname: '/fitness/custom', params: { group: o.group } })} style={styles.ghost} accessibilityRole="button">
                    <Ionicons name="add" size={18} color={colors.textMuted} />
                    <Text style={styles.ghostText}>{`Add your own ${groupLabel(o.group).toLowerCase()} exercise`}</Text>
                  </Pressable>
                </View>
              );
            })
          : null}
      </ScrollView>

      <Pressable
        disabled={!picked.length}
        onPress={go}
        style={({ pressed }) => [styles.cta, !picked.length && styles.ctaOff, pressed && styles.pressed, { marginBottom: insets.bottom + space.md }]}
        accessibilityRole="button"
      >
        <Text style={[styles.ctaText, !picked.length && styles.ctaTextOff]}>
          {!picked.length
            ? 'Pick at least one exercise'
            : adding
              ? `Add ${picked.length} to workout`
              : `Let's go · ${picked.length} exercise${picked.length === 1 ? '' : 's'}`}
        </Text>
      </Pressable>
    </View>
  );
}

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCount}>{note}</Text>
    </View>
  );
}

function PickRow({ exercise, meta, on, locked, onPress }: { exercise: CatalogExercise; meta: string; on: boolean; locked: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.pressed]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: locked }}
      accessibilityLabel={exercise.name}
    >
      <ExerciseThumb exercise={exercise} />
      <View style={styles.flex}>
        <Text style={styles.name} numberOfLines={2}>
          {exercise.name}
        </Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      <View style={[styles.check, on && styles.checkOn, locked && styles.checkLocked]}>
        {on ? <Ionicons name="checkmark" size={16} color={colors.onAccent} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base, paddingHorizontal: space.gutter },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginBottom: space.md },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 32, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: space.sm,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.text, paddingVertical: 0 },
  section: { gap: space.sm },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: space.md },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  sectionCount: { fontFamily: fonts.regular, fontSize: 13, color: colors.textFaint },
  tier: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: space.xs },
  ghost: {
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
  ghostText: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted },
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
  rowOn: { borderColor: colors.fitness },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, marginTop: 4 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.fitness, borderColor: colors.fitness },
  checkLocked: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  cta: { height: 56, borderRadius: radius.button, backgroundColor: colors.fitness, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
  ctaOff: { backgroundColor: colors.raised },
  ctaText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onAccent },
  ctaTextOff: { color: colors.textFaint },
});
