import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MAX_TAGS, type Journal, type Recipe } from '@/recipe-module/db/recipes';
import { GlassSurface } from '@/theme/GlassSurface';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** My rating, tags and note for a recipe. Saves go through onSave; the parent owns the data. */
export function RecipeJournal({ recipe, onSave }: { recipe: Recipe; onSave: (patch: Partial<Journal>) => void }) {
  const [note, setNote] = useState(recipe.note ?? '');
  const [tag, setTag] = useState('');
  useEffect(() => setNote(recipe.note ?? ''), [recipe.id, recipe.note]);

  // Autosave shortly after typing stops. Android's back button only hides the keyboard (no blur), so blur alone loses the note.
  useEffect(() => {
    if (note.trim() === (recipe.note ?? '')) return;
    const t = setTimeout(() => onSave({ note }), 500);
    return () => clearTimeout(t);
  }, [note, recipe.note, onSave]);

  const addTag = () => {
    if (tag.trim()) onSave({ tags: [...recipe.tags, tag] });
    setTag('');
  };

  return (
    <GlassSurface radius={28} strong style={styles.card}>
      <View style={styles.inner}>
        <View style={styles.row}>
          <Text style={styles.label}>My rating</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                hitSlop={4}
                // tapping the current rating clears it
                onPress={() => onSave(recipe.rating === n ? { rating: null } : { rating: n, cooked: true })}
                accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
              >
                <Ionicons name={recipe.rating !== null && n <= recipe.rating ? 'star' : 'star-outline'} size={28} color={colors.star} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.tags}>
          {recipe.tags.map((t) => (
            <Pressable key={t} onPress={() => onSave({ tags: recipe.tags.filter((x) => x !== t) })} style={styles.tag} accessibilityLabel={`Remove tag ${t}`}>
              <Text style={styles.tagText}>{t}</Text>
              <Ionicons name="close" size={14} color={colors.textMuted} />
            </Pressable>
          ))}
          {recipe.tags.length < MAX_TAGS ? (
            <TextInput
              value={tag}
              onChangeText={setTag}
              onSubmitEditing={addTag}
              onBlur={addTag}
              placeholder="+ tag"
              placeholderTextColor={colors.textFaint}
              maxLength={24}
              returnKeyType="done"
              style={styles.tagInput}
            />
          ) : null}
        </View>

        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Notes: what you changed, how it turned out"
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={1000}
          style={styles.note}
        />
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space.lg },
  inner: { padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  stars: { flexDirection: 'row', gap: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, height: 32, borderRadius: radius.chip, backgroundColor: colors.accentSoft },
  tagText: { fontFamily: fonts.medium, fontSize: 13, color: colors.accent },
  tagInput: { minWidth: 70, height: 32, paddingHorizontal: 11, paddingVertical: 0, borderRadius: radius.chip, borderWidth: 1, borderColor: colors.glassBorder, fontFamily: fonts.regular, fontSize: 13, color: colors.text },
  note: { minHeight: 76, padding: space.md, borderRadius: 18, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.glassBorder, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.text, textAlignVertical: 'top' },
});
