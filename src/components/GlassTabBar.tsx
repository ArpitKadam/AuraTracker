import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/theme/GlassSurface';
import { colors, fonts, radius, space, TAB_BAR_HEIGHT } from '@/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

const TABS: { path: string; label: string; icon: IconName; active: IconName }[] = [
  { path: '/mybites/recipes', label: 'Recipes', icon: 'bookmark-outline', active: 'bookmark' },
  { path: '/mybites/plan', label: 'Plan', icon: 'calendar-outline', active: 'calendar' },
  { path: '/mybites/profile', label: 'Profile', icon: 'person-outline', active: 'person' },
];

export function GlassTabBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.wrap, { bottom: Math.max(insets.bottom, space.md) }]}
      pointerEvents="box-none"
    >
      <GlassSurface blur strong radius={radius.tabBar} style={styles.bar}>
        <View style={styles.row}>
          {TABS.map((t) => {
            const on = pathname.startsWith(t.path);
            return (
              <Pressable
                key={t.path}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => router.navigate(t.path as never)}
                style={styles.item}
              >
                <View style={[styles.pill, on && styles.pillOn]}>
                  <Ionicons name={on ? t.active : t.icon} size={24} color={on ? colors.accent : colors.textMuted} />
                  <Text numberOfLines={1} style={[styles.label, on && styles.labelOn]}>{t.label}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.gutter, right: space.gutter },
  bar: { height: TAB_BAR_HEIGHT },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pill: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 26, overflow: 'hidden', alignSelf: 'stretch' },
  pillOn: { backgroundColor: colors.accentSoft },
  label: { fontFamily: fonts.medium, fontSize: 10.5, color: colors.textMuted, marginTop: 2 },
  labelOn: { color: colors.accent, fontFamily: fonts.semibold },
});
