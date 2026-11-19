import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import type { CalendarDay } from '@/fitness/insights';
import { colors, fonts, insightColors as ic, space } from '@/theme/tokens';

import { arc, Card, clamp01, dayKey, useCardWidth } from './shared';

const HEAD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function MiniRing({ cx, cy, r, frac, hue, track }: { cx: number; cy: number; r: number; frac: number; hue: string; track: string }) {
  const f = clamp01(frac);
  return (
    <>
      <Circle cx={cx} cy={cy} r={r} stroke={track} strokeWidth={3} fill="none" />
      {f >= 0.999 ? (
        <Circle cx={cx} cy={cy} r={r} stroke={hue} strokeWidth={3} fill="none" />
      ) : f > 0 ? (
        <Path d={arc(cx, cy, r, 0, Math.max(f, 0.02))} stroke={hue} strokeWidth={3} fill="none" strokeLinecap="round" />
      ) : null}
    </>
  );
}

/** This month, Monday first. Each training day gets a double ring: outer = sets (of 20), inner = volume (of your biggest day). */
export function MonthCalendar({ days, now }: { days: CalendarDay[]; now: number }) {
  const w = useCardWidth();
  if (!days.length) return null;
  const [y, m] = days[0].date.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const cell = w / 7;
  const rows = Math.ceil((lead + days.length) / 7);
  const rowH = Math.min(cell, 46);
  const today = dayKey(new Date(now));
  const r = Math.min(cell, rowH) * 0.4;
  const trained = days.filter((d) => d.sets > 0);
  const label = `${first.toLocaleDateString(undefined, { month: 'long' })}: trained on ${trained.length} days${trained.length ? `, ${trained.map((d) => Number(d.date.slice(8))).join(', ')}` : ''}.`;

  return (
    <Card title={first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} label={label}>
      <View style={styles.head}>
        {HEAD.map((h, i) => (
          <Text key={i} style={[styles.headText, { width: cell }]}>
            {h}
          </Text>
        ))}
      </View>
      <Svg width={w} height={rows * rowH}>
        {days.map((d, i) => {
          const slot = lead + i;
          const cx = (slot % 7) * cell + cell / 2;
          const cy = Math.floor(slot / 7) * rowH + rowH / 2;
          const isToday = d.date === today;
          const future = d.date > today;
          return (
            <Fragment key={d.date}>
              {d.sets > 0 ? (
                <>
                  <MiniRing cx={cx} cy={cy} r={r} frac={d.setsFrac} hue={ic.ringSets[1]} track={ic.ringSetsTrack} />
                  <MiniRing cx={cx} cy={cy} r={r - 4} frac={d.volumeFrac} hue={ic.ringVolume[1]} track={ic.ringVolumeTrack} />
                </>
              ) : isToday ? (
                <Circle cx={cx} cy={cy} r={r} fill={colors.raised} />
              ) : null}
              <SvgText
                x={cx}
                y={cy + 3.5}
                fontSize={10}
                textAnchor="middle"
                fill={isToday ? colors.text : d.sets > 0 ? colors.text : future ? colors.textFaint : colors.textMuted}
                fontFamily={isToday ? fonts.bold : fonts.regular}
                opacity={future ? 0.5 : 1}
              >
                {Number(d.date.slice(8))}
              </SvgText>
            </Fragment>
          );
        })}
      </Svg>
      <View style={styles.legend}>
        <View style={[styles.key, { backgroundColor: ic.ringSets[1] }]} />
        <Text style={styles.legendText}>Sets (ring full at 20)</Text>
        <View style={[styles.key, { backgroundColor: ic.ringVolume[1] }]} />
        <Text style={styles.legendText}>Volume (vs your biggest day)</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', marginBottom: -space.xs },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  key: { width: 10, height: 4, borderRadius: 2 },
  legendText: { fontFamily: fonts.regular, fontSize: 11, color: colors.textFaint, marginRight: space.sm },
  headText: { textAlign: 'center', fontFamily: fonts.medium, fontSize: 11, color: colors.textFaint },
});
