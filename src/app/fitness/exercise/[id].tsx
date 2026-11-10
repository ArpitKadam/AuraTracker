import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Storage } from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CATALOG, MEDIA } from '@/assets/catalog';
import type { MuscleGroup } from '@/fitness/catalog-types';
import { exerciseSessions } from '@/fitness/db/history';
import { getProfile, toKg, type Profile } from '@/fitness/db/profile';
import { addSet, deleteSet, getActiveSession, lastSessionSets, setsFor, startSession, type LoggedSet } from '@/fitness/db/session';
import { GROUPS, groupLabel } from '@/fitness/groups';
import { overloadHint, prefill, type Hint } from '@/fitness/overload';
import { series, type Metric, type SessionSets } from '@/fitness/progress';
import { ProgressChart } from '@/fitness/ui/ProgressChart';
import { displayStep, formatWeight, toDisplay } from '@/fitness/units';
import { colors, fonts, radius, space } from '@/theme/tokens';

const isGroup = (g: string): g is MuscleGroup => GROUPS.some((x) => x.id === g);

const METRICS: { id: Metric; label: string; title: string }[] = [
  { id: 'top', label: 'Top set', title: 'Top working set' },
  { id: 'e1rm', label: 'Est. 1RM', title: 'Estimated 1-rep max' },
  { id: 'volume', label: 'Volume', title: 'Working volume' },
];

// Typed-but-unlogged entry survives Android killing the app in the background (e.g. while on YouTube).
// Only reused while a workout is open and within 6 h, so an old draft never overrides the hint.
type Draft = { weight: string; reps: string; warmup: boolean; at: number };
const DRAFT_TTL_MS = 6 * 60 * 60 * 1000;
const draftKey = (id: string) => `fitness.draft.${id}`;
function readDraft(id: string, now: number): Draft | null {
  try {
    const d = JSON.parse(Storage.getItemSync(draftKey(id)) ?? 'null') as Draft | null;
    return d && now - d.at < DRAFT_TTL_MS ? d : null;
  } catch {
    return null;
  }
}

