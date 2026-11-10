import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addMeal, SLOT_LABEL, SLOTS, type Slot } from '@/recipe-module/db/mealplan';
import { listRecipes, type Recipe } from '@/recipe-module/db/recipes';
import { addDays, dayName, dayNumber, monthDay, toISODate } from '@/recipe-module/lib/dates';
import { GlassSurface } from '@/theme/GlassSurface';
import { colors, fonts, radius, space } from '@/theme/tokens';

const DAYS_SHOWN = 21;

/**
 * Sheet for the meal plan. From a recipe (recipeId given): pick a day and a meal, then add.
 * From the plan (date and slot given): pick the recipe and it is added straight away.
 */
export default function MealAdd() {
  const p = useLocalSearchParams<{ recipeId?: string; date?: string; slot?: Slot }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const today = toISODate(new Date());
  const [date, setDate] = useState(p.date ?? today);
  const [slot, setSlot] = useState<Slot>(p.slot && SLOTS.includes(p.slot) ? p.slot : 'dinner');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const fixedRecipe = p.recipeId ? Number(p.recipeId) : null;

  useEffect(() => {
    if (fixedRecipe === null) listRecipes(db).then(setRecipes);
  }, [db, fixedRecipe]);

  // the strip starts today, or earlier when the plan opened this on a past day
  const startDay = p.date && p.date < today ? p.date : today;
  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(startDay, i)), [startDay]);

  const add = async (recipeId: number) => {
    const added = await addMeal(db, date, slot, recipeId);
    if (added) router.back();
    else setNote(`Already in ${SLOT_LABEL[slot].toLowerCase()} on ${monthDay(date)}`);
  };

  return (
    <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} accessibilityLabel="Close" />
      <GlassSurface strong radius={32} style={[styles.sheet, { marginBottom: Math.max(insets.bottom, space.lg) }]}>
        <View style={styles.head}>
          <Text style={styles.title}>Add to meal plan</Text>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Cancel">
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {days.map((d) => (
            <Pressable
              key={d}
              onPress={() => {
                setDate(d);
                setNote(null);
              }}
              style={[styles.day, d === date && styles.dayOn]}
              accessibilityLabel={monthDay(d)}
            >
              <Text style={[styles.dayName, d === date && styles.onText]}>{d === today ? 'Today' : dayName(d)}</Text>
              <Text style={[styles.dayNum, d === date && styles.onText]}>{dayNumber(d)}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.slots}>
          {SLOTS.map((s) => (
            <Pressable
              key={s}
              onPress={() => {
                setSlot(s);
                setNote(null);
              }}
              style={[styles.slot, s === slot && styles.slotOn]}
            >
              <Text style={[styles.slotText, s === slot && styles.slotTextOn]}>{SLOT_LABEL[s]}</Text>
            </Pressable>
          ))}
        </View>

        {note ? <Text style={styles.note}>{note}</Text> : null}

        {fixedRecipe !== null ? (
          <Pressable onPress={() => add(fixedRecipe)} style={styles.primary}>
            <Text style={styles.primaryText}>
              Add to {SLOT_LABEL[slot].toLowerCase()}, {monthDay(date)}
            </Text>
          </Pressable>
        ) : (
          <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
            {recipes.length === 0 ? <Text style={styles.empty}>No saved recipes yet.</Text> : null}
            {recipes.map((r) => (
              <Pressable key={r.id} onPress={() => add(r.id)} style={styles.row}>
                {r.thumbnailUri ? (
                  <Image source={{ uri: r.thumbnailUri }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Ionicons name="restaurant-outline" size={18} color={colors.textFaint} />
                  </View>
                )}
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {r.title}
                </Text>
                <Ionicons name="add-circle-outline" size={24} color={colors.accent} />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(22,22,29,0.38)' },
  sheet: { marginHorizontal: space.gutter, padding: space.xl, gap: space.md, backgroundColor: 'rgba(246,243,255,0.97)' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  link: { fontFamily: fonts.semibold, fontSize: 16, color: colors.accent },
  strip: { gap: space.sm, paddingVertical: 2 },
  day: { width: 58, height: 66, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: colors.glassBorder },
  dayOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayName: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  dayNum: { fontFamily: fonts.bold, fontSize: 20, color: colors.text },
  onText: { color: '#fff' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  slot: { paddingHorizontal: 14, height: 38, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: colors.glassBorder },
  slotOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  slotText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textMuted },
  slotTextOn: { color: colors.accent },
  note: { fontFamily: fonts.regular, fontSize: 13, color: '#c0392b' },
  primary: { height: 52, borderRadius: radius.button, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fonts.semibold, fontSize: 16, color: '#fff' },
  empty: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted, paddingVertical: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.glassBorder },
  thumb: { width: 48, height: 48, borderRadius: 14 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.8)' },
  rowTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
});
