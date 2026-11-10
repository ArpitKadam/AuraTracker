import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CookbookError, UNCATEGORIZED_ID, createCookbook, getRecipeCookbookIds, listCookbooks, setRecipeInCookbook, type Cookbook,
} from '@/recipe-module/db/cookbooks';
import { GlassSurface } from '@/theme/GlassSurface';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Sheet opened from a recipe: tick the cookbooks it belongs to, or make a new one on the spot. */
export default function CookbookPicker() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const rid = Number(recipeId);
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [books, setBooks] = useState<Cookbook[]>([]);
  const [inside, setInside] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [all, ids] = await Promise.all([listCookbooks(db), getRecipeCookbookIds(db, rid)]);
    setBooks(all.filter((b) => b.id !== UNCATEGORIZED_ID));
    setInside(new Set(ids));
  }, [db, rid]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (book: Cookbook) => {
    const on = !inside.has(book.id);
    // optimistic: flip the tick first, the write follows
    setInside((s) => {
      const next = new Set(s);
      if (on) next.add(book.id);
      else next.delete(book.id);
      return next;
    });
    setBooks((list) => list.map((b) => (b.id === book.id ? { ...b, count: b.count + (on ? 1 : -1) } : b)));
    await setRecipeInCookbook(db, rid, book.id, on);
  };

  const create = async () => {
    setError(null);
    try {
      const id = await createCookbook(db, name);
      await setRecipeInCookbook(db, rid, id, true);
      setName('');
      setAdding(false);
      await load();
    } catch (e) {
      setError(e instanceof CookbookError ? e.message : 'Could not create the cookbook');
    }
  };

  return (
    <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior="padding" pointerEvents="box-none">
        <GlassSurface strong radius={32} style={[styles.sheet, { marginBottom: Math.max(insets.bottom, space.lg) }]}>
          <View style={styles.head}>
            <Text style={styles.title}>Save to cookbooks</Text>
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Done">
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {books.length === 0 && !adding ? <Text style={styles.empty}>No cookbooks yet. Make your first one below.</Text> : null}
            {books.map((b) => {
              const on = inside.has(b.id);
              return (
                <Pressable key={b.id} onPress={() => toggle(b)} style={styles.row} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {b.name}
                    </Text>
                    <Text style={styles.rowCount}>{b.count === 1 ? '1 recipe' : `${b.count} recipes`}</Text>
                  </View>
                  <View style={[styles.check, on && styles.checkOn]}>{on ? <Ionicons name="checkmark" size={18} color="#fff" /> : null}</View>
                </Pressable>
              );
            })}
          </ScrollView>

          {adding ? (
            <View style={{ gap: space.sm }}>
              <TextInput
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  setError(null);
                }}
                placeholder="Cookbook name"
                placeholderTextColor={colors.textFaint}
                autoFocus
                maxLength={60}
                returnKeyType="done"
                onSubmitEditing={create}
                style={styles.input}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable onPress={create} disabled={!name.trim()} style={[styles.primary, !name.trim() && { opacity: 0.45 }]}>
                <Text style={styles.primaryText}>Create and add</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setAdding(true)} style={styles.newRow} accessibilityRole="button">
              <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
              <Text style={styles.newText}>New cookbook</Text>
            </Pressable>
          )}
        </GlassSurface>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(22,22,29,0.38)' },
  sheet: { marginHorizontal: space.gutter, padding: space.xl, gap: space.md, backgroundColor: 'rgba(246,243,255,0.97)' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  done: { fontFamily: fonts.semibold, fontSize: 16, color: colors.accent },
  empty: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted, paddingVertical: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.glassBorder },
  rowName: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text },
  rowCount: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.8)' },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 48 },
  newText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.accent },
  input: { height: 50, paddingHorizontal: space.lg, borderRadius: radius.button, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: colors.glassBorder, fontFamily: fonts.regular, fontSize: 16, color: colors.text },
  error: { fontFamily: fonts.regular, fontSize: 13, color: '#c0392b' },
  primary: { height: 50, borderRadius: radius.button, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fonts.semibold, fontSize: 16, color: '#fff' },
});
