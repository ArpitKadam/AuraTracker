import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CATALOG } from '@/assets/catalog';
import { getProfile, type Profile } from '@/fitness/db/profile';
import { bestBefore, getSession, type SessionDetail } from '@/fitness/db/session';
import { groupLabel, slugsFor } from '@/fitness/groups';
import { overloadHint, type Hint } from '@/fitness/overload';
import { isPr, topSet, volumeKg, working } from '@/fitness/stats';
import { BodyMap } from '@/fitness/ui/BodyMap';
import { formatWeight, toDisplay } from '@/fitness/units';
import { colors, fonts, radius, space } from '@/theme/tokens';

const NAME = new Map(CATALOG.map((e) => [e.id, e.name]));

type Pr = { exerciseId: string; today: { weightKg: number; reps: number }; before: { weightKg: number; reps: number } };

export default function Summary() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const { session } = useLocalSearchParams<{ session: string }>();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prs, setPrs] = useState<Pr[]>([]);

  useEffect(() => {
    (async () => {
      const [d, p] = await Promise.all([getSession(db, Number(session)), getProfile(db)]);
      if (!d) return;
      const found: Pr[] = [];
      for (const e of d.exercises) {
        const today = topSet(e.sets);
        const before = await bestBefore(db, e.exerciseId, d.startedAt);
        if (today && before && isPr(today, before)) found.push({ exerciseId: e.exerciseId, today, before });
      }
      setDetail(d);
      setProfile(p);
      setPrs(found);
    })();
  }, [db, session]);

  if (!detail || !profile) return <View style={styles.root} />;

  const allSets = detail.exercises.flatMap((e) => e.sets);
  const minutes = Math.max(1, Math.round(((detail.finishedAt ?? detail.startedAt) - detail.startedAt) / 60_000));
  const volume = toDisplay(volumeKg(allSets), profile.units);
  const next: { exerciseId: string; hint: Hint }[] = detail.exercises
    .map((e) => ({
      exerciseId: e.exerciseId,
      hint: overloadHint(working(e.sets).map((s) => ({ weightKg: s.weightKg, reps: s.reps })), { repMin: profile.repMin, weightStepKg: profile.weightStep }),
    }))
    .filter((n) => n.hint.kind !== 'first');
  const date = new Date(detail.startedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.xl }]}>
      <ScrollView contentContainerStyle={{ gap: space.lg, paddingBottom: space.xl }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.flex}>
            <Text style={styles.muted}>{date}</Text>
            <Text style={styles.title}>{`${detail.groups.map(groupLabel).join(' + ')}\ndone`}</Text>
          </View>
          <BodyMap primary={slugsFor(detail.groups)} scale={0.24} />
        </View>

        <View style={styles.stats}>
          <Stat value={String(minutes)} unit="min" label="Duration" />
          <Stat value={volume.toLocaleString()} unit={profile.units} label="Volume" />
          <Stat value={String(working(allSets).length)} label="Working sets" />
        </View>

        {prs.map((pr) => (
          <View key={pr.exerciseId} style={styles.pr}>
            <View style={styles.prIcon}>
              <Ionicons name="trophy-outline" size={22} color={colors.onAccent} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.prLabel}>New top set</Text>
              <Text style={styles.prName}>{`${NAME.get(pr.exerciseId) ?? pr.exerciseId} ${formatWeight(pr.today.weightKg, profile.units)} × ${pr.today.reps}`}</Text>
              <Text style={styles.muted}>{`Up from ${formatWeight(pr.before.weightKg, profile.units)} × ${pr.before.reps}`}</Text>
            </View>
          </View>
        ))}

        {next.length ? (
          <>
            <Text style={styles.section}>Next time</Text>
            <View style={styles.list}>
              {next.map((n, i) => (
                <View key={n.exerciseId} style={[styles.nextRow, i > 0 && styles.divider]}>
                  <View style={styles.flex}>
                    <Text style={styles.nextName}>{NAME.get(n.exerciseId) ?? n.exerciseId}</Text>
                    <Text style={styles.faint}>
                      {n.hint.kind === 'weight' ? `${profile.repMin}+ reps on every set` : n.hint.kind === 'reps' ? `Best today ${n.hint.lastReps} reps` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.nextTarget, n.hint.kind === 'weight' && styles.accent]}>
                    {n.hint.kind === 'weight'
                      ? `Add weight: ${formatWeight(n.hint.weightKg, profile.units)}`
                      : n.hint.kind === 'reps'
                        ? `Push for ${n.hint.from}-${n.hint.to}`
                        : ''}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      <Pressable
        onPress={() => router.dismissTo('/fitness')}
        style={({ pressed }) => [styles.cta, { marginBottom: insets.bottom + space.lg }, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>Done</Text>
      </Pressable>
    </View>
  );
}

function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statRow}>
        <Text style={styles.statValue}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
      <Text style={styles.faint}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.base, paddingHorizontal: space.gutter },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 40, color: colors.text, marginTop: 4 },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  faint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textFaint },
  stats: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.card, paddingVertical: space.lg },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  statValue: { fontFamily: fonts.display, fontSize: 30, color: colors.text },
  statUnit: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  pr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.fitnessSoft,
    padding: space.lg,
  },
  prIcon: { width: 44, height: 44, borderRadius: radius.chip, backgroundColor: colors.fitness, alignItems: 'center', justifyContent: 'center' },
  prLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.fitness },
  prName: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  section: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  list: { backgroundColor: colors.surface, borderRadius: radius.card },
  nextRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 14, gap: space.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  nextName: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  nextTarget: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  accent: { color: colors.fitness },
  cta: { height: 56, borderRadius: radius.button, backgroundColor: colors.fitness, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onAccent },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
