import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type AppId, getRemember, openApp, setRemember, startupTarget } from '@/launcher';
import { colors, fonts, radius, space } from '@/theme/tokens';

// ponytail: functional launcher only; visual design lands with the Figma pass (Task 2/3).
const APPS: { id: AppId; title: string; blurb: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'fitness', title: 'Fitness', blurb: 'Log sets, beat last session', icon: 'barbell-outline' },
  { id: 'mybites', title: 'MyBites', blurb: 'Recipes and meal plans', icon: 'restaurant-outline' },
];

export default function Launcher() {
  const insets = useSafeAreaInsets();
  const [remember, setRememberState] = useState(getRemember);
  const target = startupTarget();

  if (target) return <Redirect href={target === 'fitness' ? '/fitness' : '/mybites'} />;

  const toggle = (on: boolean) => {
    setRemember(on);
    setRememberState(on);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }]}>
      <Text style={styles.title}>AuraTracker</Text>
      <View style={styles.cards}>
        {APPS.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => openApp(a.id)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Open ${a.title}`}
          >
            <Ionicons name={a.icon} size={32} color={colors.text} />
            <Text style={styles.cardTitle}>{a.title}</Text>
            <Text style={styles.cardBlurb}>{a.blurb}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.remember}>
        <Text style={styles.rememberText}>Remember my choice</Text>
        <Switch value={remember} onValueChange={toggle} accessibilityLabel="Remember my choice" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base, paddingHorizontal: space.gutter },
  title: { fontFamily: fonts.bold, fontSize: 28, color: colors.text, marginBottom: space.xl },
  cards: { flex: 1, gap: space.lg },
  card: {
    flex: 1,
    borderRadius: radius.card,
    backgroundColor: colors.glassFillStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    padding: space.xl,
    justifyContent: 'flex-end',
    gap: space.sm,
  },
  pressed: { opacity: 0.8 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 26, color: colors.text },
  cardBlurb: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted },
  remember: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl },
  rememberText: { fontFamily: fonts.medium, fontSize: 16, color: colors.text },
});
