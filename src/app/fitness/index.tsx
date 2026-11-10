import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSwitchButton } from '@/components/AppSwitchButton';
import type { MuscleGroup } from '@/fitness/catalog-types';
import { getProfile, type Profile } from '@/fitness/db/profile';
import { getActiveSession, setCounts, type ActiveSession } from '@/fitness/db/session';
import { getOverrides, getSplit, postponeDay, skipDay, undoDay } from '@/fitness/db/split';
import { GROUPS, groupLabel, slugsFor } from '@/fitness/groups';
import { dayStatus, groupsOf, type DayStatus } from '@/fitness/schedule';
import { BodyMap } from '@/fitness/ui/BodyMap';
import { colors, fonts, radius, space } from '@/theme/tokens';

const shortDay = (iso: string) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '';
const label = (gs: MuscleGroup[]) => gs.map(groupLabel).join(' + ');

export default function Today() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selected, setSelected] = useState<MuscleGroup[]>([]);
  const [active, setActive] = useState<{ session: ActiveSession; sets: number } | null>(null);
  const [status, setStatus] = useState<DayStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Pre-select today's planned groups once; after that the selection is the user's.
  const touched = useRef(false);

  const loadStatus = useCallback(async () => {
    const now = new Date();
    const st = dayStatus(now, await getSplit(db), await getOverrides(db, now));
    setStatus(st);
    if (!touched.current) setSelected(st.kind === 'planned' || st.kind === 'moved' ? groupsOf(st.plan) : []);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      getProfile(db).then(setProfile);
      loadStatus();
      getActiveSession(db).then(async (a) => {
        if (!a) return setActive(null);
        const counts = await setCounts(db, a.id);
        setActive({ session: a, sets: [...counts.values()].reduce((x, y) => x + y, 0) });
      });
    }, [db, loadStatus]),
  );

  if (!profile) return <View style={styles.root} />;
  if (!profile.onboarded) return <Redirect href="/fitness/onboarding" />;

  const toggle = (g: MuscleGroup) => {
    touched.current = true;
    setSelected((s) => (s.includes(g) ? s.filter((x) => x !== g) : [...s, g]));
  };
  const today = new Date();
  const skip = async () => {
    if (status?.kind !== 'planned') return;
    await skipDay(db, today, status.plan);
    touched.current = false;
    setNote(null);
    await loadStatus();
  };
  const postpone = async () => {
    if (status?.kind !== 'planned') return;
    const to = await postponeDay(db, today, status.plan);
    setNote(to ? null : 'No free rest day in the next 2 weeks. Edit your split to add one.');
    touched.current = false;
    await loadStatus();
  };
  const undo = async () => {
    await undoDay(db, today);
    touched.current = false;
    await loadStatus();
  };
  // Keep display order stable regardless of tap order.
  const ordered = GROUPS.filter((g) => selected.includes(g.id));
  const cta = ordered.length ? `Build ${ordered.map((g) => g.label.toLowerCase()).join(' + ')}` : 'Pick at least one group';

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.lg }]}>
      <ScrollView contentContainerStyle={{ gap: space.lg, paddingBottom: space.xl }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{'What are we\nworking today?'}</Text>
          <View style={styles.headerIcons}>
            <Pressable
              onPress={() => router.push('/fitness/settings')}
              hitSlop={8}
              style={styles.gear}
              accessibilityRole="button"
              accessibilityLabel="Settings"
            >
              <Ionicons name="settings-outline" size={20} color={colors.text} />
            </Pressable>
            <AppSwitchButton />
          </View>
        </View>

        {active ? (
          <Pressable
            onPress={() => router.push({ pathname: '/fitness/plan', params: { groups: active.session.groups.join(',') } })}
            style={styles.resume}
            accessibilityRole="button"
          >
            <View style={styles.flex}>
              <Text style={styles.resumeLabel}>Workout in progress</Text>
              <Text style={styles.resumeText}>{`${active.session.groups.map(groupLabel).join(' + ')}, ${active.sets} set${active.sets === 1 ? '' : 's'} logged`}</Text>
            </View>
            <Text style={styles.resumeCta}>Resume</Text>
          </Pressable>
        ) : null}

        {status && !active ? (
          <View style={styles.today}>
            <View style={styles.flex}>
              <Text style={styles.todayLabel}>
                {status.kind === 'planned'
                  ? "Today's plan"
                  : status.kind === 'moved'
                    ? `Moved here from ${shortDay(status.from)}`
                    : status.kind === 'skipped'
                      ? 'Skipped today'
                      : status.kind === 'postponed'
                        ? `Moved to ${shortDay(status.to)}`
                        : 'Rest day'}
              </Text>
              <Text style={styles.todayText}>
                {status.kind === 'rest' ? 'Nothing planned. Train anything you like.' : label(groupsOf(status.plan))}
              </Text>
            </View>
            {status.kind === 'planned' ? (
              <View style={styles.todayActions}>
                <Pressable onPress={skip} hitSlop={6} accessibilityRole="button" accessibilityLabel="Skip today">
                  <Text style={styles.todayAction}>Skip</Text>
                </Pressable>
                <Pressable onPress={postpone} hitSlop={6} accessibilityRole="button" accessibilityLabel="Postpone today">
                  <Text style={styles.todayAction}>Postpone</Text>
                </Pressable>
              </View>
            ) : status.kind === 'skipped' || status.kind === 'postponed' ? (
              <Pressable onPress={undo} hitSlop={6} accessibilityRole="button" accessibilityLabel="Undo">
                <Text style={styles.todayAction}>Undo</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {note ? <Text style={styles.note}>{note}</Text> : null}

        <View style={styles.map}>
          <BodyMap primary={slugsFor(selected)} scale={0.62} />
        </View>

        <View style={styles.labelRow}>
          <Text style={styles.label}>Muscle groups</Text>
          <Text style={styles.count}>{selected.length ? `${selected.length} selected` : 'None selected'}</Text>
        </View>
        <View style={styles.chips}>
          {GROUPS.map((g) => {
            const on = selected.includes(g.id);
            return (
              <Pressable
                key={g.id}
                onPress={() => toggle(g.id)}
                style={[styles.chip, on && styles.chipOn]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{g.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Pressable
        disabled={!ordered.length}
        onPress={() => router.push({ pathname: '/fitness/plan', params: { groups: ordered.map((g) => g.id).join(',') } })}
        style={({ pressed }) => [styles.cta, !ordered.length && styles.ctaOff, pressed && styles.pressed, { marginBottom: insets.bottom + space.lg }]}
        accessibilityRole="button"
      >
        <Text style={[styles.ctaText, !ordered.length && styles.ctaTextOff]}>{cta}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base, paddingHorizontal: space.gutter },
  flex: { flex: 1 },
  today: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  todayLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  todayText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, marginTop: 2 },
  todayActions: { flexDirection: 'row', gap: space.lg },
  todayAction: { fontFamily: fonts.semibold, fontSize: 14, color: colors.fitness },
  note: { fontFamily: fonts.regular, fontSize: 13, color: colors.danger },
  resume: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.fitness,
  },
  resumeLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.fitness },
  resumeText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  resumeCta: { fontFamily: fonts.semibold, fontSize: 15, color: colors.fitness },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerIcons: { flexDirection: 'row', gap: space.sm },
  gear: {
    width: 44,
    height: 44,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.display, fontSize: 36, lineHeight: 38, color: colors.text },
  map: { backgroundColor: colors.surface, borderRadius: radius.card, paddingVertical: space.lg },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  count: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.chip,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.fitness, borderColor: colors.fitness },
  chipText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  chipTextOn: { color: colors.onAccent },
  cta: { height: 56, borderRadius: radius.button, backgroundColor: colors.fitness, alignItems: 'center', justifyContent: 'center' },
  ctaOff: { backgroundColor: colors.raised },
  ctaText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onAccent },
  ctaTextOff: { color: colors.textFaint },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
