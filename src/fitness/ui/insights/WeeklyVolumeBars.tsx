import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import type { Units } from '@/fitness/db/profile';
import type { WeekVolume } from '@/fitness/insights';
import { toDisplay } from '@/fitness/units';
import { colors, fonts, space } from '@/theme/tokens';

import { Card, shortDate, useCardWidth, vol, volShort } from './shared';

const H = 160;
const PAD = { t: 22, b: 20 };

/** Column with a 4px rounded top, square at the baseline. */
const column = (x: number, y: number, w: number, base: number) => {
  const r = Math.min(4, w / 2, base - y);
  return `M${x} ${base} L${x} ${y + r} Q${x} ${y} ${x + r} ${y} L${x + w - r} ${y} Q${x + w} ${y} ${x + w} ${y + r} L${x + w} ${base} Z`;
};

/** Last 12 weeks of volume; this week in the accent, the 12-week average as a dashed reference. */
export function WeeklyVolumeBars({ weeks, units }: { weeks: WeekVolume[]; units: Units }) {
  const w = useCardWidth();
  const last = weeks.length - 1;
  const [sel, setSel] = useState<number | null>(null);
  if (!weeks.length) return null;

  const done = weeks.slice(0, -1).filter((x) => x.volume > 0);
  const avg = done.length ? done.reduce((a, x) => a + x.volume, 0) / done.length : 0;
  const max = Math.max(...weeks.map((x) => x.volume), avg, 1);
  const slot = w / weeks.length;
  const bw = Math.min(24, slot - 6);
  const base = H - PAD.b;
  const y = (v: number) => base - (v / max) * (base - PAD.t);
  const focus = sel ?? last;
  const fx = Math.min(Math.max(slot * focus + slot / 2, 28), w - 28);

  return (
    <Card title="Weekly volume" note={avg ? `12 weeks · dashed line is your average, ${vol(avg, units)}` : '12 weeks'}>
      <Pressable
        onPress={(e) => setSel(Math.min(last, Math.max(0, Math.floor(e.nativeEvent.locationX / slot))))}
        accessibilityLabel={`Weekly volume, last 12 weeks: ${weeks.map((x) => `${shortDate(x.weekStart)} ${vol(x.volume, units)}`).join(', ')}`}
      >
        <Svg width={w} height={H}>
          <Line x1={0} x2={w} y1={base} y2={base} stroke={colors.line} strokeWidth={1} />
          {weeks.map((x, i) =>
            x.volume > 0 ? (
              <Path
                key={x.weekStart}
                d={column(slot * i + (slot - bw) / 2, y(x.volume), bw, base)}
                fill={i === last ? colors.fitness : colors.fitnessSoft}
                opacity={sel !== null && sel !== i ? 0.55 : 1}
              />
            ) : null,
          )}
          {avg ? <Line x1={0} x2={w} y1={y(avg)} y2={y(avg)} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="4 4" /> : null}
          <SvgText x={fx} y={Math.max(12, y(weeks[focus].volume) - 7)} fontSize={14} fill={colors.text} textAnchor="middle" fontFamily={fonts.display}>
            {volShort(weeks[focus].volume, units)}
          </SvgText>
          <SvgText x={0} y={H - 4} fontSize={10} fill={colors.textFaint} fontFamily={fonts.regular}>
            {shortDate(weeks[0].weekStart)}
          </SvgText>
          <SvgText x={w} y={H - 4} fontSize={10} fill={colors.textFaint} textAnchor="end" fontFamily={fonts.regular}>
            This week
          </SvgText>
        </Svg>
      </Pressable>
      <Text style={styles.read}>
        {sel !== null
          ? `Week of ${shortDate(weeks[sel].weekStart)}: ${Math.round(toDisplay(weeks[sel].volume, units)).toLocaleString()} ${units} · ${weeks[sel].sets} sets`
          : 'Tap a bar to read that week'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  read: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: -space.xs },
});
