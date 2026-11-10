import { StyleSheet, View } from 'react-native';
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter';

import { colors } from '@/theme/tokens';

import type { MuscleSlug } from '../catalog-types';

type Props = {
  /** Lit in the Fitness accent. */
  primary: MuscleSlug[];
  /** Lit in the dimmed accent (assisting muscles). */
  secondary?: MuscleSlug[];
  /** 1 = 200x400 per side. */
  scale?: number;
};

// Front and back side by side. intensity 1 -> colors[0], 2 -> colors[1].
export function BodyMap({ primary, secondary = [], scale = 0.6 }: Props) {
  const data: ExtendedBodyPart[] = [
    ...primary.map((slug) => ({ slug: slug as Slug, intensity: 1 })),
    ...secondary.filter((s) => !primary.includes(s)).map((slug) => ({ slug: slug as Slug, intensity: 2 })),
  ];
  return (
    <View style={styles.row} accessible accessibilityLabel={`Muscles highlighted: ${primary.join(', ') || 'none'}`}>
      {(['front', 'back'] as const).map((side) => (
        <Body
          key={side}
          side={side}
          data={data}
          scale={scale}
          colors={[colors.fitness, colors.fitnessSoft]}
          defaultFill={colors.line}
          border="none"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
});
