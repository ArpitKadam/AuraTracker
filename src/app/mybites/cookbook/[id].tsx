import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCookbook, setCookbookPinned, setRecipeInCookbook, UNCATEGORIZED_ID, type Cookbook } from '@/recipe-module/db/cookbooks';
import { listRecipesInCookbook, type Recipe } from '@/recipe-module/db/recipes';
import { PressableScale } from '@/recipe-module/ui/PressableScale';
import { RecipeCard } from '@/recipe-module/ui/RecipeCard';
import { Background } from '@/theme/Background';
import { GlassSurface } from '@/theme/GlassSurface';
import { colors, fonts, space } from '@/theme/tokens';

const GAP = 12;

export default function CookbookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookId = Number(id);
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [book, setBook] = useState<Cookbook | null | undefined>(undefined);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const virtual = bookId === UNCATEGORIZED_ID;

  // Reload on focus: renaming, pinning or removing a recipe happens in sheets above this screen.
  useFocusEffect(
    useCallback(() => {
      getCookbook(db, bookId).then(setBook);
      listRecipesInCookbook(db, bookId).then(setRecipes);
    }, [db, bookId]),
  );

  const togglePin = async () => {
    if (!book) return;
    setBook({ ...book, pinned: !book.pinned });
    await setCookbookPinned(db, book.id, !book.pinned);
  };

  const removeFromBook = (r: Recipe) =>
    Alert.alert('Remove from this cookbook?', `"${r.title}" stays in All Recipes.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await setRecipeInCookbook(db, r.id, bookId, false);
          setRecipes((list) => list.filter((x) => x.id !== r.id));
          getCookbook(db, bookId).then(setBook);
        },
      },
    ]);

  const cardWidth = (width - space.gutter * 2 - GAP) / 2;

  return (
    <View style={styles.root}>
      <Background />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <PressableScale onPress={() => router.back()} accessibilityLabel="Back">
          <GlassSurface radius={23} strong style={styles.round}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </GlassSurface>
        </PressableScale>
        <View style={{ flex: 1 }} />
        {!virtual && book ? (
          <>
            <PressableScale onPress={togglePin} accessibilityLabel={book.pinned ? 'Unpin cookbook' : 'Pin cookbook'}>
              <GlassSurface radius={23} strong style={[styles.round, book.pinned && { backgroundColor: colors.accent }]}>
                <Ionicons name={book.pinned ? 'pin' : 'pin-outline'} size={20} color={book.pinned ? colors.onAccent : colors.text} />
              </GlassSurface>
            </PressableScale>
            <PressableScale
              onPress={() => router.push({ pathname: '/mybites/cookbook-form', params: { id: String(book.id) } } as never)}
              accessibilityLabel="Edit cookbook"
            >
              <GlassSurface radius={23} strong style={styles.round}>
                <Ionicons name="create-outline" size={21} color={colors.text} />
              </GlassSurface>
            </PressableScale>
          </>
        ) : null}
      </View>

      <FlatList
        data={recipes}
        numColumns={2}
        keyExtractor={(r) => String(r.id)}
        columnWrapperStyle={{ gap: GAP, alignItems: 'flex-start' }}
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: insets.bottom + 40, gap: GAP }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={2}>
              {book === undefined ? ' ' : book === null ? 'Cookbook not found' : book.name}
            </Text>
            {book ? <Text style={styles.sub}>{book.count === 1 ? '1 recipe' : `${book.count} recipes`}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          book ? (
            <View style={styles.empty}>
              <Ionicons name="book-outline" size={44} color={colors.textFaint} />
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyBody}>Open a recipe and tap Cookbooks to save it here.</Text>
            </View>
          ) : undefined
        }
        renderItem={({ item, index }) => (
          <RecipeCard
            recipe={item}
            variant="grid"
            width={cardWidth}
            index={index}
            onLongPress={virtual ? undefined : () => removeFromBook(item)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.gutter, paddingBottom: space.sm },
  round: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  header: { paddingTop: space.md, paddingBottom: space.lg, gap: 2 },
  title: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted },
  empty: { alignItems: 'center', gap: space.sm, paddingTop: 80 },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 20, color: colors.text },
  emptyBody: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted, textAlign: 'center', paddingHorizontal: space.xl },
});
