import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Mask, Path } from 'react-native-svg';

import type { Units } from '@/fitness/db/profile';
import type { Ring, Rings } from '@/fitness/insights';
import { toDisplay } from '@/fitness/units';
import { colors, fonts, insightColors as ic, space } from '@/theme/tokens';

import { arc, fullCircle, int, mix } from './shared';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

const SIZE = 168;
const C = SIZE / 2;
const STROKE = Math.round(C / 6);
const SEGMENTS = 72;
const MAX_LAPS = 2; // ponytail: a third lap draws as a full second lap; the number beside it stays exact.

/** Angular gradient: the filled extent cut into short arcs, each stroked with an interpolated color. */
function Segments({ r, extent, hues }: { r: number; extent: number; hues: readonly [string, string] }) {
  const n = Math.max(1, Math.ceil(SEGMENTS * extent));
  return Array.from({ length: n }, (_, k) => (
    <Path
      key={k}
      d={arc(C, C, r, (extent * k) / n, Math.min(extent, (extent * (k + 1)) / n + 0.003))}
      stroke={mix(hues[0], hues[1], n === 1 ? 1 : k / (n - 1))}
      strokeWidth={STROKE}
      fill="none"
    />
  ));
}

function useCap(p: SharedValue<number>, r: number, lap: 0 | 1, ahead = 0) {
  return useAnimatedProps(() => {
    const t = Math.min(1, Math.max(0, p.value - lap));
    const a = t * 2 * Math.PI - Math.PI / 2;
    // `ahead` pushes the point along the clockwise tangent (the shadow peeks out in front of the cap).
    const visible = lap === 0 ? p.value > 0.0005 && p.value <= 1.0005 : p.value > 1;
    return {
      cx: C + r * Math.cos(a) - ahead * Math.sin(a),
      cy: C + r * Math.sin(a) + ahead * Math.cos(a),
      opacity: visible ? 1 : 0,
    };
  });
}

function RingArc({ id, r, ring, hues, track, delay, reduce }: { id: string; r: number; ring: Ring; hues: readonly [string, string]; track: string; delay: number; reduce: boolean }) {
  const frac = Math.min(MAX_LAPS, Math.max(0, ring.frac));
  const p = useSharedValue(reduce ? frac : 0);
  useEffect(() => {
    if (reduce) p.value = frac;
    else p.value = withDelay(delay, withTiming(frac, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [frac, delay, reduce, p]);

  const len = 2 * Math.PI * r;
  const reveal1 = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - Math.min(1, p.value)) }));
  const reveal2 = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - Math.min(1, Math.max(0, p.value - 1))) }));
  const dimFirst = useAnimatedProps(() => ({ opacity: 1 - 0.45 * Math.min(1, Math.max(0, (p.value - 1) * 6)) }));
  const startCap2 = useAnimatedProps(() => ({ opacity: p.value > 1 ? 1 : 0 }));
  const cap1 = useCap(p, r, 0);
  const cap2 = useCap(p, r, 1);
  const shadow = useCap(p, r, 1, STROKE * 0.14);

  const mask = (key: string, props: typeof reveal1) => (
    <Mask id={key} maskUnits="userSpaceOnUse" x={0} y={0} width={SIZE} height={SIZE}>
      <AnimatedPath d={fullCircle(C, C, r)} stroke={ic.maskOn} strokeWidth={STROKE + 4} fill="none" strokeDasharray={[len, len]} animatedProps={props} />
    </Mask>
  );

  return (
    <G>
      <Defs>
        {mask(`${id}-1`, reveal1)}
        {frac > 1 ? mask(`${id}-2`, reveal2) : null}
      </Defs>
      <Circle cx={C} cy={C} r={r} stroke={track} strokeWidth={STROKE} fill="none" />
      {frac > 0 ? (
        <>
          <AnimatedG animatedProps={dimFirst}>
            <G mask={`url(#${id}-1)`}>
              <Segments r={r} extent={Math.min(1, frac)} hues={hues} />
            </G>
            <Circle cx={C} cy={C - r} r={STROKE / 2} fill={hues[0]} />
            <AnimatedCircle r={STROKE / 2} fill={hues[1]} animatedProps={cap1} />
          </AnimatedG>
          {frac > 1 ? (
            <>
              <G mask={`url(#${id}-2)`}>
                <Segments r={r} extent={frac - 1} hues={hues} />
              </G>
              <AnimatedCircle cx={C} cy={C - r} r={STROKE / 2} fill={hues[0]} animatedProps={startCap2} />
              <AnimatedCircle r={STROKE / 2} fill={ic.ringCapShadow} animatedProps={shadow} />
              <AnimatedCircle r={STROKE / 2} fill={hues[1]} animatedProps={cap2} />
            </>
          ) : null}
        </>
      ) : null}
    </G>
  );
}

const RINGS = [
  { key: 'volume', label: 'Volume', hues: ic.ringVolume, track: ic.ringVolumeTrack },
  { key: 'sets', label: 'Working sets', hues: ic.ringSets, track: ic.ringSetsTrack },
  { key: 'sessions', label: 'Workouts', hues: ic.ringSessions, track: ic.ringSessionsTrack },
] as const;

/** Apple-style activity rings for this week: Volume (outer), Working sets, Workouts (inner). */
export function ActivityRings({ rings, units }: { rings: Rings; units: Units }) {
  const reduce = useReducedMotion();
  const show = (key: (typeof RINGS)[number]['key'], v: number) => (key === 'volume' ? int(toDisplay(v, units)) : int(v));
  const unit = (key: (typeof RINGS)[number]['key']) => (key === 'volume' ? ` ${units}` : '');
  const summary = `This week. ${RINGS.map((d) => `${d.label} ${show(d.key, rings[d.key].value)} of ${show(d.key, rings[d.key].goal)}${unit(d.key)}, ${Math.round(rings[d.key].frac * 100)} percent`).join('. ')}`;

  return (
    <View style={styles.row} accessible accessibilityLabel={summary}>
      <Svg width={SIZE} height={SIZE}>
        {RINGS.map((d, i) => (
          <RingArc key={d.key} id={`ring-${d.key}`} r={C - STROKE / 2 - 1 - i * (STROKE + 2)} ring={rings[d.key]} hues={d.hues} track={d.track} delay={i * 120} reduce={reduce} />
        ))}
      </Svg>
      <View style={styles.legend}>
        {RINGS.map((d) => {
          const ring = rings[d.key];
          return (
            <View key={d.key} style={styles.item}>
              <View style={styles.labelRow}>
                <View style={[styles.key, { backgroundColor: d.hues[1] }]} />
                <Text style={styles.label}>{d.label}</Text>
              </View>
              <Text style={styles.value}>
                {show(d.key, ring.value)}
                <Text style={styles.goal}>{` / ${show(d.key, ring.goal)}${unit(d.key)}`}</Text>
              </Text>
              <Text style={styles.pct}>{`${Math.round(ring.frac * 100)}%`}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  legend: { flex: 1, gap: space.md },
  item: { gap: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  key: { width: 10, height: 4, borderRadius: 2 },
  label: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  value: { fontFamily: fonts.display, fontSize: 26, lineHeight: 28, color: colors.text },
  goal: { fontFamily: fonts.displaySemi, fontSize: 16, color: colors.textMuted },
  pct: { fontFamily: fonts.regular, fontSize: 11, color: colors.textFaint },
});
