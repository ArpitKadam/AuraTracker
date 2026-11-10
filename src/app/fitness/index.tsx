import { Redirect, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSwitchButton } from '@/components/AppSwitchButton';
import type { MuscleGroup } from '@/fitness/catalog-types';
import { getProfile, type Profile } from '@/fitness/db/profile';
import { getActiveSession, setCounts, type ActiveSession } from '@/fitness/db/session';
import { GROUPS, groupFromName, groupLabel, slugsFor } from '@/fitness/groups';
import { planFor } from '@/fitness/split';
import { BodyMap } from '@/fitness/ui/BodyMap';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Today's planned groups from the split, primary first. Empty on rest days. */
function plannedToday(): MuscleGroup[] {
  const plan = planFor(new Date());
  if (!plan) return [];
  const ids = [...plan.primary, ...plan.secondary].map(groupFromName).filter((g): g is MuscleGroup => g !== null);
  return [...new Set(ids)];
}

export default function Today() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selected, setSelected] = useState<MuscleGroup[]>(plannedToday);
  const [active, setActive] = useState<{ session: ActiveSession; sets: number } | null>(null);
  useFocusEffect(
    useCallback(() => {
      getProfile(db).then(setProfile);
      getActiveSession(db).then(async (a) => {
        if (!a) return setActive(null);
        const counts = await setCounts(db, a.id);
        setActive({ session: a, sets: [...counts.values()].reduce((x, y) => x + y, 0) });
      });
    }, [db]),
  );

  if (!profile) return <View style={styles.root} />;
  if (!profile.onboarded) return <Redirect href="/fitness/onboarding" />;

  const toggle = (g: MuscleGroup) => setSelected((s) => (s.includes(g) ? s.filter((x) => x !== g) : [...s, g]));
  // Keep display order stable regardless of tap order.
  const ordered = GROUPS.filter((g) => selected.includes(g.id));
  const cta = ordered.length ? `Build ${ordered.map((g) => g.label.toLowerCase()).join(' + ')}` : 'Pick at least one group';

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.lg }]}>
      <ScrollView contentContainerStyle={{ gap: space.lg, paddingBottom: space.xl }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{'What are we\nworking today?'}</Text>
          <AppSwitchButton />
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
