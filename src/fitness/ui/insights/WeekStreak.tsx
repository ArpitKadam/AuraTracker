import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';

import type { Streak, WeekState } from '@/fitness/insights';
import { colors, fonts, insightColors as ic, radius, space } from '@/theme/tokens';

import { Card, useCardWidth } from './shared';

const SHOWN = 26;
const MAX_FREEZES = 2;

function Mark({ state, cx, cy, r }: { state: WeekState; cx: number; cy: number; r: number }) {
  if (state === 'on') return <Circle cx={cx} cy={cy} r={r} fill={colors.fitness} />;
  if (state === 'frozen')
    return (
      <G stroke={ic.freeze} strokeWidth={1.4} strokeLinecap="round">
        {[0, 60, 120].map((a) => {
          const [dx, dy] = [Math.cos((a * Math.PI) / 180) * r, Math.sin((a * Math.PI) / 180) * r];
          return <Line key={a} x1={cx - dx} y1={cy - dy} x2={cx + dx} y2={cy + dy} />;
        })}
      </G>
    );
  if (state === 'broke') return <Circle cx={cx} cy={cy} r={r - 0.75} fill="none" stroke={colors.danger} strokeWidth={1.5} />;
  if (state === 'open') return <Circle cx={cx} cy={cy} r={r - 0.75} fill="none" stroke={colors.textMuted} strokeWidth={1.5} strokeDasharray="2 2" />;
  return <Circle cx={cx} cy={cy} r={r - 0.75} fill="none" stroke={colors.line} strokeWidth={1.5} />;
}

const WORD: Record<WeekState, string> = { on: 'trained', frozen: 'freeze used', broke: 'streak broke', missed: 'off', open: 'this week, still open' };

/** Weeks in a row with at least one workout; a freeze covers a missed week (two banked at most). */
export function WeekStreak({ streak }: { streak: Streak }) {
  const w = useCardWidth();
  const weeks = streak.weeks.slice(-SHOWN);
  const step = w / SHOWN;
  const r = Math.min(5, step / 2 - 1.5);
  const label = `${streak.current} week streak, best ${streak.best}. ${streak.freezes} of ${MAX_FREEZES} freezes left. Recent weeks, oldest first: ${weeks.map((x) => WORD[x.state]).join(', ')}.`;

  return (
    <Card label={label}>
      <View style={styles.top}>
        <View style={styles.flame}>
          <Ionicons name="flame" size={28} color={ic.flame} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.big}>{`${streak.current} week streak`}</Text>
          <Text style={styles.sub}>{streak.current === streak.best && streak.best > 0 ? 'Your best run yet' : `Best ${streak.best} weeks`}</Text>
        </View>
        <View style={styles.freezes}>
          <View style={styles.snowRow}>
            {Array.from({ length: MAX_FREEZES }, (_, i) => (
              <Ionicons key={i} name="snow" size={16} color={i < streak.freezes ? ic.freeze : colors.line} />
            ))}
          </View>
          <Text style={styles.faint}>{`${streak.freezes}/${MAX_FREEZES} freezes`}</Text>
        </View>
      </View>
      <Svg width={w} height={14}>
        {weeks.map((x, i) => (
          <Mark key={x.weekStart} state={x.state} cx={step * i + step / 2} cy={7} r={r} />
        ))}
      </Svg>
      <View style={styles.badges}>
        {streak.badges.map((b) => (
          <View key={b.weeks} style={[styles.badge, b.earned && styles.badgeOn]}>
            {b.earned ? <Ionicons name="flame" size={11} color={colors.onAccent} /> : null}
            <Text style={[styles.badgeText, b.earned && styles.badgeTextOn]}>{`${b.weeks} wk`}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flame: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  big: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  freezes: { alignItems: 'flex-end', gap: 2 },
  snowRow: { flexDirection: 'row', gap: 2 },
  faint: { fontFamily: fonts.regular, fontSize: 11, color: colors.textFaint },
  badges: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.chip, backgroundColor: colors.raised },
  badgeOn: { backgroundColor: colors.fitness },
  badgeText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint },
  badgeTextOn: { color: colors.onAccent },
});
