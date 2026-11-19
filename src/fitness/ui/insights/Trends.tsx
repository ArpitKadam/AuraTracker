import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import type { Units } from '@/fitness/db/profile';
import type { Trend, TrendId } from '@/fitness/insights';
import { niceTicks } from '@/fitness/progress';
import { toDisplay } from '@/fitness/units';
import { colors, fonts, insightColors as ic, space } from '@/theme/tokens';

import { Card, shortDate, useCardWidth } from './shared';

const RECENT = 13; // last ~90 days of the 52-week series

const COACH: Record<TrendId, string> = {
  volume: 'One extra set on your main lift each session closes the gap.',
  sets: 'Add a set to two exercises per workout and this turns around.',
  sessions: 'One more short session a week gets you back to your usual pace.',
  duration: 'Ten more minutes per workout brings this back up.',
  e1rm: 'Strength dips like this are normal. A lighter week, then build back up.',
};

function useFmt(units: Units) {
  return (t: Trend, v: number) => {
    if (t.unit === 'kg') return `${Math.round(toDisplay(v, units)).toLocaleString()} ${units}`;
    if (t.unit === 'min') return `${Math.round(v)} min`;
    return `${(Math.round(v * 10) / 10).toLocaleString()} ${t.unit}`;
  };
}

function Sparkline({ t, w, h }: { t: Trend; w: number; h: number }) {
  const vs = t.series.map((s) => s.value);
  const max = Math.max(...vs, 1e-9);
  const n = vs.length;
  const x = (i: number) => (n < 2 ? w / 2 : (i / (n - 1)) * (w - 4) + 2);
  const y = (v: number) => h - 3 - (v / max) * (h - 6);
  const path = (from: number, to: number) => vs.slice(from, to).map((v, i) => `${i ? 'L' : 'M'}${x(from + i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const cut = Math.max(0, n - RECENT);
  return (
    <Svg width={w} height={h}>
      <Path d={path(0, cut + 1)} stroke={colors.textFaint} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Path d={path(cut, n)} stroke={t.up ? colors.fitness : colors.textMuted} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

const H = 150;
const PAD = { l: 40, r: 8, t: 14, b: 20 };

function TrendChart({ t, w, fmt, units }: { t: Trend; w: number; fmt: (t: Trend, v: number) => string; units: Units }) {
  const [sel, setSel] = useState<number | null>(null);
  const disp = (v: number) => (t.unit === 'kg' ? toDisplay(v, units) : v);
  const vs = t.series.map((s) => disp(s.value));
  const ticks = niceTicks(0, Math.max(...vs, disp(t.avg90), disp(t.avg365), 1));
  const hi = ticks[ticks.length - 1];
  const n = vs.length;
  const pw = w - PAD.l - PAD.r;
  const x = (i: number) => PAD.l + (n < 2 ? pw / 2 : (i / (n - 1)) * pw);
  const y = (v: number) => PAD.t + (1 - v / hi) * (H - PAD.t - PAD.b);
  const line = vs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)} Z`;
  const tick = (v: number) => (v >= 10_000 ? `${Math.round(v / 1000)}k` : v.toLocaleString());
  const refs = [
    { v: disp(t.avg90), label: '90-day avg', color: colors.text },
    { v: disp(t.avg365), label: '1-year avg', color: colors.textMuted },
  ];
  // Keep the two reference labels from overlapping when the averages are close.
  const [a, b] = refs.map((r) => y(r.v) - 4);
  const labelY = Math.abs(a - b) < 12 ? (a < b ? [a, a + 12] : [b + 12, b]) : [a, b];

  return (
    <View>
      <Pressable
        onPress={(e) => n > 1 && setSel(Math.min(n - 1, Math.max(0, Math.round(((e.nativeEvent.locationX - PAD.l) / pw) * (n - 1)))))}
        accessibilityLabel={`${t.label}, last 52 weeks. 90-day average ${fmt(t, t.avg90)}, 1-year average ${fmt(t, t.avg365)}`}
      >
        <Svg width={w} height={H}>
          {ticks.map((v) => (
            <Line key={v} x1={PAD.l} x2={w - PAD.r} y1={y(v)} y2={y(v)} stroke={colors.line} strokeWidth={1} />
          ))}
          {ticks.map((v) => (
            <SvgText key={`l${v}`} x={PAD.l - 6} y={y(v) + 4} fontSize={10} fill={colors.textFaint} textAnchor="end" fontFamily={fonts.regular}>
              {tick(v)}
            </SvgText>
          ))}
          <Path d={area} fill={ic.fitnessWash} />
          <Path d={line} stroke={colors.fitness} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {refs.map((r) => (
            <Line key={r.label} x1={PAD.l} x2={w - PAD.r} y1={y(r.v)} y2={y(r.v)} stroke={r.color} strokeWidth={1} strokeDasharray="4 4" opacity={0.8} />
          ))}
          {refs.map((r, i) => (
            <SvgText key={`t${r.label}`} x={w - PAD.r} y={labelY[i]} fontSize={10} fill={r.color} textAnchor="end" fontFamily={fonts.medium}>
              {`${r.label} ${tick(Math.round(r.v * 10) / 10)}`}
            </SvgText>
          ))}
          {sel !== null ? (
            <>
              <Line x1={x(sel)} x2={x(sel)} y1={PAD.t} y2={H - PAD.b} stroke={colors.textFaint} strokeWidth={1} />
              <Circle cx={x(sel)} cy={y(vs[sel])} r={4.5} fill={colors.fitness} stroke={colors.surface} strokeWidth={2} />
            </>
          ) : null}
          <SvgText x={PAD.l} y={H - 4} fontSize={10} fill={colors.textFaint} fontFamily={fonts.regular}>
            {t.series.length ? shortDate(t.series[0].weekStart) : ''}
          </SvgText>
          <SvgText x={w - PAD.r} y={H - 4} fontSize={10} fill={colors.textFaint} textAnchor="end" fontFamily={fonts.regular}>
            This week
          </SvgText>
        </Svg>
      </Pressable>
      <Text style={styles.read}>{sel !== null ? `Week of ${shortDate(t.series[sel].weekStart)}: ${fmt(t, t.series[sel].value)}` : 'Tap the chart to read a week'}</Text>
    </View>
  );
}

/** Apple-style trends: is the last 90 days above or below your 1-year average? */
export function Trends({ trends, units }: { trends: Trend[]; units: Units }) {
  const w = useCardWidth();
  const fmt = useFmt(units);
  const [open, setOpen] = useState<TrendId | null>(null);
  const toggle = (id: TrendId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => (o === id ? null : id));
  };

  return (
    <Card title="Trends" note="Last 90 days vs your 1-year average, per week">
      {trends.map((t, i) => (
        <View key={t.id} style={i > 0 && styles.divider}>
          <Pressable
            onPress={() => toggle(t.id)}
            style={styles.row}
            accessibilityRole="button"
            accessibilityState={{ expanded: open === t.id }}
            accessibilityLabel={`${t.label} trending ${t.up ? 'up' : 'down'}: 90-day average ${fmt(t, t.avg90)} a week, ${Math.abs(Math.round(t.delta * 100))} percent ${t.up ? 'above' : 'below'} your 1-year average`}
          >
            <View style={[styles.arrow, t.up ? styles.arrowUp : styles.arrowDown]}>
              <Ionicons name={t.up ? 'arrow-up' : 'arrow-down'} size={16} color={t.up ? colors.onAccent : colors.text} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.label}>{t.label}</Text>
              <Text style={styles.value}>
                {fmt(t, t.avg90)}
                <Text style={styles.per}> /wk</Text>
              </Text>
            </View>
            <Sparkline t={t} w={84} h={30} />
            <Ionicons name={open === t.id ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textFaint} />
          </Pressable>
          {!t.up ? <Text style={styles.coach}>{COACH[t.id]}</Text> : null}
          {open === t.id ? <TrendChart t={t} w={w} fmt={fmt} units={units} /> : null}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  divider: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  arrow: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  arrowUp: { backgroundColor: colors.fitness },
  arrowDown: { backgroundColor: colors.raised },
  label: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
  value: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: colors.text },
  per: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  coach: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginTop: space.xs, marginLeft: 44 },
  read: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
