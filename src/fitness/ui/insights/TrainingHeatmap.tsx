import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import type { Units } from '@/fitness/db/profile';
import { heatLevels, type HeatDay } from '@/fitness/insights';
import { colors, fonts, insightColors as ic, space } from '@/theme/tokens';

import { Card, dayKey, mondayOf, Segmented, vol } from './shared';

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const TOP = 16; // month labels
const WEEKS = 53;

type Metric = 'time' | 'volume';
type Cell = { key: string; col: number; row: number; t: number; day: HeatDay | undefined; future: boolean };

/** GitHub-style year of training, Mon..Sun rows, newest week on the right. */
export function TrainingHeatmap({ days, now, units }: { days: HeatDay[]; now: number; units: Units }) {
  const [metric, setMetric] = useState<Metric>('time');
  const [sel, setSel] = useState<Cell | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const today = dayKey(new Date(now));

  const cells = useMemo(() => {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const first = mondayOf(now);
    first.setDate(first.getDate() - 7 * (WEEKS - 1));
    const out: Cell[] = [];
    for (let i = 0; i < WEEKS * 7; i++) {
      const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
      const key = dayKey(d);
      out.push({ key, col: Math.floor(i / 7), row: i % 7, t: d.getTime(), day: byDate.get(key), future: key > today });
    }
    return out;
  }, [days, now, today]);

  const value = (d: HeatDay | undefined) => (d ? (metric === 'time' ? d.minutes : d.volume) : 0);
  const level = useMemo(() => heatLevels(days.map((d) => (metric === 'time' ? d.minutes : d.volume))), [days, metric]);

  const months = cells.filter((c) => c.row === 0 && new Date(c.t + 6 * 86_400_000).getDate() <= 7);
  const width = WEEKS * STEP;
  const height = TOP + 7 * STEP;
  const active = cells.filter((c) => c.day && c.day.sessions > 0).length;

  const pick = (x: number, y: number) => {
    const col = Math.floor(x / STEP);
    const row = Math.floor((y - TOP) / STEP);
    const c = cells[col * 7 + row];
    if (row < 0 || row > 6 || !c || c.future) return setSel(null);
    setSel((s) => (s?.key === c.key ? null : c));
  };

  const read = (c: Cell) => {
    const date = new Date(c.t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const d = c.day;
    if (!d || d.sessions === 0) return `${date} · rest day`;
    return `${date} · ${d.sessions} workout${d.sessions > 1 ? 's' : ''} · ${Math.round(d.minutes)} min · ${vol(d.volume, units)}`;
  };

  return (
    <Card
      title="Training year"
      note={`${active} training days in the last 12 months`}
      right={
        <Segmented
          options={[
            { id: 'time', label: 'Time' },
            { id: 'volume', label: 'Volume' },
          ]}
          value={metric}
          onChange={setMetric}
        />
      }
    >
      <View style={styles.row} accessible accessibilityLabel={`Training heatmap: ${active} training days in the last 53 weeks, shaded by ${metric === 'time' ? 'minutes' : 'volume'}.`}>
        <View style={[styles.days, { paddingTop: TOP }]}>
          {['Mon', '', 'Wed', '', 'Fri', '', ''].map((d, i) => (
            <Text key={i} style={styles.dayLabel}>
              {d}
            </Text>
          ))}
        </View>
        <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          <Pressable onPress={(e) => pick(e.nativeEvent.locationX, e.nativeEvent.locationY)}>
            <Svg width={width} height={height}>
              {months.map((c) => (
                <SvgText key={`m${c.key}`} x={c.col * STEP} y={11} fontSize={10} fill={colors.textFaint} fontFamily={fonts.regular}>
                  {new Date(c.t + 6 * 86_400_000).toLocaleDateString(undefined, { month: 'short' })}
                </SvgText>
              ))}
              {cells.map((c) => (
                <Rect
                  key={c.key}
                  x={c.col * STEP}
                  y={TOP + c.row * STEP}
                  width={CELL}
                  height={CELL}
                  rx={3}
                  fill={ic.heat[c.future ? 0 : level(value(c.day), !!c.day && c.day.sessions > 0)]}
                  opacity={c.future ? 0.35 : 1}
                  stroke={c.key === today || c.key === sel?.key ? colors.text : undefined}
                  strokeWidth={c.key === today || c.key === sel?.key ? 1.5 : 0}
                />
              ))}
            </Svg>
          </Pressable>
        </ScrollView>
      </View>
      <View style={styles.foot}>
        <Text style={styles.read} numberOfLines={1}>
          {sel ? read(sel) : 'Tap a day'}
        </Text>
        <View style={styles.legend}>
          <Text style={styles.legendText}>Less</Text>
          {ic.heat.map((c) => (
            <View key={c} style={[styles.swatch, { backgroundColor: c }]} />
          ))}
          <Text style={styles.legendText}>More</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  days: { width: 26 },
  dayLabel: { height: STEP, fontFamily: fonts.regular, fontSize: 10, lineHeight: CELL, color: colors.textFaint },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  read: { flex: 1, fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendText: { fontFamily: fonts.regular, fontSize: 10, color: colors.textFaint, marginHorizontal: 2 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
});
