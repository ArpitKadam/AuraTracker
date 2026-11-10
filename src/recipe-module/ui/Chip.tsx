import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

/** Small outlined pill: optional icon plus text. */
export function Chip({ icon, label, color = colors.textMuted, border = colors.glassBorder }: {
  icon?: IconName;
  label: string;
  color?: string;
  border?: string;
}) {
  return (
    <View style={[styles.chip, { borderColor: border }]}>
      {icon ? <Ionicons name={icon} size={13} color={color} /> : null}
      <Text style={[styles.text, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const MACRO = { c: '#e0902b', f: '#8b5cf6', p: '#2f6fe0' } as const;

/** "C40 F– P40": carbs, fat, protein, each in its own colour. */
export function MacroChip({ carbs, fat, protein }: { carbs: number | null; fat: number | null; protein: number | null }) {
  const v = (n: number | null) => (n === null ? '–' : String(Math.round(n)));
  return (
    <View style={[styles.chip, { borderColor: colors.glassBorder }]}>
      <Text style={[styles.text, { color: MACRO.c }]}>C{v(carbs)}</Text>
      <Text style={[styles.text, { color: MACRO.f }]}>F{v(fat)}</Text>
      <Text style={[styles.text, { color: MACRO.p }]}>P{v(protein)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  text: { fontFamily: fonts.semibold, fontSize: 12 },
});
