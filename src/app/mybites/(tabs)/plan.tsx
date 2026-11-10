import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSwitchButton } from '@/components/AppSwitchButton';
import { listMeals, removeMeal, SLOT_LABEL, SLOTS, type PlannedMeal, type Slot } from '@/recipe-module/db/mealplan';
import { addDays, dayName, dayNumber, monthDay, toISODate, weekStart } from '@/recipe-module/lib/dates';
import { GlassSurface } from '@/theme/GlassSurface';
import { colors, fonts, space, TAB_BAR_HEIGHT } from '@/theme/tokens';

const SLOT_ICON: Record<Slot, keyof typeof Ionicons.glyphMap> = {
  breakfast: 'sunny-outline',
  lunch: 'restaurant-outline',
  dinner: 'moon-outline',
  snack: 'cafe-outline',
};

export default function Plan() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const today = toISODate(new Date());
  const [monday, setMonday] = useState(weekStart(today));
  const [day, setDay] = useState(today);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);

  // Reload on focus and on week change: meals are added from sheets and recipe screens above this tab.
  useFocusEffect(
    useCallback(() => {
      listMeals(db, monday, addDays(monday, 6)).then(setMeals);
    }, [db, monday]),
  );

  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const shiftWeek = (n: number) => {
    const next = addDays(monday, n * 7);
    setMonday(next);
    setDay(next <= today && today <= addDays(next, 6) ? today : next);
  };
  const remove = async (m: PlannedMeal) => {
    setMeals((list) => list.filter((x) => x.id !== m.id));
    await removeMeal(db, m.id);
  };
  const countOn = (d: string) => meals.filter((m) => m.date === d).length;

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.lg }]}>
      <View style={styles.pad}>
        <View style={styles.titleRow}>
          <Text style={styles.heading}>Meal plan</Text>
          <AppSwitchButton />
        </View>
        <View style={styles.weekNav}>
          <Pressable onPress={() => shiftWeek(-1)} hitSlop={10} accessibilityLabel="Previous week">
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.weekLabel}>
            {monthDay(monday)} – {monthDay(addDays(monday, 6))}
          </Text>
          <Pressable onPress={() => shiftWeek(1)} hitSlop={10} accessibilityLabel="Next week">
            <Ionicons name="chevron-forward" size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.strip}>
          {week.map((d) => (
            <Pressable key={d} onPress={() => setDay(d)} style={[styles.day, d === day && styles.dayOn]} accessibilityLabel={monthDay(d)}>
              <Text style={[styles.dayName, d === day && styles.onText]}>{dayName(d)}</Text>
              <Text style={[styles.dayNum, d === day && styles.onText]}>{dayNumber(d)}</Text>
              <View style={[styles.dot, countOn(d) > 0 && { backgroundColor: d === day ? colors.onAccent : colors.accent }]} />
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + TAB_BAR_HEIGHT + space.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.dayTitle}>
          {day === today ? 'Today' : dayName(day)}, {monthDay(day)}
        </Text>
        {SLOTS.map((s) => {
          const here = meals.filter((m) => m.date === day && m.slot === s);
          return (
            <GlassSurface key={s} radius={26} strong>
              <View style={styles.slotInner}>
                <View style={styles.slotHead}>
                  <Ionicons name={SLOT_ICON[s]} size={18} color={colors.accent} />
                  <Text style={styles.slotName}>{SLOT_LABEL[s]}</Text>
                  <View style={{ flex: 1 }} />
                  <Pressable
                    onPress={() => router.push({ pathname: '/mybites/meal-add', params: { date: day, slot: s } } as never)}
                    hitSlop={10}
                    accessibilityLabel={`Add to ${SLOT_LABEL[s]}`}
                  >
                    <Ionicons name="add-circle" size={30} color={colors.accent} />
                  </Pressable>
                </View>
                {here.map((m) => (
                  <View key={m.id} style={styles.meal}>
                    <Pressable onPress={() => router.push(`/mybites/recipe/${m.recipeId}` as never)} style={styles.mealMain}>
                      {m.thumbnailUri ? (
                        <Image source={{ uri: m.thumbnailUri }} style={styles.thumb} contentFit="cover" />
                      ) : (
                        <View style={[styles.thumb, styles.thumbEmpty]}>
                          <Ionicons name="restaurant-outline" size={18} color={colors.textFaint} />
                        </View>
                      )}
                      <Text style={styles.mealTitle} numberOfLines={2}>
                        {m.title}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => remove(m)} hitSlop={10} accessibilityLabel={`Remove ${m.title}`}>
                      <Ionicons name="close-circle-outline" size={24} color={colors.textFaint} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </GlassSurface>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { paddingHorizontal: space.gutter, gap: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontFamily: fonts.bold, fontSize: 30, color: colors.text },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekLabel: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  strip: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.glassBorder },
  dayOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayName: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  dayNum: { fontFamily: fonts.bold, fontSize: 19, color: colors.text },
  onText: { color: colors.onAccent },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  list: { paddingHorizontal: space.gutter, paddingTop: space.lg, gap: space.md },
  dayTitle: { fontFamily: fonts.semibold, fontSize: 17, color: colors.textMuted },
  slotInner: { padding: space.lg, gap: space.sm },
  slotHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  slotName: { fontFamily: fonts.bold, fontSize: 17, color: colors.text },
  meal: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  mealMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  thumb: { width: 52, height: 52, borderRadius: 16 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised },
  mealTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
});
