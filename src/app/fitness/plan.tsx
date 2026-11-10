import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CATALOG, MEDIA } from '@/assets/catalog';
import type { CatalogExercise, MuscleGroup, MuscleSlug } from '@/fitness/catalog-types';
import { lastTopSets, listPastSessions, type TopSet } from '@/fitness/db/history';
import { getProfile, LB_PER_KG, type Profile } from '@/fitness/db/profile';
import { GROUPS, groupLabel } from '@/fitness/groups';
import { recommend, swapFor, type GroupPicks } from '@/fitness/recommend';
import { BodyMap } from '@/fitness/ui/BodyMap';
import { colors, fonts, radius, space } from '@/theme/tokens';

const BY_ID = new Map(CATALOG.map((e) => [e.id, e]));
const isGroup = (g: string): g is MuscleGroup => GROUPS.some((x) => x.id === g);

function formatWeight(kg: number, profile: Profile) {
  const v = profile.units === 'kg' ? kg : kg * LB_PER_KG;
  return `${Math.round(v * 10) / 10} ${profile.units}`;
}

export default function Plan() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ groups?: string }>();
  const groups = useMemo(() => (params.groups ?? '').split(',').filter(isGroup), [params.groups]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sections, setSections] = useState<GroupPicks[]>([]);
  const [tops, setTops] = useState<Map<string, TopSet>>(new Map());

  useEffect(() => {
    let live = true;
    (async () => {
      const [p, history] = await Promise.all([getProfile(db), listPastSessions(db)]);
      const recs = recommend(groups, CATALOG, history, p);
      const t = await lastTopSets(db, recs.flatMap((r) => r.picks.map((x) => x.exerciseId)));
      if (!live) return;
      setProfile(p);
      setSections(recs);
      setTops(t);
    })();
    return () => {
      live = false;
    };
  }, [db, groups]);

  const swap = (group: MuscleGroup, index: number) => {
    if (!profile) return;
    const shown = new Set(sections.flatMap((s) => s.picks.map((p) => p.exerciseId)));
    const next = swapFor(sections.find((s) => s.group === group)!.picks[index].exerciseId, group, shown, CATALOG, profile);
    if (!next) return;
    setSections((all) =>
      all.map((s) => (s.group !== group ? s : { ...s, picks: s.picks.map((p, i) => (i === index ? { exerciseId: next, reason: 'catalog' } : p)) })),
    );
  };

  const secondary = useMemo(() => {
    const ids = sections.flatMap((s) => s.picks.map((p) => p.exerciseId));
    return [...new Set(ids.flatMap((id) => BY_ID.get(id)?.secondary ?? []))] as MuscleSlug[];
  }, [sections]);
  const primary = GROUPS.filter((g) => groups.includes(g.id)).flatMap((g) => g.slugs);
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
                  {secondary.filter((s) => !primary.includes(s)).join(', ').replace(/-/g, ' ')}
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
                  const e = BY_ID.get(p.exerciseId);
                  return e ? (
                    <ExerciseRow
                      key={p.exerciseId}
                      exercise={e}
                      badge={p.reason === 'staple' ? 'Staple' : p.reason === 'variety' ? 'Try something new' : null}
                      last={tops.get(p.exerciseId)}
                      profile={profile}
                      onSwap={() => swap(s.group, i)}
                    />
                  ) : null;
                })}
              </View>
            ))
          : null}
      </ScrollView>
    </View>
  );
}

function ExerciseRow({
  exercise,
  badge,
  last,
  profile,
  onSwap,
}: {
  exercise: CatalogExercise;
  badge: string | null;
  last: TopSet | undefined;
  profile: Profile;
  onSwap: () => void;
}) {
  return (
    <View style={styles.row}>
      <Image source={MEDIA[exercise.media[0]]} style={styles.thumb} contentFit="cover" />
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
          <Text style={styles.last}>{last ? `Last ${formatWeight(last.weightKg, profile)} × ${last.reps}` : 'Not tried yet'}</Text>
        </View>
      </View>
      <Pressable onPress={onSwap} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Swap ${exercise.name}`}>
        <Ionicons name="swap-horizontal" size={22} color={colors.textMuted} />
      </Pressable>
    </View>
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
});
