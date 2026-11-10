import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { colors, fonts } from '@/theme/tokens';

import { niceTicks, type Point } from '../progress';

const H = 150;
const PAD = { l: 36, r: 12, t: 22, b: 20 };

const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmt = (v: number) => (v >= 1000 ? Math.round(v).toLocaleString() : String(Math.round(v * 10) / 10));

/**
 * One series, no legend (the card title names it). Latest point is direct-labelled; tapping the plot
 * selects the nearest session and shows its value and date. Grid and axes stay recessive.
 */
export function ProgressChart({ points, unit, label }: { points: Point[]; unit: string; label: string }) {
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const vs = points.map((p) => p.v);
  const ticks = niceTicks(Math.min(...vs), Math.max(...vs));
  const [lo, hi] = [ticks[0], ticks[ticks.length - 1]];
  const plotW = Math.max(1, w - PAD.l - PAD.r);
  const x = (i: number) => PAD.l + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const last = points.length - 1;
  const focus = sel ?? last;

  const pick = (px: number) => {
    if (points.length < 2) return;
    const i = Math.round(((px - PAD.l) / plotW) * (points.length - 1));
    setSel(Math.min(last, Math.max(0, i)));
  };

  const summary = `${label}: ${points.map((p) => `${day(p.t)} ${fmt(p.v)} ${unit}`).join(', ')}`;

  return (
    <View onLayout={onLayout} accessible accessibilityLabel={summary}>
      {w > 0 ? (
        <Pressable onPress={(e) => pick(e.nativeEvent.locationX)}>
          <Svg width={w} height={H}>
            {ticks.map((t) => (
              <Line key={t} x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke={colors.line} strokeWidth={1} />
            ))}
            {ticks.map((t) => (
              <SvgText key={`l${t}`} x={PAD.l - 6} y={y(t) + 4} fontSize={11} fill={colors.textFaint} textAnchor="end" fontFamily={fonts.regular}>
                {fmt(t)}
              </SvgText>
            ))}
            {points.length > 1 ? <Path d={d} stroke={colors.fitness} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
            {sel !== null && sel !== last ? (
              <Line x1={x(sel)} x2={x(sel)} y1={PAD.t - 6} y2={H - PAD.b} stroke={colors.textFaint} strokeWidth={1} strokeDasharray="3 3" />
            ) : null}
            <Circle cx={x(focus)} cy={y(points[focus].v)} r={5} fill={colors.fitness} stroke={colors.surface} strokeWidth={2} />
            <SvgText
              x={Math.min(Math.max(x(focus), PAD.l + 24), w - PAD.r - 24)}
              y={y(points[focus].v) - 10}
              fontSize={14}
              fill={colors.text}
              textAnchor="middle"
              fontFamily={fonts.display}
            >
              {`${fmt(points[focus].v)} ${unit}`}
            </SvgText>
            <SvgText x={PAD.l} y={H - 4} fontSize={11} fill={colors.textFaint} fontFamily={fonts.regular}>
              {day(points[0].t)}
            </SvgText>
            {points.length > 1 ? (
              <SvgText x={w - PAD.r} y={H - 4} fontSize={11} fill={colors.textFaint} textAnchor="end" fontFamily={fonts.regular}>
                {day(points[last].t)}
              </SvgText>
            ) : null}
          </Svg>
        </Pressable>
      ) : (
        <View style={{ height: H }} />
      )}
      {sel !== null && sel !== last ? <Text style={styles.sel}>{`${day(points[sel].t)}: ${fmt(points[sel].v)} ${unit}`}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sel: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
