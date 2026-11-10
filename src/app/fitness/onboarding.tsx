import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { saveProfile, toKg, type EquipmentAccess, type Experience, type Units } from '@/fitness/db/profile';
import { colors, fonts, radius, space } from '@/theme/tokens';

type Option<T> = { value: T; title: string; sub: string };

const UNITS: Option<Units>[] = [
  { value: 'kg', title: 'Kilograms', sub: 'Plates step by 2.5 kg' },
  { value: 'lb', title: 'Pounds', sub: 'Plates step by 5 lb' },
];
const EQUIPMENT: Option<EquipmentAccess>[] = [
  { value: 'gym', title: 'Full gym', sub: 'Barbells, machines, cables, dumbbells' },
  { value: 'dumbbells', title: 'Dumbbells only', sub: 'Home setup or hotel gym' },
  { value: 'bodyweight', title: 'Bodyweight', sub: 'No equipment' },
];
const EXPERIENCE: Option<Experience>[] = [
  { value: 'beginner', title: 'Beginner', sub: 'Under a year of regular lifting' },
  { value: 'intermediate', title: 'Intermediate', sub: '1 to 3 years, know the main lifts' },
  { value: 'advanced', title: 'Advanced', sub: '3+ years, comfortable with heavy compounds' },
];

const STEPS = 4;
// Stored range is 20-400 kg (fitness.db CHECK); keep the input inside it.
const BODY_KG = { min: 20, max: 400 };

export default function Onboarding() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [units, setUnits] = useState<Units>('kg');
  const [equipment, setEquipment] = useState<EquipmentAccess>('gym');
  const [experience, setExperience] = useState<Experience>('intermediate');
  const [weight, setWeight] = useState('');
  const [error, setError] = useState<string | null>(null);

  const finish = async (withWeight: boolean) => {
    let bodyWeight: number | null = null;
    if (withWeight && weight.trim()) {
      const kg = toKg(Number(weight.replace(',', '.')), units);
      if (!Number.isFinite(kg) || kg < BODY_KG.min || kg > BODY_KG.max) {
        setError(units === 'kg' ? 'Enter a weight between 20 and 400 kg' : 'Enter a weight between 44 and 880 lb');
        return;
      }
      bodyWeight = Math.round(kg * 10) / 10;
    }
    await saveProfile(db, {
      units,
      equipment,
      experience,
      bodyWeight,
      weightStep: units === 'kg' ? 2.5 : toKg(5, 'lb'),
      onboarded: true,
    });
    router.replace('/fitness');
  };

  const next = () => (step === STEPS - 1 ? finish(true) : setStep(step + 1));
  const skip = () => (step === STEPS - 1 ? finish(false) : setStep(step + 1));

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <View style={[styles.root, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.top}>
          {Array.from({ length: STEPS }, (_, i) => (
            <View key={i} style={[styles.bar, i <= step && styles.barOn]} />
          ))}
          <Pressable onPress={skip} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip this step">
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        </View>

        {step === 0 ? (
          <Choice title={'Kilograms or\npounds?'} sub="You can change this later in Settings." options={UNITS} value={units} onChange={setUnits} />
        ) : step === 1 ? (
          <Choice
            title={'What do you\ntrain with?'}
            sub="Recommendations only show exercises you can actually do."
            options={EQUIPMENT}
            value={equipment}
            onChange={setEquipment}
          />
        ) : step === 2 ? (
          <Choice
            title={'How long have\nyou been lifting?'}
            sub="Sets which catalog exercises get suggested first."
            options={EXPERIENCE}
            value={experience}
            onChange={setExperience}
          />
        ) : (
          <View style={styles.body}>
            <Text style={styles.title}>{'Your body\nweight'}</Text>
            <Text style={styles.sub}>Optional. Used for bodyweight exercise volume and your weight trend.</Text>
            <View style={styles.weightRow}>
              <TextInput
                value={weight}
                onChangeText={(t) => {
                  setWeight(t);
                  setError(null);
                }}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textFaint}
                style={styles.weightInput}
                accessibilityLabel={`Body weight in ${units}`}
                maxLength={5}
              />
              <Text style={styles.unit}>{units}</Text>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        )}

        <Pressable
          onPress={next}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{step === STEPS - 1 ? 'Finish' : 'Continue'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Choice<T extends string>({
  title,
  sub,
  options,
  value,
  onChange,
}: {
  title: string;
  sub: string;
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.body}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{sub}</Text>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.option, on && styles.optionOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <View style={styles.flex}>
              <Text style={styles.optionTitle}>{o.title}</Text>
              <Text style={styles.optionSub}>{o.sub}</Text>
            </View>
            <View style={[styles.radio, on && styles.radioOn]}>
              {on ? <Ionicons name="checkmark" size={16} color={colors.onAccent} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.base, paddingHorizontal: space.gutter },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.raised },
  barOn: { backgroundColor: colors.fitness },
  skip: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted, marginLeft: space.sm },
  body: { flex: 1, gap: space.lg, paddingTop: space.xl },
  title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.textMuted },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  optionOn: { borderColor: colors.fitness, borderWidth: 2, padding: 17 },
  optionTitle: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text },
  optionSub: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.fitness, borderColor: colors.fitness },
  weightRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  weightInput: { fontFamily: fonts.display, fontSize: 72, color: colors.text, minWidth: 120, padding: 0 },
  unit: { fontFamily: fonts.medium, fontSize: 20, color: colors.textMuted },
  error: { fontFamily: fonts.regular, fontSize: 13, color: colors.danger },
  cta: { height: 56, borderRadius: radius.button, backgroundColor: colors.fitness, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  ctaText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onAccent },
});
