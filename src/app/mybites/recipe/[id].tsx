import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { File } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { getRecipeCookbookIds } from '@/recipe-module/db/cookbooks';
import {
  cleanTags, deleteRecipe, getRecipe, updateJournal, updateRecipeNutrition, updateRecipeSteps, type Journal, type Recipe,
} from '@/recipe-module/db/recipes';
import { recipeContext } from '@/recipe-module/chat/logic';
import { addStepEmojis, estimateNutrition } from '@/recipe-module/extraction/gemini';
import { canEstimate, mergeEstimate } from '@/recipe-module/extraction/nutrition';
import { DEFAULT_MODEL, getGeminiKey } from '@/recipe-module/extraction/key';
import type { Nutrition as NutritionType, NutritionKey, Step as StepType } from '@/recipe-module/extraction/types';
import { formatMinutes, formatQuantity, showIngredient, type UnitSystem } from '@/recipe-module/lib/format';
import { highlightSteps } from '@/recipe-module/lib/highlight';
import { Chip } from '@/recipe-module/ui/Chip';
import { IngredientIcon } from '@/recipe-module/ui/IngredientIcon';
import { PressableScale } from '@/recipe-module/ui/PressableScale';
import { RecipeJournal } from '@/recipe-module/ui/RecipeJournal';
import { GlassSurface } from '@/theme/GlassSurface';
import { colors, fonts, radius, space } from '@/theme/tokens';

const HERO_H = 400;
const SHEET_RADIUS = 36;
type Tab = 'ingredients' | 'steps' | 'nutrition';
const TABS: { id: Tab; label: string }[] = [
  { id: 'ingredients', label: 'Ingredients' },
  { id: 'steps', label: 'Steps' },
  { id: 'nutrition', label: 'Nutrition' },
];
const SYSTEMS: UnitSystem[] = ['original', 'metric', 'us'];
const SYSTEM_LABEL: Record<UnitSystem, string> = { original: 'Convert', metric: 'Metric', us: 'US' };

