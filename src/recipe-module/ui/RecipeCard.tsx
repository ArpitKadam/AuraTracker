import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { GlassSurface } from '@/theme/GlassSurface';
import { colors, fonts, space } from '@/theme/tokens';
import type { Recipe } from '../db/recipes';
import { formatMinutes } from '../lib/format';
import { Chip, MacroChip } from './Chip';
import { PressableScale } from './PressableScale';

const GREEN = colors.success;

export function recipeMinutes(r: Recipe): number | null {
  if (r.totalMinutes) return r.totalMinutes;
  const sum = (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);
  return sum > 0 ? sum : null;
}

const open = (id: number) => router.push({ pathname: '/mybites/recipe/[id]', params: { id: String(id) } } as never);

function SourceBadge({ type }: { type: Recipe['sourceType'] }) {
  return (
    <View style={styles.badge}>
      <Ionicons name={type === 'instagram' ? 'logo-instagram' : 'image'} size={18} color={colors.instagram} />
    </View>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  const first = tags[0];
  return (
    <View style={styles.tags}>
      <Chip icon="leaf-outline" label={first.charAt(0).toUpperCase() + first.slice(1)} color={GREEN} border={GREEN} />
      {tags.length > 1 ? <Chip label={`+${tags.length - 1}`} /> : null}
    </View>
  );
}

export function RecipeCard({ recipe, variant, width, index, onLongPress }: {
  recipe: Recipe;
  variant: 'grid' | 'list';
  width?: number;
  index: number;
  onLongPress?: () => void;
}) {
  const minutes = recipeMinutes(recipe);
  const n = recipe.nutrition;
  const chips = (
    <View style={styles.chips}>
      {minutes ? <Chip icon="time-outline" label={formatMinutes(minutes)} /> : null}
      {n ? <MacroChip carbs={n.carbsG} fat={n.fatG} protein={n.proteinG} /> : null}
    </View>
  );
  const picture = recipe.thumbnailUri ? (
    <Image source={{ uri: recipe.thumbnailUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
  ) : (
    <View style={[StyleSheet.absoluteFill, styles.noPic]}>
      <Ionicons name="restaurant-outline" size={30} color={colors.textFaint} />
    </View>
  );

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 50).springify().damping(16)} style={width ? { width } : undefined}>
      <PressableScale onPress={() => open(recipe.id)} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={recipe.title}>
        <GlassSurface radius={26} strong>
          {variant === 'grid' ? (
            <>
              <View style={styles.gridPic}>
                {picture}
                <SourceBadge type={recipe.sourceType} />
              </View>
              <View style={styles.body}>
                <Text style={styles.title} numberOfLines={2}>
                  {recipe.title}
                </Text>
                {chips}
                <Tags tags={recipe.tags} />
              </View>
            </>
          ) : (
            <View style={styles.listRow}>
              <View style={styles.listPic}>
                {picture}
                <SourceBadge type={recipe.sourceType} />
              </View>
              <View style={[styles.body, { flex: 1 }]}>
                <Text style={styles.title} numberOfLines={2}>
                  {recipe.title}
                </Text>
                {chips}
                <Tags tags={recipe.tags} />
              </View>
            </View>
          )}
        </GlassSurface>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  gridPic: { height: 150, backgroundColor: colors.raised },
  listPic: { width: 112, alignSelf: 'stretch', minHeight: 112, backgroundColor: colors.raised },
  noPic: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.raised,
  },
  body: { padding: space.md, gap: 8 },
  title: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 21, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tags: { flexDirection: 'row', gap: 6 },
  listRow: { flexDirection: 'row' },
});
