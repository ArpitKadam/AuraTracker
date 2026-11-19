import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import type { Award } from '@/fitness/insights';
import { colors, fonts, insightColors as ic, radius, space } from '@/theme/tokens';

import { arc, Card, clamp01 } from './shared';

const D = 64;
const C = D / 2;

type Icon = ComponentProps<typeof Ionicons>['name'];
const ICON: [string, Icon][] = [
  ['workouts-', 'barbell'],
  ['prs-', 'trophy'],
  ['streak-', 'flame'],
  ['volume-', 'layers'],
  ['full-body', 'body'],
  ['early-bird', 'sunny'],
  ['night-owl', 'moon'],
];
const iconFor = (id: string): Icon => ICON.find(([p]) => id.startsWith(p))?.[1] ?? 'medal';

function Medallion({ award }: { award: Award }) {
  const p = clamp01(award.progress);
  return (
    <View style={styles.medal}>
      <Svg width={D} height={D}>
        <Defs>
          <LinearGradient id={`m-${award.id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={ic.medal[0]} />
            <Stop offset="0.5" stopColor={ic.medal[1]} />
            <Stop offset="1" stopColor={ic.medal[2]} />
          </LinearGradient>
        </Defs>
        {award.earned ? (
          <>
            <Circle cx={C} cy={C} r={C - 1.5} fill="none" stroke={colors.fitness} strokeWidth={3} opacity={0.25} />
            <Circle cx={C} cy={C} r={C - 6} fill={`url(#m-${award.id})`} />
            <Circle cx={C} cy={C} r={C - 11} fill="none" stroke={ic.medal[0]} strokeWidth={1} opacity={0.6} />
          </>
        ) : (
          <>
            <Circle cx={C} cy={C} r={C - 3} fill="none" stroke={colors.raised} strokeWidth={3} />
            {p > 0 ? <Path d={arc(C, C, C - 3, 0, Math.max(0.02, Math.min(p, 0.999)))} stroke={colors.fitnessSoft} strokeWidth={3} fill="none" strokeLinecap="round" /> : null}
            <Circle cx={C} cy={C} r={C - 8} fill={colors.raised} />
          </>
        )}
      </Svg>
      <View style={styles.icon} pointerEvents="none">
        <Ionicons name={iconFor(award.id)} size={24} color={award.earned ? colors.onAccent : colors.textFaint} />
      </View>
    </View>
  );
}

/** Milestone badges; tap one for what it takes. */
export function Awards({ awards }: { awards: Award[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const earned = awards.filter((a) => a.earned).length;
  const picked = awards.find((a) => a.id === sel);
  // Earned first so the shelf leads with wins; within each half the original (difficulty) order holds.
  const ordered = [...awards.filter((a) => a.earned), ...awards.filter((a) => !a.earned)];

  return (
    <Card title="Awards" note={`${earned} of ${awards.length} earned`}>
      <View style={styles.grid}>
        {ordered.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => setSel((s) => (s === a.id ? null : a.id))}
            style={[styles.cell, sel === a.id && styles.cellOn, !a.earned && styles.locked]}
            accessibilityRole="button"
            accessibilityLabel={`${a.title}, ${a.earned ? 'earned' : `locked, ${Math.round(clamp01(a.progress) * 100)} percent there`}. ${a.detail}`}
          >
            <Medallion award={a} />
            <Text style={[styles.title, !a.earned && styles.titleLocked]} numberOfLines={2}>
              {a.title}
            </Text>
          </Pressable>
        ))}
      </View>
      {picked ? (
        <View style={styles.detail}>
          <Text style={styles.detailTitle}>{picked.title}</Text>
          <Text style={styles.detailText}>{picked.earned ? `Earned · ${picked.detail}` : `${picked.detail} · ${Math.round(clamp01(picked.progress) * 100)}% there`}</Text>
        </View>
      ) : (
        <Text style={styles.hint}>Tap a badge to see what it takes</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md },
  cell: { width: '33.33%', alignItems: 'center', gap: 6, paddingVertical: space.xs, borderRadius: radius.card },
  cellOn: { backgroundColor: colors.raised },
  locked: { opacity: 0.75 },
  medal: { width: D, height: D },
  icon: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.medium, fontSize: 12, color: colors.text, textAlign: 'center', paddingHorizontal: space.xs },
  titleLocked: { color: colors.textMuted },
  detail: { backgroundColor: colors.raised, borderRadius: radius.card, padding: space.md, gap: 2 },
  detailTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  detailText: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textFaint, textAlign: 'center' },
});
