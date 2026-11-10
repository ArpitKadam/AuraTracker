import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { openDatabaseSync } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { planFor } from '@/fitness/split';
import { getRemember, openApp, setRemember, startupTarget } from '@/launcher';
import { toISODate } from '@/recipe-module/lib/dates';
import { colors, fonts, radius, space } from '@/theme/tokens';

function greeting(h: number) {
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Meals planned for today in MyBites. 0 if the DB or table doesn't exist yet (fresh install). */
function mealsToday(): number {
  try {
    const db = openDatabaseSync('mybites.db');
    const row = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM meal_plan WHERE plan_date = ?', [toISODate(new Date())]);
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}

export default function Launcher() {
  const insets = useSafeAreaInsets();
  const [remember, setRememberState] = useState(getRemember);
  const [now] = useState(() => new Date());
  const [meals] = useState(mealsToday);
  const target = startupTarget();

  if (target) return <Redirect href={target === 'fitness' ? '/fitness' : '/mybites'} />;

  const plan = planFor(now);
  const toggle = (on: boolean) => {
    setRemember(on);
    setRememberState(on);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg }]}>
      <Text style={styles.greet}>{greeting(now.getHours())}</Text>
      <Text style={styles.title}>Where to?</Text>

      <Pressable
        onPress={() => openApp('fitness')}
        style={({ pressed }) => [styles.card, styles.fitness, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Open Fitness"
      >
        <View style={styles.tag}>
          <Ionicons name="barbell-outline" size={16} color={colors.onAccent} />
          <Text style={styles.tagText}>Fitness</Text>
        </View>
        <View>
          <Text style={styles.label}>{plan ? "Today's plan" : 'Sunday'}</Text>
          <Text style={styles.plan}>{plan ? plan.primary.join(' + ') : 'Rest or make-up day'}</Text>
          <Text style={styles.sub}>
            {plan ? `with ${plan.secondary.join(' & ')}. What are we working today?` : 'What are we working today?'}
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={() => openApp('mybites')}
        style={({ pressed }) => [styles.card, styles.bites, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Open MyBites"
      >
        <View style={styles.biteIcon}>
          <Ionicons name="restaurant-outline" size={24} color={colors.accent} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.bitesTitle}>MyBites</Text>
          <Text style={styles.sub}>
            {meals > 0 ? `${meals} meal${meals === 1 ? '' : 's'} planned today` : 'What are we eating today?'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.textFaint} />
      </Pressable>

      <View style={styles.remember}>
        <View style={styles.flex}>
          <Text style={styles.rememberText}>Remember my choice</Text>
          <Text style={styles.rememberSub}>Opens straight into your last app</Text>
        </View>
        <Switch
          value={remember}
          onValueChange={toggle}
          accessibilityLabel="Remember my choice"
          trackColor={{ false: colors.raised, true: colors.fitnessSoft }}
          thumbColor={remember ? colors.fitness : colors.textMuted}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base, paddingHorizontal: space.gutter, gap: space.md },
  flex: { flex: 1 },
  greet: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted },
  title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.text, marginBottom: space.sm },
  card: { borderRadius: radius.card, backgroundColor: colors.surface, padding: 20 },
  fitness: { flex: 1, justifyContent: 'space-between', borderWidth: 1, borderColor: colors.fitnessSoft },
  bites: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  tag: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.fitness,
    borderRadius: radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.onAccent },
  label: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
  plan: { fontFamily: fonts.display, fontSize: 44, lineHeight: 46, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, marginTop: 2 },
  biteIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.chip,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bitesTitle: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, color: colors.text },
  remember: { flexDirection: 'row', alignItems: 'center', paddingTop: space.sm },
  rememberText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  rememberSub: { fontFamily: fonts.regular, fontSize: 13, color: colors.textFaint },
});
