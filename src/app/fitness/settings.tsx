import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { router, useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { backupCounts, exportData, importData, parseBackup } from '@/fitness/db/backup';
import { getProfile, saveProfile, toKg, type EquipmentAccess, type Experience, type Profile, type Units } from '@/fitness/db/profile';
import { formatWeight } from '@/fitness/units';
import { colors, fonts, radius, space } from '@/theme/tokens';

const UNITS: { id: Units; label: string }[] = [
  { id: 'kg', label: 'kg' },
  { id: 'lb', label: 'lb' },
];
const EQUIPMENT: { id: EquipmentAccess; label: string }[] = [
  { id: 'gym', label: 'Full gym' },
  { id: 'dumbbells', label: 'Dumbbells' },
  { id: 'bodyweight', label: 'Bodyweight' },
];
const EXPERIENCE: { id: Experience; label: string }[] = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];
const CREDITS = [
  { label: 'Exercise data by RepDB', value: 'repdb.co', url: 'https://repdb.co' },
  { label: 'More exercises', value: 'free-exercise-db', url: 'https://github.com/yuhonas/free-exercise-db' },
  { label: 'Body map', value: 'body-highlighter', url: 'https://github.com/HichamELBSI/react-native-body-highlighter' },
];

const fileDate = (t: number) => new Date(t).toISOString().slice(0, 10);

export default function FitnessSettings() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getProfile(db).then(setProfile);
    }, [db]),
  );

  if (!profile) return <View style={styles.root} />;

  const update = async (patch: Partial<Profile>) => {
    // Changing units also changes the plate step: 2.5 kg or 5 lb.
    const full = patch.units ? { ...patch, weightStep: patch.units === 'kg' ? 2.5 : toKg(5, 'lb') } : patch;
    await saveProfile(db, full);
    setProfile(await getProfile(db));
  };

  const exportNow = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const data = await exportData(db, Date.now());
      const file = new File(Paths.cache, `auratracker-fitness-${fileDate(data.exportedAt)}.json`);
      file.write(JSON.stringify(data));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your AuraTracker backup', UTI: 'public.json' });
      const c = backupCounts(data);
      setStatus({ ok: true, text: `Backup ready: ${c.sessions} workouts, ${c.sets} sets, ${c.custom} custom exercises` });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : 'Export failed' });
    } finally {
      setBusy(false);
    }
  };

  const importNow = async () => {
    setStatus(null);
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    let backup;
    try {
      backup = parseBackup(await new File(res.assets[0].uri).text());
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : 'Could not read that file' });
      return;
    }
    const c = backupCounts(backup);
    Alert.alert(
      'Replace all fitness data?',
      `This backup is from ${new Date(backup.exportedAt).toLocaleString()} with ${c.sessions} workouts, ${c.sets} sets and ${c.custom} custom exercises.\n\nEverything currently in Fitness on this phone will be replaced. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await importData(db, backup);
              setProfile(await getProfile(db));
              setStatus({ ok: true, text: `Imported ${c.sessions} workouts and ${c.sets} sets` });
            } catch {
              setStatus({ ok: false, text: 'Import failed. Your previous data is unchanged.' });
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: insets.bottom + space.xl }}>
        <Text style={styles.group}>Training</Text>
        <View style={styles.card}>
          <Choice label="Units" options={UNITS} value={profile.units} onChange={(units) => update({ units })} />
          <Choice label="Equipment" options={EQUIPMENT} value={profile.equipment} onChange={(equipment) => update({ equipment })} />
          <Choice label="Experience" options={EXPERIENCE} value={profile.experience} onChange={(experience) => update({ experience })} />
          <Pressable onPress={() => router.push('/fitness/split')} style={[styles.rowLine, styles.divider]} accessibilityRole="button">
            <Text style={styles.rowLabel}>Workout split</Text>
            <View style={styles.rowRight}>
              <Text style={styles.muted}>Edit days</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </View>
          </Pressable>
          <Row label="Weight step" value={formatWeight(profile.weightStep, profile.units)} />
          <Row label="Target reps" value={`${profile.repMin}-${profile.repMax}`} />
          {profile.bodyWeight !== null ? <Row label="Body weight" value={formatWeight(profile.bodyWeight, profile.units)} /> : null}
        </View>

        <Text style={styles.group}>Your data</Text>
        <View style={styles.card}>
          <Pressable onPress={exportNow} disabled={busy} style={styles.action} accessibilityRole="button">
            <Ionicons name="share-outline" size={20} color={colors.fitness} />
            <View style={styles.flex}>
              <Text style={styles.actionText}>Export data</Text>
              <Text style={styles.muted}>JSON file to Drive, WhatsApp or anywhere</Text>
            </View>
          </Pressable>
          <Pressable onPress={importNow} disabled={busy} style={[styles.action, styles.divider]} accessibilityRole="button">
            <Ionicons name="download-outline" size={20} color={colors.text} />
            <View style={styles.flex}>
              <Text style={styles.actionText}>Import data</Text>
              <Text style={styles.muted}>Replaces everything in Fitness, after you confirm</Text>
            </View>
          </Pressable>
          {status ? <Text style={[styles.status, !status.ok && styles.statusBad]}>{status.text}</Text> : null}
          <Text style={styles.note}>Custom exercise photos stay on this phone; they are not in the file.</Text>
        </View>

        <Text style={styles.group}>About</Text>
        <View style={styles.card}>
          {CREDITS.map((c, i) => (
            <Pressable key={c.url} onPress={() => Linking.openURL(c.url)} style={[styles.rowLine, i > 0 && styles.divider]} accessibilityRole="link">
              <Text style={styles.rowLabel}>{c.label}</Text>
              <Text style={styles.link}>{c.value}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.choice}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.segment}>
        {options.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            style={[styles.segItem, o.id === value && styles.segOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: o.id === value }}
          >
            <Text style={[styles.segText, o.id === value && styles.segTextOn]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowLine}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.muted}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.base, paddingHorizontal: space.gutter },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.text },
  group: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted, marginTop: space.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, paddingHorizontal: space.lg, paddingVertical: space.sm },
  choice: { paddingVertical: space.md, gap: space.sm },
  segment: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: colors.raised, borderRadius: radius.chip, padding: 3, gap: 4 },
  segItem: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.chip },
  segOn: { backgroundColor: colors.fitness },
  segText: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted },
  segTextOn: { color: colors.onAccent },
  rowLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowLabel: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  link: { fontFamily: fonts.medium, fontSize: 14, color: colors.fitness },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14 },
  actionText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  status: { fontFamily: fonts.medium, fontSize: 13, color: colors.fitness, paddingVertical: space.sm },
  statusBad: { color: colors.danger },
  note: { fontFamily: fonts.regular, fontSize: 12, color: colors.textFaint, paddingBottom: space.sm },
});
