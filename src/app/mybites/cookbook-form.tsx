import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CookbookError, createCookbook, deleteCookbook, getCookbook, renameCookbook } from '@/recipe-module/db/cookbooks';
import { GlassSurface } from '@/theme/GlassSurface';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Sheet for creating a cookbook, or renaming / deleting an existing one (`?id=`). */
export default function CookbookForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id ? Number(id) : null;
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editId !== null) getCookbook(db, editId).then((c) => c && setName(c.name));
  }, [db, editId]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (editId === null) await createCookbook(db, name);
      else await renameCookbook(db, editId, name);
      router.back();
    } catch (e) {
      setError(e instanceof CookbookError ? e.message : 'Could not save the cookbook');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Delete this cookbook?', 'The recipes stay in All Recipes.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteCookbook(db, editId!);
          router.dismissTo('/mybites/recipes');
        },
      },
    ]);

  return (
    <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior="padding" pointerEvents="box-none">
        <GlassSurface strong radius={32} style={[styles.sheet, { marginBottom: Math.max(insets.bottom, space.lg) }]}>
          <View style={styles.head}>
            <Text style={styles.title}>{editId === null ? 'New cookbook' : 'Rename cookbook'}</Text>
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={26} color={colors.textMuted} />
            </Pressable>
          </View>
          <TextInput
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError(null);
            }}
            placeholder="e.g. Weeknight dinners"
            placeholderTextColor={colors.textFaint}
            autoFocus
            maxLength={60}
            returnKeyType="done"
            onSubmitEditing={save}
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable onPress={save} disabled={busy || !name.trim()} style={[styles.primary, (busy || !name.trim()) && styles.off]} accessibilityRole="button">
            <Text style={styles.primaryText}>{editId === null ? 'Create' : 'Save'}</Text>
          </Pressable>
          {editId !== null ? (
            <Pressable onPress={confirmDelete} style={styles.danger} accessibilityRole="button">
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={styles.dangerText}>Delete cookbook</Text>
            </Pressable>
          ) : null}
        </GlassSurface>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  sheet: { marginHorizontal: space.gutter, padding: space.xl, gap: space.md, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  input: {
    height: 52,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  error: { fontFamily: fonts.regular, fontSize: 13, color: colors.danger },
  primary: { height: 52, borderRadius: radius.button, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onAccent },
  off: { opacity: 0.45 },
  danger: { height: 48, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  dangerText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.danger },
});
