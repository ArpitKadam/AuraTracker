import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';

import type { Balance } from '@/fitness/insights';
import { GROUPS, groupLabel } from '@/fitness/groups';
import { colors, fonts, insightColors as ic, space } from '@/theme/tokens';

import { Card, useCardWidth } from './shared';

const H = 250;
const RINGS = [0.25, 0.5, 0.75, 1];

/** 8-axis share of training load over 30 days (filled), with the last 7 days as an outline. */
export function BalanceRadar({ month, week }: { month: Balance[]; week: Balance[] }) {
  const w = useCardWidth();
  const cx = w / 2;
  const cy = H / 2;
  const R = Math.min(cx - 70, cy - 40);
  // `share` is relative to the most-trained group (shape); labels give each group's percent of all load.
  const share = (list: Balance[], g: string) => list.find((b) => b.group === g)?.share ?? 0;
  const sum = month.reduce((a, b) => a + b.load, 0) || 1;
  const pct = (g: string) => Math.round(((month.find((b) => b.group === g)?.load ?? 0) / sum) * 100);
  const max = 1.05;
  const angle = (i: number) => (i / GROUPS.length) * 2 * Math.PI - Math.PI / 2;
  const pt = (i: number, v: number) => [cx + Math.cos(angle(i)) * R * (v / max), cy + Math.sin(angle(i)) * R * (v / max)] as const;
  const poly = (list: Balance[]) => GROUPS.map((g, i) => pt(i, share(list, g.id)).map((n) => n.toFixed(1)).join(',')).join(' ');
  const hasWeek = week.some((b) => b.share > 0);
  const label = `Muscle balance, share of the last 30 days: ${GROUPS.map((g) => `${g.label} ${pct(g.id)} percent`).join(', ')}`;

  return (
    <Card title="Muscle balance" note="Each group's share of your working sets" label={label}>
      <Svg width={w} height={H}>
        {RINGS.map((f) => (
          <Polygon
            key={f}
            points={GROUPS.map((_, i) => [cx + Math.cos(angle(i)) * R * f, cy + Math.sin(angle(i)) * R * f].map((n) => n.toFixed(1)).join(',')).join(' ')}
            fill="none"
            stroke={colors.line}
            strokeWidth={1}
          />
        ))}
        {GROUPS.map((g, i) => (
          <Line key={g.id} x1={cx} y1={cy} x2={cx + Math.cos(angle(i)) * R} y2={cy + Math.sin(angle(i)) * R} stroke={colors.line} strokeWidth={1} />
        ))}
        <Polygon points={poly(month)} fill={ic.fitnessBand} stroke={colors.fitness} strokeWidth={2} strokeLinejoin="round" />
        {hasWeek ? <Polygon points={poly(week)} fill="none" stroke={colors.text} strokeWidth={1.5} strokeDasharray="4 3" strokeLinejoin="round" /> : null}
        {GROUPS.map((g, i) => {
          const [x, y] = pt(i, share(month, g.id));
          return <Circle key={`d${g.id}`} cx={x} cy={y} r={3.5} fill={colors.fitness} stroke={colors.surface} strokeWidth={2} />;
        })}
        {GROUPS.map((g, i) => {
          const c = Math.cos(angle(i));
          const s = Math.sin(angle(i));
          const x = cx + c * (R + 12);
          const y = cy + s * (R + 12);
          const anchor = Math.abs(c) < 0.3 ? 'middle' : c > 0 ? 'start' : 'end';
          const dy = s < -0.3 ? -16 : s > 0.3 ? 8 : -4;
          return (
            <G key={`l${g.id}`}>
              <SvgText x={x} y={y + dy} fontSize={11} fill={colors.textMuted} textAnchor={anchor} fontFamily={fonts.medium}>
                {groupLabel(g.id)}
              </SvgText>
              <SvgText x={x} y={y + dy + 14} fontSize={13} fill={colors.text} textAnchor={anchor} fontFamily={fonts.display}>
                {`${pct(g.id)}%`}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      <View style={styles.legend}>
        <View style={styles.item}>
          <View style={[styles.swatch, styles.month]} />
          <Text style={styles.text}>Last 30 days</Text>
        </View>
        {hasWeek ? (
          <View style={styles.item}>
            <View style={[styles.swatch, styles.week]} />
            <Text style={styles.text}>Last 7 days</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', justifyContent: 'center', gap: space.lg },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 10, borderRadius: 3 },
  month: { backgroundColor: ic.fitnessBand, borderWidth: 1.5, borderColor: colors.fitness },
  week: { borderWidth: 1.5, borderColor: colors.text, borderStyle: 'dashed' },
  text: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
});
