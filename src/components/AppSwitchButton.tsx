import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { openLauncher } from '@/launcher';
import { GlassSurface } from '@/theme/GlassSurface';
import { colors, radius } from '@/theme/tokens';

export function AppSwitchButton() {
  return (
    <Pressable onPress={openLauncher} hitSlop={8} accessibilityRole="button" accessibilityLabel="Switch app">
      <GlassSurface radius={radius.button} style={styles.round}>
        <Ionicons name="apps-outline" size={20} color={colors.text} />
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  round: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