export default function ExerciseLog() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id: string; groups?: string }>();
  const exercise = useMemo(() => CATALOG.find((e) => e.id === params.id), [params.id]);
  const groups = useMemo(() => (params.groups ?? '').split(',').filter(isGroup), [params.groups]);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [sets, setSets] = useState<LoggedSet[]>([]);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [warmup, setWarmup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState<SessionSets[]>([]);
  const [metric, setMetric] = useState<Metric>('top');

  const reload = useCallback(async () => {
    if (!exercise) return;
    const active = await getActiveSession(db);
    setSets(active ? await setsFor(db, active.id, exercise.id) : []);
  }, [db, exercise]);

  useEffect(() => {
    if (!exercise) return;
    let live = true;
    (async () => {
      const [p, base, open, past] = await Promise.all([
        getProfile(db),
        lastSessionSets(db, exercise.id),
        getActiveSession(db),
        exerciseSessions(db, exercise.id),
      ]);
      const h = overloadHint(base, { repMin: p.repMin, weightStepKg: p.weightStep });
      const start = prefill(h);
      if (!live) return;
      setProfile(p);
      setHint(h);
      setHistory(past);
      const draft = open ? readDraft(exercise.id, Date.now()) : null;
      setWeight(draft?.weight ?? (start.weightKg === null ? '' : String(toDisplay(start.weightKg, p.units))));
      setReps(draft?.reps ?? String(start.reps ?? p.repMin));
      setWarmup(draft?.warmup ?? false);
      setLoaded(true);
      await reload();
    })();
    return () => {
      live = false;
    };
  }, [db, exercise, reload]);

  useEffect(() => {
    if (!exercise || !loaded) return;
    Storage.setItemSync(draftKey(exercise.id), JSON.stringify({ weight, reps, warmup, at: Date.now() } satisfies Draft));
  }, [exercise, loaded, weight, reps, warmup]);

  // Start/peak illustrations alternate like a slow GIF; still when reduce-motion is on or there's one frame.
  useEffect(() => {
    if (!exercise || exercise.media.length < 2) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!reduce) timer = setInterval(() => setFrame((f) => (f + 1) % 2), 900);
    });
    return () => clearInterval(timer);
  }, [exercise]);

  if (!exercise) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.title}>Exercise not found</Text>
      </View>
    );
  }
  if (!profile || !hint) return <View style={styles.root} />;

  const step = displayStep(profile.units);
  const nudge = (value: string, by: number, min = 0) => {
    const n = Number(value.replace(',', '.')) || 0;
    return String(Math.max(min, Math.round((n + by) * 10) / 10));
  };

  const log = async () => {
    const w = Number(weight.replace(',', '.') || '0');
    const r = Math.round(Number(reps));
    if (!Number.isFinite(w) || w < 0 || w > 1000) return setError(`Weight must be between 0 and 1000 ${profile.units}`);
    if (!Number.isFinite(r) || r < 1 || r > 200) return setError('Reps must be between 1 and 200');
    setBusy(true);
    try {
      const sessionId = await startSession(db, groups.length ? groups : exercise.groups, Date.now());
      await addSet(db, sessionId, exercise.id, { weightKg: toKg(w, profile.units), reps: r, isWarmup: warmup }, Date.now());
      setError(null);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    await deleteSet(db, id);
    await reload();
  };

  const workingCount = sets.filter((s) => !s.isWarmup).length;
  let n = 0;

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
        <View style={styles.top}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title} numberOfLines={2}>
            {exercise.name}
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: insets.bottom + space.xl }} keyboardShouldPersistTaps="handled">
          <Image
            source={MEDIA[exercise.media[Math.min(frame, exercise.media.length - 1)]]}
            style={styles.media}
            contentFit="contain"
            accessibilityLabel={`${exercise.name} demonstration`}
          />
          <View style={styles.tags}>
            {exercise.groups.map((g) => (
              <View key={g} style={styles.tag}>
                <Text style={styles.tagText}>{groupLabel(g)}</Text>
              </View>
            ))}
            <View style={[styles.tag, styles.tagMuted]}>
              <Text style={styles.tagMutedText}>{exercise.equipment}</Text>
            </View>
          </View>

          <HintCard hint={hint} profile={profile} />

          <View style={styles.card}>
            <View style={styles.entryHead}>
              <Text style={styles.cardTitle}>{warmup ? 'Warm-up set' : `Set ${workingCount + 1}`}</Text>
              <View style={styles.warm}>
                <Text style={styles.warmText}>Warm-up</Text>
                <Switch
                  value={warmup}
                  onValueChange={setWarmup}
                  accessibilityLabel="Warm-up set"
                  trackColor={{ false: colors.raised, true: colors.fitnessSoft }}
                  thumbColor={warmup ? colors.fitness : colors.textMuted}
                />
              </View>
            </View>
            <View style={styles.steppers}>
              <Stepper label="Weight" unit={profile.units} value={weight} onChange={setWeight} onMinus={() => setWeight(nudge(weight, -step))} onPlus={() => setWeight(nudge(weight, step))} />
              <Stepper label="Reps" value={reps} onChange={setReps} onMinus={() => setReps(nudge(reps, -1, 1))} onPlus={() => setReps(nudge(reps, 1, 1))} />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable onPress={log} disabled={busy} style={({ pressed }) => [styles.cta, pressed && styles.pressed]} accessibilityRole="button">
              <Text style={styles.ctaText}>Log set</Text>
            </Pressable>
          </View>

          {sets.length ? (
            <>
              <View style={styles.sectionHead}>
                <Text style={styles.cardTitle}>Today</Text>
                <Text style={styles.muted}>{`${workingCount} working set${workingCount === 1 ? '' : 's'}`}</Text>
              </View>
              {sets.map((s) => (
                <View key={s.id} style={styles.setRow}>
                  <Text style={styles.setIdx}>{s.isWarmup ? 'W' : String(++n)}</Text>
                  <View style={styles.setValue}>
                    <Text style={styles.big}>{toDisplay(s.weightKg, profile.units)}</Text>
                    <Text style={styles.unit}>{profile.units}</Text>
                    <Text style={styles.times}>×</Text>
                    <Text style={styles.big}>{s.reps}</Text>
                    <Text style={styles.unit}>reps</Text>
                  </View>
                  {s.isWarmup ? (
                    <View style={styles.warmTag}>
                      <Text style={styles.warmTagText}>Warm-up</Text>
                    </View>
                  ) : null}
                  <Pressable onPress={() => remove(s.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Delete set">
                    <Ionicons name="close" size={20} color={colors.textFaint} />
                  </Pressable>
                </View>
              ))}
            </>
          ) : null}

          <View style={styles.card}>
            <View style={styles.entryHead}>
              <Text style={styles.cardTitle}>{METRICS.find((m) => m.id === metric)!.title}</Text>
              <Text style={styles.muted}>{history.length ? `Last ${history.length} session${history.length === 1 ? '' : 's'}` : ''}</Text>
            </View>
            <View style={styles.segment}>
              {METRICS.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => setMetric(m.id)}
                  style={[styles.segItem, metric === m.id && styles.segOn]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: metric === m.id }}
                >
                  <Text style={[styles.segText, metric === m.id && styles.segTextOn]}>{m.label}</Text>
                </Pressable>
              ))}
            </View>
            {history.length ? (
              <ProgressChart
                key={metric}
                points={series(history, metric).map((pt) => ({ t: pt.t, v: toDisplay(pt.v, profile.units) }))}
                unit={profile.units}
                label={METRICS.find((m) => m.id === metric)!.title}
              />
            ) : (
              <Text style={styles.muted}>Finish a workout with this exercise and your trend shows up here.</Text>
            )}
            {history.length === 1 ? <Text style={styles.muted}>One more session and you get a trend line.</Text> : null}
          </View>

          {exercise.instructions.length ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>How to</Text>
              {exercise.instructions.map((line, i) => (
                <Text key={i} style={styles.step}>{`${i + 1}. ${line}`}</Text>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function HintCard({ hint, profile }: { hint: Hint; profile: Profile }) {
  const w = (kg: number) => formatWeight(kg, profile.units);
  const [label, headline] =
    hint.kind === 'first'
      ? ['First time', `Pick a weight you can move for ${profile.repMin}-${profile.repMax} clean reps`]
      : hint.kind === 'reps'
        ? [`Last session: ${w(hint.weightKg)} × ${hint.lastReps}`, `Push for ${hint.from}-${hint.to} reps at ${w(hint.weightKg)}`]
        : [`Last session: ${w(hint.lastWeightKg)} × ${hint.lastReps}, every set ${profile.repMin}+`, `Add weight: go for ${w(hint.weightKg)}`];
  return (
    <View style={[styles.card, styles.hint]}>
      <View style={styles.hintIcon}>
        <Ionicons name={hint.kind === 'weight' ? 'arrow-up' : 'trending-up'} size={20} color={colors.onAccent} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.muted}>{label}</Text>
        <Text style={styles.hintText}>{headline}</Text>
      </View>
    </View>
  );
}

function Stepper({
  label,
  unit,
  value,
  onChange,
  onMinus,
  onPlus,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.muted}>{label}</Text>
      <View style={styles.stepRow}>
        <Pressable onPress={onMinus} style={styles.round} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Decrease ${label}`}>
          <Ionicons name="remove" size={20} color={colors.text} />
        </Pressable>
        <TextInput
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
          selectTextOnFocus
          placeholder="0"
          placeholderTextColor={colors.textFaint}
          style={styles.stepInput}
          accessibilityLabel={label}
          maxLength={5}
        />
        <Pressable onPress={onPlus} style={styles.round} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Increase ${label}`}>
          <Ionicons name="add" size={20} color={colors.text} />
        </Pressable>
      </View>
      {unit ? <Text style={styles.unit}>{unit}</Text> : <Text style={styles.unit}> </Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  root: { flex: 1, backgroundColor: colors.base, paddingHorizontal: space.gutter },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 26, lineHeight: 28, color: colors.text },
  media: { width: '100%', height: 220, borderRadius: radius.card, backgroundColor: colors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tag: { backgroundColor: colors.fitnessSoft, borderRadius: radius.chip, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { fontFamily: fonts.medium, fontSize: 12, color: colors.text },
  tagMuted: { backgroundColor: colors.raised },
  tagMutedText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: space.lg, gap: space.md },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  hint: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.fitness },
  hintIcon: { width: 40, height: 40, borderRadius: radius.chip, backgroundColor: colors.fitness, alignItems: 'center', justifyContent: 'center' },
  hintText: { fontFamily: fonts.display, fontSize: 22, lineHeight: 24, color: colors.text, marginTop: 2 },
  entryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  warm: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  warmText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
  steppers: { flexDirection: 'row', gap: space.md },
  stepper: { flex: 1, alignItems: 'center', backgroundColor: colors.raised, borderRadius: radius.card, paddingVertical: space.md, gap: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  round: { width: 32, height: 32, borderRadius: radius.chip, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepInput: { fontFamily: fonts.display, fontSize: 34, color: colors.text, minWidth: 56, textAlign: 'center', padding: 0 },
  unit: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  error: { fontFamily: fonts.regular, fontSize: 13, color: colors.danger },
  cta: { height: 52, borderRadius: radius.button, backgroundColor: colors.fitness, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  ctaText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onAccent },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: space.sm },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  setIdx: { fontFamily: fonts.display, fontSize: 20, color: colors.textFaint, width: 18 },
  setValue: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  big: { fontFamily: fonts.display, fontSize: 28, color: colors.text },
  times: { fontFamily: fonts.displaySemi, fontSize: 20, color: colors.textFaint },
  warmTag: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.chip, paddingHorizontal: 8, paddingVertical: 3 },
  warmTagText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
  segment: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: colors.raised, borderRadius: radius.chip, padding: 3, gap: 4 },
  segItem: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.chip },
  segOn: { backgroundColor: colors.surface },
  segText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
  segTextOn: { color: colors.text },
  step: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textMuted },
});
