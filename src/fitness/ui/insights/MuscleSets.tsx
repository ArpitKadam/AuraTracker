import { StyleSheet, Text, View } from 'react-native';

import type { MuscleSets as Row } from '@/fitness/insights';
import { groupLabel } from '@/fitness/groups';
import { colors, fonts, insightColors as ic, radius, space } from '@/theme/tokens';

import { Card } from './shared';

const FILL = { below: colors.textFaint, in: colors.fitness, above: ic.above } as const;
const WORD = { below: 'room to add', in: 'in range', above: 'above range' } as const;

/** Working sets per group this week against an evidence-based [lo, hi] weekly range. */
export function MuscleSets({ rows }: { rows: Row[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.sets, r.hi * 1.25)));
  const room = rows.filter((r) => r.status === 'below').sort((a, b) => b.lo - b.sets - (a.lo - a.sets))[0];
  const above = rows.filter((r) => r.status === 'above');
  const pct = (v: number) => `${(Math.min(v, max) / max) * 100}%` as const;
  const label = `Weekly sets per muscle: ${rows.map((r) => `${groupLabel(r.group)} ${r.sets} sets, target ${r.lo} to ${r.hi}, ${WORD[r.status]}`).join('; ')}`;

  return (
    <Card
      title="Weekly sets per muscle"
      note={
        room
          ? `Most room: ${groupLabel(room.group)}, ${room.sets} of ${room.lo}–${room.hi} sets`
          : above.length
            ? `Nothing below range. Above: ${above.map((r) => groupLabel(r.group)).join(', ')}`
            : 'Every group is in its range this week'
      }
      label={label}
    >
      {rows.map((r) => (
        <View key={r.group} style={styles.row}>
          <Text style={styles.name}>{groupLabel(r.group)}</Text>
          <View style={styles.track}>
            <View style={[styles.band, { left: pct(r.lo), width: pct(r.hi - r.lo) }]} />
            {r.sets > 0 ? <View style={[styles.fill, { width: pct(r.sets), backgroundColor: FILL[r.status] }]} /> : null}
          </View>
          <Text style={styles.value} numberOfLines={1}>
            {r.sets}
          </Text>
        </View>
      ))}
      <View style={styles.key}>
        <View style={styles.keyBand} />
        <Text style={styles.keyText}>Target range</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { width: 72, fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  track: { flex: 1, height: 14, justifyContent: 'center' },
  band: { position: 'absolute', top: 0, bottom: 0, backgroundColor: ic.fitnessBand, borderRadius: 4 },
  fill: { height: 6, borderRadius: radius.chip },
  value: { width: 44, textAlign: 'right', fontFamily: fonts.display, fontSize: 18, color: colors.text },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyBand: { width: 18, height: 10, borderRadius: 3, backgroundColor: ic.fitnessBand },
  keyText: { fontFamily: fonts.regular, fontSize: 11, color: colors.textFaint },
});
