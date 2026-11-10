import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSwitchButton } from '@/components/AppSwitchButton';
import { colors, fonts, space } from '@/theme/tokens';

// Placeholder until Task 5+ (onboarding, muscle picker).
export default function Fitness() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Fitness</Text>
        <AppSwitchButton />
      </View>
      <Text style={styles.body}>What are we working today? Coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base, paddingHorizontal: space.gutter },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg },
  title: { fontFamily: fonts.bold, fontSize: 28, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 16, color: colors.textMuted },
});
