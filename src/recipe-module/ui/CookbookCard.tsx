import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { GlassSurface } from '@/theme/GlassSurface';
import { colors, fonts, space } from '@/theme/tokens';
import { UNCATEGORIZED_ID, type Cookbook } from '../db/cookbooks';
import { PressableScale } from './PressableScale';

const GAP = 2;

/** 2x2 collage of the cookbook's newest photos; missing tiles stay as soft placeholders. */
function Collage({ covers, size }: { covers: string[]; size: number }) {
  const tile = (size - GAP) / 2;
  return (
    <View style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap', gap: GAP, backgroundColor: colors.raised }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ width: tile, height: tile, backgroundColor: colors.surface }}>
          {covers[i] ? <Image source={{ uri: covers[i] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
        </View>
      ))}
    </View>
  );
}

export function CookbookCard({ book, width, index, onPress, onTogglePin }: {
  book: Cookbook;
  width: number;
  index: number;
  onPress: () => void;
  onTogglePin: () => void;
}) {
  const canPin = book.id !== UNCATEGORIZED_ID;
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 50).springify().damping(16)} style={{ width }}>
      <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={`${book.name}, ${book.count} recipes`}>
        <GlassSurface radius={26} strong>
          <View>
            <Collage covers={book.covers} size={width} />
            {canPin ? (
              <PressableScale
                onPress={onTogglePin}
                scaleTo={0.88}
                hitSlop={8}
                style={styles.pinWrap}
                accessibilityRole="button"
                accessibilityLabel={book.pinned ? 'Unpin cookbook' : 'Pin cookbook'}
              >
                <View style={[styles.pin, book.pinned && styles.pinOn]}>
                  <Ionicons name={book.pinned ? 'pin' : 'pin-outline'} size={18} color={book.pinned ? colors.onAccent : colors.text} />
                </View>
              </PressableScale>
            ) : null}
          </View>
          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={1}>
              {book.name}
            </Text>
            <Text style={styles.count}>{book.count === 1 ? '1 recipe' : `${book.count} recipes`}</Text>
          </View>
        </GlassSurface>
      </PressableScale>
    </Animated.View>
  );
}

/** Dashed tile at the end of the grid that opens the create sheet. */
export function NewCookbookCard({ width, onPress }: { width: number; onPress: () => void }) {
  return (
    <View style={{ width }}>
      <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel="New cookbook">
        <View style={[styles.newCard, { height: width * 0.78 }]}>
          <View style={styles.newIcon}>
            <Ionicons name="add" size={28} color={colors.accent} />
          </View>
          <Text style={styles.newText}>New cookbook</Text>
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  pinWrap: { position: 'absolute', top: 8, right: 8 },
  pin: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised },
  pinOn: { backgroundColor: colors.accent },
  body: { padding: space.md, gap: 2 },
  name: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text },
  count: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted },
  newCard: {
    borderRadius: 26,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.accentSoft,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  newIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  newText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accent },
});
