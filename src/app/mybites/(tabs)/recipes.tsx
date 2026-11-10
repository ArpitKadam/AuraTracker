import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSwitchButton } from '@/components/AppSwitchButton';
import { listCookbooks, setCookbookPinned, type Cookbook } from '@/recipe-module/db/cookbooks';
import { listRecipes, type Recipe } from '@/recipe-module/db/recipes';
import { CookbookCard, NewCookbookCard } from '@/recipe-module/ui/CookbookCard';
import { RecipeCard, recipeMinutes } from '@/recipe-module/ui/RecipeCard';
import { GlassSurface } from '@/theme/GlassSurface';
import { colors, fonts, radius, space, TAB_BAR_HEIGHT } from '@/theme/tokens';

type Segment = 'cookbooks' | 'all';
type Sort = 'newest' | 'az' | 'fastest';
const SORTS: Sort[] = ['newest', 'az', 'fastest'];
const SORT_LABEL: Record<Sort, string> = { newest: 'Newest', az: 'A–Z', fastest: 'Fastest' };
const GAP = 12;

function sortRecipes(list: Recipe[], sort: Sort): Recipe[] {
  const out = [...list];
  if (sort === 'az') out.sort((a, b) => a.title.localeCompare(b.title));
  // Recipes without a time sort last.
  if (sort === 'fastest') out.sort((a, b) => (recipeMinutes(a) ?? Infinity) - (recipeMinutes(b) ?? Infinity));
  return out; // 'newest' is the query order
}

export default function Recipes() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const [segment, setSegment] = useState<Segment>('all');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [grid, setGrid] = useState(true);
  const [books, setBooks] = useState<Cookbook[]>([]);

  // Reload whenever the tab regains focus, so a finished import or a cookbook change shows up.
  useFocusEffect(
    useCallback(() => {
      listRecipes(db).then(setRecipes);
      listCookbooks(db).then(setBooks);
    }, [db]),
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? recipes.filter((r) => r.title.toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q))) : recipes;
    return sortRecipes(filtered, sort);
  }, [recipes, query, sort]);

  // The dashed "New cookbook" tile ends the grid, except while a search is filtering it.
  const bookItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: (Cookbook | 'new')[] = q ? books.filter((b) => b.name.toLowerCase().includes(q)) : [...books];
    if (!q) list.push('new');
    return list;
  }, [books, query]);

  const togglePin = async (b: Cookbook) => {
    await setCookbookPinned(db, b.id, !b.pinned);
    listCookbooks(db).then(setBooks);
  };

  const cardWidth = (width - space.gutter * 2 - GAP) / 2;

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
      <View style={styles.header}>
        <Text style={styles.logo}>MyBites</Text>
        <AppSwitchButton />
        <GlassSurface radius={radius.button} style={styles.round}>
          <Ionicons name="notifications-outline" size={22} color={colors.text} />
        </GlassSurface>
        <GlassSurface radius={radius.button} style={styles.round}>
          <Ionicons name="person" size={24} color={colors.textFaint} />
        </GlassSurface>
      </View>

      <View style={styles.segments}>
        {(['cookbooks', 'all'] as const).map((s) => (
          <Pressable key={s} onPress={() => setSegment(s)} style={[styles.segment, segment === s && styles.segmentOn]}>
            <Text style={[styles.segmentText, segment === s && styles.segmentTextOn]}>
              {s === 'cookbooks' ? 'Cookbooks' : 'All Recipes'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.tools}>
        <GlassSurface radius={radius.button} style={styles.search}>
          <Ionicons name="search" size={20} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={segment === 'all' ? 'Search recipes' : 'Search cookbooks'}
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
          />
        </GlassSurface>
        {segment === 'all' ? (
        <GlassSurface radius={radius.button} style={styles.pill}>
          <Pressable
            onPress={() => setSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length])}
            style={styles.pillBtn}
            accessibilityLabel={`Sort: ${SORT_LABEL[sort]}`}
          >
            <Ionicons name="swap-vertical" size={20} color={colors.text} />
            <Text style={styles.sortText}>{SORT_LABEL[sort]}</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            onPress={() => setGrid((g) => !g)}
            style={styles.pillBtn}
            accessibilityLabel={grid ? 'Switch to list view' : 'Switch to grid view'}
          >
            <Ionicons name={grid ? 'list' : 'grid-outline'} size={20} color={colors.text} />
          </Pressable>
        </GlassSurface>
        ) : null}
      </View>

      {segment === 'cookbooks' ? (
        <FlatList
          key="books"
          data={bookItems}
          numColumns={2}
          keyExtractor={(b) => (b === 'new' ? 'new' : String(b.id))}
          columnWrapperStyle={{ gap: GAP, alignItems: 'flex-start' }}
          contentContainerStyle={{ paddingTop: space.md, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 130, gap: GAP }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) =>
            item === 'new' ? (
              <NewCookbookCard width={cardWidth} onPress={() => router.push('/mybites/cookbook-form' as never)} />
            ) : (
              <CookbookCard
                book={item}
                width={cardWidth}
                index={index}
                onPress={() => router.push({ pathname: '/mybites/cookbook/[id]', params: { id: String(item.id) } } as never)}
                onTogglePin={() => togglePin(item)}
              />
            )
          }
        />
      ) : shown.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="restaurant-outline" size={44} color={colors.textFaint} />
          <Text style={styles.emptyTitle}>{recipes.length === 0 ? 'No recipes yet' : 'No matches'}</Text>
          {recipes.length === 0 ? (
            <Text style={styles.emptyBody}>Import a reel link or a screenshot to get started.</Text>
          ) : null}
        </View>
      ) : (
        <FlatList
          // numColumns cannot change on a mounted list, so the key remounts it on toggle
          key={grid ? 'grid' : 'list'}
          data={shown}
          numColumns={grid ? 2 : 1}
          keyExtractor={(r) => String(r.id)}
          columnWrapperStyle={grid ? { gap: GAP, alignItems: 'flex-start' } : undefined}
          contentContainerStyle={{ paddingTop: space.md, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 130, gap: GAP }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <RecipeCard recipe={item} variant={grid ? 'grid' : 'list'} width={grid ? cardWidth : undefined} index={index} />
          )}
        />
      )}

      <GlassSurface blur strong radius={radius.button} style={[styles.fab, { bottom: insets.bottom + TAB_BAR_HEIGHT + space.xl }]}>
        <Pressable style={styles.fabPress} accessibilityLabel="Import recipe" onPress={() => router.push('/mybites/import')}>
          <Ionicons name="add" size={32} color={colors.accent} />
        </Pressable>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.gutter },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg },
  logo: { flex: 1, fontFamily: fonts.boldItalic, fontSize: 30, color: colors.accent },
  round: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  segments: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  segment: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 18 },
  segmentOn: { backgroundColor: colors.accentSoft },
  segmentText: { fontFamily: fonts.medium, fontSize: 17, color: colors.textMuted },
  segmentTextOn: { color: colors.accent },
  tools: { flexDirection: 'row', gap: space.sm },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, height: 52 },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.text, padding: 0 },
  pill: { flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: 4 },
  pillBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 52, paddingHorizontal: 10 },
  sortText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  divider: { width: 1, height: 22, backgroundColor: colors.glassBorder },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 20, color: colors.text },
  emptyBody: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted },
  fab: { position: 'absolute', alignSelf: 'center', width: 68, height: 68 },
  fabPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
