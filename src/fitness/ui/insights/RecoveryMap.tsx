import { StyleSheet, Text, View } from 'react-native';
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter';

import type { Recovery } from '@/fitness/insights';
import { GROUPS, groupLabel } from '@/fitness/groups';
import { colors, fonts, insightColors as ic, radius, space } from '@/theme/tokens';

import { Card, clamp01 } from './shared';

const BAND = {
  fatigued: { color: colors.danger, word: 'Fatigued', intensity: 1 },
  recovering: { color: colors.star, word: 'Recovering', intensity: 2 },
  ready: { color: ic.readySoft, word: 'Ready', intensity: 3 },
} as const;
const FILL = [BAND.fatigued.color, BAND.recovering.color, BAND.ready.color];

const untilReady = (h: number) => (h <= 0 ? 'Ready now' : h < 24 ? `Ready in ~${Math.ceil(h)}h` : `Ready in ~${Math.round(h / 24)}d`);

/** Front + back body, each group shaded by its recovery zone. Untrained groups stay neutral. */
export function RecoveryMap({ recovery }: { recovery: Recovery[] }) {
  const data: ExtendedBodyPart[] = recovery
    .filter((r) => r.band !== 'ready' || r.fatigue > 0.05)
    .flatMap((r) => (GROUPS.find((g) => g.id === r.group)?.slugs ?? []).map((slug) => ({ slug: slug as Slug, intensity: BAND[r.band].intensity })));
  const sorted = [...recovery].sort((a, b) => b.fatigue - a.fatigue);
  const label = `Recovery: ${sorted.map((r) => `${groupLabel(r.group)} ${BAND[r.band].word.toLowerCase()}${r.band === 'ready' ? '' : `, ${untilReady(r.readyInHours).toLowerCase()}`}`).join('; ')}`;

  return (
    <Card title="Recovery" note="How rested each muscle group is, from your recent sets" label={label}>
      <View style={styles.bodies}>
        {(['front', 'back'] as const).map((side) => (
          <Body key={side} side={side} data={data} scale={0.5} colors={FILL} defaultFill={colors.line} border="none" />
        ))}
      </View>
      <View style={styles.list}>
        {sorted.map((r) => (
          <View key={r.group} style={styles.row}>
            <Text style={styles.name}>{groupLabel(r.group)}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(4, clamp01(r.fatigue) * 100)}%`, backgroundColor: r.band === 'ready' && r.fatigue <= 0.05 ? colors.textFaint : BAND[r.band].color }]} />
            </View>
            <Text style={[styles.when, r.band === 'ready' && styles.whenReady]}>{r.band === 'ready' ? 'Ready' : untilReady(r.readyInHours)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  bodies: { flexDirection: 'row', justifyContent: 'center', gap: space.sm },
  list: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { width: 72, fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  track: { flex: 1, height: 6, borderRadius: radius.chip, backgroundColor: colors.raised, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radius.chip },
  when: { width: 104, textAlign: 'right', fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  whenReady: { color: colors.success },
});
