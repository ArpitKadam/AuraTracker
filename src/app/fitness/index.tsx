import { Image } from 'expo-image';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CATALOG, MEDIA } from '@/assets/catalog';
import { AppSwitchButton } from '@/components/AppSwitchButton';
import { colors, fonts, radius, space } from '@/theme/tokens';

// Placeholder until Task 5+ (onboarding, muscle picker). Lists the bundled catalog so the build is checkable on device.
export default function Fitness() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Fitness</Text>
        <AppSwitchButton />
      </View>
      <Text style={styles.body}>{CATALOG.length} exercises in the catalog</Text>
      <FlatList
        data={CATALOG}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ gap: space.sm, paddingBottom: insets.bottom + space.xl }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Image source={MEDIA[item.media[0]]} style={styles.thumb} contentFit="cover" />
            <View style={styles.flex}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{`${item.groups.join(', ')} · ${item.equipment}`}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base, paddingHorizontal: space.gutter },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, backgroundColor: colors.surface, borderRadius: radius.card },
  thumb: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.raised },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
});