export default function RecipeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('ingredients');
  const [servings, setServings] = useState(1);
  const [system, setSystem] = useState<UnitSystem>('original');
  const [inCookbooks, setInCookbooks] = useState(false);

  useEffect(() => {
    getRecipe(db, Number(id)).then((r) => {
      setRecipe(r);
      if (r) setServings(Math.max(1, Math.round(r.servings ?? 1)));
    });
  }, [db, id]);

  // The picker sheet changes membership above this screen, so re-read it whenever the screen is focused again.
  useFocusEffect(
    useCallback(() => {
      getRecipeCookbookIds(db, Number(id)).then((ids) => setInCookbooks(ids.length > 0));
    }, [db, id]),
  );

  // Recipes saved before step emojis existed get them once, in the background; failures just retry next open.
  const backfilling = useRef(false);
  useEffect(() => {
    if (!recipe || backfilling.current) return;
    if (recipe.steps.length === 0 || recipe.steps.every((st) => st.emoji)) return;
    backfilling.current = true;
    (async () => {
      try {
        const apiKey = await getGeminiKey();
        if (!apiKey) return;
        const steps = await addStepEmojis({ apiKey, model: DEFAULT_MODEL }, recipe.steps);
        await updateRecipeSteps(db, recipe.id, steps);
        setRecipe((prev) => (prev ? { ...prev, steps } : prev));
      } catch {
        // keep the plain steps; try again next time the recipe opens
      }
    })();
  }, [recipe, db]);

  const scrollY = useSharedValue(0);
  const overSheet = useSharedValue(false);
  const [lightBar, setLightBar] = useState(false);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
    // Once the sheet reaches the top, the status bar sits on a light header: switch its icons to dark.
    const past = e.contentOffset.y > HERO_H - 110;
    if (past !== overSheet.value) {
      overSheet.value = past;
      scheduleOnRN(setLightBar, past);
    }
  });
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [HERO_H - 170, HERO_H - 100], [0, 1], Extrapolation.CLAMP),
  }));
  // Hero rises at half the scroll speed, and zooms when pulled past the top (the +translateY keeps its top edge pinned).
  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-HERO_H, 0, HERO_H], [HERO_H / 2, 0, -HERO_H / 2]) },
      { scale: interpolate(scrollY.value, [-HERO_H, 0], [2, 1], Extrapolation.CLAMP) },
    ],
  }));

  if (recipe === undefined) return <View style={styles.root} />;
  if (recipe === null) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.title}>Recipe not found</Text>
        <Pressable onPress={() => router.back()} style={styles.linkBtn}>
          <Text style={styles.linkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const r = recipe;
  const base = Math.max(1, Math.round(r.servings ?? 1));
  const factor = servings / base;

  // optimistic: show the change, then persist; a rating also marks the recipe cooked
  const saveJournal = (patch: Partial<Journal>) => {
    setRecipe((prev) => (prev ? { ...prev, ...patch, tags: patch.tags ? cleanTags(patch.tags) : prev.tags } : prev));
    updateJournal(db, r.id, patch).catch(() => {});
  };

  const share = () =>
    router.push({ pathname: '/mybites/share', params: { id: String(r.id), servings: String(servings), system } } as never);

  const confirmDelete = () =>
    Alert.alert('Delete this recipe?', 'It will also leave any cookbooks and meal plans.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRecipe(db, r.id);
          try {
            if (r.thumbnailUri) new File(r.thumbnailUri).delete();
          } catch {
            // an already-missing thumbnail is fine
          }
          router.back();
        },
      },
    ]);

  const metaChips = [
    r.prepMinutes ? `Prep ${formatMinutes(r.prepMinutes)}` : null,
    r.cookMinutes ? `Cook ${formatMinutes(r.cookMinutes)}` : null,
    !r.prepMinutes && !r.cookMinutes && r.totalMinutes ? `${formatMinutes(r.totalMinutes)} total` : null,
  ].filter((x): x is string => x !== null);

  return (
    <View style={styles.root}>
      <StatusBar style={lightBar ? 'dark' : 'light'} />
      <Animated.View style={[styles.hero, heroStyle]}>
        {r.thumbnailUri ? (
          <Image source={{ uri: r.thumbnailUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={[colors.peach, colors.lavender]} style={[StyleSheet.absoluteFill, styles.center]}>
            <Ionicons name="restaurant-outline" size={64} color={colors.textFaint} />
          </LinearGradient>
        )}
        <LinearGradient colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']} style={styles.scrim} />
      </Animated.View>

      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}>
        <View style={{ height: HERO_H - SHEET_RADIUS }} />
        <View style={[styles.sheet, { minHeight: height - (HERO_H - SHEET_RADIUS), paddingBottom: insets.bottom + 48 }]}>
          <LinearGradient
            colors={[colors.peach, colors.base, colors.lavender]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.title}>{r.title}</Text>

          <View style={styles.metaRow}>
            {metaChips.map((m) => (
              <Chip key={m} icon={m.startsWith('Cook') ? 'flame-outline' : 'time-outline'} label={m} />
            ))}
            {r.sourceType === 'instagram' && r.sourceUrl ? (
              <Pressable onPress={() => Linking.openURL(r.sourceUrl!)} accessibilityLabel="Open on Instagram">
                <View style={styles.igChip}>
                  <Ionicons name="logo-instagram" size={14} color="#c13584" />
                  <Text style={styles.igText}>Instagram</Text>
                  <Ionicons name="open-outline" size={13} color={colors.textMuted} />
                </View>
              </Pressable>
            ) : r.sourceType === 'image' ? (
              <Chip icon="image-outline" label="Screenshot" />
            ) : null}
          </View>

          <View style={styles.actions}>
            <PressableScale
              onPress={() => router.push({ pathname: '/mybites/cookbook-picker', params: { recipeId: String(r.id) } } as never)}
              style={styles.action}
              accessibilityLabel="Save to cookbooks"
            >
              <GlassSurface radius={32} strong style={styles.actionCircle}>
                <Ionicons name={inCookbooks ? 'bookmark' : 'bookmark-outline'} size={24} color={inCookbooks ? colors.accent : colors.text} />
              </GlassSurface>
              <Text style={styles.actionLabel}>Cookbooks</Text>
            </PressableScale>
            <PressableScale
              onPress={() => router.push({ pathname: '/mybites/meal-add', params: { recipeId: String(r.id) } } as never)}
              style={styles.action}
              accessibilityLabel="Add to meal plan"
            >
              <GlassSurface radius={32} strong style={styles.actionCircle}>
                <Ionicons name="calendar-outline" size={24} color={colors.text} />
              </GlassSurface>
              <Text style={styles.actionLabel}>Meal Plan</Text>
            </PressableScale>
            <PressableScale
              onPress={() => saveJournal({ cooked: !r.cooked })}
              style={styles.action}
              accessibilityLabel={r.cooked ? 'Marked as cooked' : 'Mark as cooked'}
            >
              <GlassSurface radius={32} strong style={styles.actionCircle}>
                <Ionicons name={r.cooked ? 'checkmark-circle' : 'checkmark-circle-outline'} size={26} color={r.cooked ? colors.success : colors.text} />
              </GlassSurface>
              <Text style={styles.actionLabel}>{r.cooked ? 'Cooked' : 'Mark cooked'}</Text>
            </PressableScale>
            <PressableScale onPress={share} style={styles.action} accessibilityLabel="Share recipe">
              <GlassSurface radius={32} strong style={styles.actionCircle}>
                <Ionicons name="share-outline" size={24} color={colors.text} />
              </GlassSurface>
              <Text style={styles.actionLabel}>Share</Text>
            </PressableScale>
          </View>

          <RecipeJournal recipe={r} onSave={saveJournal} />

          <GlassSurface radius={radius.button} strong style={styles.tabs}>
            <View style={styles.tabsRow}>
              {TABS.map((t) => (
                <Pressable key={t.id} onPress={() => setTab(t.id)} style={[styles.tab, tab === t.id && styles.tabOn]}>
                  <Text style={[styles.tabText, tab === t.id && styles.tabTextOn]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
          </GlassSurface>

          <Animated.View key={tab} entering={FadeIn.duration(220)} style={styles.panel}>
            {tab === 'ingredients' ? (
              <>
                <View style={styles.controls}>
                  <GlassSurface radius={radius.button} strong style={styles.stepper}>
                    <View style={styles.stepperRow}>
                      <Pressable onPress={() => setServings((s) => Math.max(1, s - 1))} hitSlop={8} accessibilityLabel="Fewer servings">
                        <Ionicons name="remove" size={22} color={colors.text} />
                      </Pressable>
                      <Text style={styles.stepperValue}>{formatQuantity(servings)}</Text>
                      <Pressable onPress={() => setServings((s) => Math.min(99, s + 1))} hitSlop={8} accessibilityLabel="More servings">
                        <Ionicons name="add" size={22} color={colors.text} />
                      </Pressable>
                    </View>
                  </GlassSurface>
                  <Text style={styles.servingsLabel}>servings</Text>
                  <View style={{ flex: 1 }} />
                  <PressableScale
                    onPress={() => setSystem(SYSTEMS[(SYSTEMS.indexOf(system) + 1) % SYSTEMS.length])}
                    accessibilityLabel={`Units: ${SYSTEM_LABEL[system]}`}
                  >
                    <GlassSurface radius={radius.button} strong style={styles.convert}>
                      <Ionicons name="swap-horizontal" size={18} color={colors.text} />
                      <Text style={styles.convertText}>{SYSTEM_LABEL[system]}</Text>
                    </GlassSurface>
                  </PressableScale>
                </View>

                {r.ingredients.length === 0 ? (
                  <Text style={styles.muted}>No ingredients were found in the source.</Text>
                ) : (
                  <IngredientList recipe={r} factor={factor} system={system} />
                )}
              </>
            ) : null}

            {tab === 'steps' ? (
              <>
                <Text style={styles.sectionCaps}>INSTRUCTIONS</Text>
                {r.steps.length === 0 ? (
                  <Text style={styles.muted}>No method was found in the source.</Text>
                ) : (
                  r.steps.map((st, n) => <Step key={n} n={n + 1} step={st} recipe={r} />)
                )}
              </>
            ) : null}

            {tab === 'nutrition' ? (
              <Nutrition
                recipe={r}
                onEstimated={async (n) => {
                  setRecipe((prev) => (prev ? { ...prev, nutrition: n } : prev));
                  await updateRecipeNutrition(db, r.id, n);
                }}
              />
            ) : null}
          </Animated.View>
        </View>
      </Animated.ScrollView>

      <Animated.View
        pointerEvents="none"
        style={[styles.header, { height: insets.top + 62 }, headerStyle]}
      >
        <Text style={[styles.headerTitle, { top: insets.top + 8 }]} numberOfLines={1}>
          {r.title}
        </Text>
      </Animated.View>

      <PressableScale
        onPress={() => router.push({ pathname: '/mybites/chat', params: { recipeId: String(r.id) } } as never)}
        style={[styles.chef, { bottom: insets.bottom + space.xl }]}
        accessibilityLabel="Ask the chef about this recipe"
      >
        <GlassSurface blur strong radius={32} style={styles.chefCircle}>
          <Text style={styles.chefEmoji}>🧑‍🍳</Text>
        </GlassSurface>
      </PressableScale>

      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <PressableScale onPress={() => router.back()} accessibilityLabel="Back">
          <View style={styles.topBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </View>
        </PressableScale>
        <PressableScale onPress={confirmDelete} accessibilityLabel="More options">
          <View style={styles.topBtn}>
            <Ionicons name="trash-outline" size={21} color={colors.text} />
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

function IngredientList({ recipe, factor, system }: { recipe: Recipe; factor: number; system: UnitSystem }) {
  const rows = useMemo(
    () => recipe.ingredients.map((i) => ({ i, shown: showIngredient(i, factor, system) })),
    [recipe, factor, system],
  );
  return (
    <View>
      {rows.map(({ i, shown }, n) => (
        <View key={n}>
          {shown.section && shown.section !== rows[n - 1]?.shown.section ? (
            <Text style={styles.sectionHeader}>{shown.section}:</Text>
          ) : null}
          <View style={[styles.ingRow, n === 0 && { borderTopWidth: 0 }]}>
            <IngredientIcon name={i.name} emoji={i.emoji} />
            <Text style={styles.ingText}>
              {shown.amount ? <Text style={styles.ingAmount}>{shown.amount} </Text> : null}
              {shown.name}
              {shown.note ? <Text style={styles.ingNote}>{` (${shown.note})`}</Text> : null}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function Step({ n, step, recipe }: { n: number; step: StepType; recipe: Recipe }) {
  const segments = useMemo(() => highlightSteps(step.text, recipe.ingredients), [step.text, recipe]);
  return (
    <View style={styles.step}>
      <Text style={styles.stepNum}>{n}</Text>
      <Text style={styles.stepText}>
        {segments.map((seg, k) => (
          <Text key={k} style={seg.hit ? styles.stepHit : undefined}>
            {seg.text}
          </Text>
        ))}
      </Text>
      <Text style={styles.stepEmoji}>{step.emoji ?? ''}</Text>
    </View>
  );
}

function Nutrition({ recipe, onEstimated }: { recipe: Recipe; onEstimated: (n: NutritionType) => Promise<void> }) {
  const n = recipe.nutrition;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tiles: [NutritionKey, string, string][] = [
    ['calories', 'Calories', 'kcal'],
    ['proteinG', 'Protein', 'g'],
    ['carbsG', 'Carbs', 'g'],
    ['fatG', 'Fat', 'g'],
    ['fiberG', 'Fiber', 'g'],
  ];

  const estimate = async () => {
    setBusy(true);
    setError(null);
    try {
      const apiKey = await getGeminiKey();
      if (!apiKey) throw new Error('Add your Gemini key in Profile first.');
      const est = await estimateNutrition({ apiKey, model: DEFAULT_MODEL }, recipeContext(recipe));
      await onEstimated(mergeEstimate(n, est));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not estimate');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.md }}>
      <Text style={styles.muted}>Per serving</Text>
      {n ? (
        <View style={styles.tiles}>
          {tiles.map(([key, label, unit]) => {
            const v = n[key];
            const guess = n.estimated?.includes(key);
            return (
              <GlassSurface key={key} radius={22} strong style={styles.tile}>
                <View style={styles.tileInner}>
                  <Text style={styles.tileValue}>{v === null || v === undefined ? '–' : `${guess ? '≈' : ''}${Math.round(v)}`}</Text>
                  <Text style={styles.tileUnit}>{v === null || v === undefined ? ' ' : unit}</Text>
                  <Text style={styles.tileLabel}>{label}</Text>
                </View>
              </GlassSurface>
            );
          })}
        </View>
      ) : (
        <Text style={styles.muted}>No nutrition values were printed in the source.</Text>
      )}
      {n?.estimated?.length ? <Text style={styles.muted}>≈ values are a rough estimate from the ingredient list, not from the source.</Text> : null}
      {canEstimate(n) && recipe.ingredients.length > 0 ? (
        <PressableScale onPress={estimate} disabled={busy} accessibilityLabel="Estimate nutrition">
          <GlassSurface radius={radius.button} strong style={styles.estimate}>
            {busy ? <ActivityIndicator color={colors.accent} /> : <Ionicons name="sparkles-outline" size={18} color={colors.accent} />}
            <Text style={styles.estimateText}>{busy ? 'Estimating…' : n ? 'Estimate the missing values' : 'Estimate nutrition'}</Text>
          </GlassSurface>
        </PressableScale>
      ) : null}
      {error ? <Text style={styles.estimateError}>{error}</Text> : null}
      <View style={styles.hairline} />
      <Text style={styles.allergens}>
        <Text style={{ fontFamily: fonts.semibold, color: colors.text }}>Allergens: </Text>
        {recipe.allergens.length ? recipe.allergens.join(', ') : 'None detected'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base },
  chef: { position: 'absolute', right: space.gutter },
  chefCircle: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  chefEmoji: { fontSize: 30 },
  center: { alignItems: 'center', justifyContent: 'center' },
  hero: { position: 'absolute', top: 0, left: 0, right: 0, height: HERO_H },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 130 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(246,243,255,0.97)' },
  headerTitle: { position: 'absolute', left: 68, right: 68, height: 46, lineHeight: 46, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  topBar: { position: 'absolute', left: space.gutter, right: space.gutter, flexDirection: 'row', justifyContent: 'space-between' },
  topBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.88)' },
  sheet: { borderTopLeftRadius: SHEET_RADIUS, borderTopRightRadius: SHEET_RADIUS, overflow: 'hidden', paddingHorizontal: space.gutter, paddingTop: space.xl },
  title: { fontFamily: fonts.bold, fontSize: 25, lineHeight: 31, color: colors.text, textAlign: 'center', marginBottom: space.md },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, marginBottom: space.lg },
  igChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: 'rgba(255,255,255,0.55)' },
  igText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: space.md, marginBottom: space.xl },
  action: { alignItems: 'center', gap: 6 },
  actionCircle: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  tabs: { height: 52, marginBottom: space.lg },
  tabsRow: { flex: 1, flexDirection: 'row', padding: 5, gap: 4 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.button },
  tabOn: { backgroundColor: colors.accentSoft },
  tabText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textMuted },
  tabTextOn: { color: colors.accent },
  panel: { gap: space.md },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  stepper: { height: 48 },
  stepperRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.lg },
  stepperValue: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text, minWidth: 26, textAlign: 'center' },
  servingsLabel: { fontFamily: fonts.regular, fontSize: 16, color: colors.textMuted },
  convert: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.lg },
  convertText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  sectionHeader: { fontFamily: fonts.bold, fontSize: 17, color: colors.accent, marginTop: space.lg, marginBottom: 4 },
  ingRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.glassBorder },
  ingText: { flex: 1, fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.text },
  ingAmount: { fontFamily: fonts.bold },
  ingNote: { color: colors.textMuted },
  sectionCaps: { fontFamily: fonts.bold, fontSize: 14, letterSpacing: 0.8, color: colors.accent },
  step: { flexDirection: 'row', gap: space.lg, marginTop: space.md },
  stepNum: { width: 22, fontFamily: fonts.semibold, fontSize: 16, color: colors.textMuted },
  stepText: { flex: 1, fontFamily: fonts.regular, fontSize: 17, lineHeight: 26, color: colors.text },
  stepHit: { color: colors.accent, fontFamily: fonts.medium },
  stepEmoji: { width: 38, fontSize: 28, lineHeight: 34, textAlign: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { width: '47.5%' },
  tileInner: { padding: space.lg, gap: 2 },
  tileValue: { fontFamily: fonts.bold, fontSize: 30, color: colors.text },
  tileUnit: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted, marginTop: -4 },
  tileLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent, marginTop: 4 },
  estimate: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: space.lg },
  estimateText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.accent },
  estimateError: { fontFamily: fonts.regular, fontSize: 13, color: '#c0392b' },
  hairline: { height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.glassBorder },
  allergens: { fontFamily: fonts.regular, fontSize: 16, color: colors.textMuted },
  muted: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted },
  linkBtn: { marginTop: space.lg },
  linkText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.accent },
});
