import { Ionicons } from '@expo/vector-icons';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Equipment, MuscleGroup } from '@/fitness/catalog-types';
import { createCustom, deleteCustom, isLogged, listCustom, NAME_MAX, updateCustom } from '@/fitness/db/custom';
import { GROUPS } from '@/fitness/groups';
import { colors, fonts, radius, space } from '@/theme/tokens';

const EQUIPMENT: { id: Equipment; label: string }[] = [
  { id: 'barbell', label: 'Barbell' },
  { id: 'dumbbell', label: 'Dumbbell' },
  { id: 'cable', label: 'Cable' },
  { id: 'machine', label: 'Machine' },
  { id: 'ez-bar', label: 'EZ bar' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'band', label: 'Band' },
  { id: 'bodyweight', label: 'Bodyweight' },
  { id: 'other', label: 'Other' },
];

const isGroup = (g: string): g is MuscleGroup => GROUPS.some((x) => x.id === g);
const ownFile = (uri: string | null) => !!uri && uri.includes('/custom/');

/** Copies a picked photo into the app's files so it survives the picker cache being cleared. */
function keepPhoto(uri: string): string {
  const dir = new Directory(Paths.document, 'custom');
  dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, `photo-${Date.now()}.jpg`);
  new File(uri).copy(dest);
  return dest.uri;
}

export default function CustomExerciseForm() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string; group?: string }>();
  const editing = params.id ?? null;
  const [name, setName] = useState('');
  const [groups, setGroups] = useState<MuscleGroup[]>(params.group && isGroup(params.group) ? [params.group] : []);
  const [equipment, setEquipment] = useState<Equipment>('machine');
  const [photo, setPhoto] = useState<string | null>(null);
  const [canDelete, setCanDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    (async () => {
      const ex = (await listCustom(db)).find((e) => e.id === editing);
      if (!ex) return;
      setName(ex.name);
      setGroups(ex.groups);
      setEquipment(ex.equipment);
      setPhoto(ex.photoUri ?? null);
      setCanDelete(!(await isLogged(db, editing)));
    })();
  }, [db, editing]);

  const pick = async () => {
    setError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
      if (res.canceled || !res.assets[0]) return;
      const kept = keepPhoto(res.assets[0].uri);
      if (ownFile(photo) && photo !== kept) new File(photo!).delete();
      setPhoto(kept);
    } catch {
      setError('Could not use that photo');
    }
  };

  const removePhoto = () => {
    if (ownFile(photo)) new File(photo!).delete();
    setPhoto(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const input = { name, groups, equipment, photoUri: photo };
      if (editing) await updateCustom(db, editing, input);
      else await createCustom(db, input, Date.now());
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    try {
      await deleteCustom(db, editing);
      if (ownFile(photo)) new File(photo!).delete();
      router.dismissTo('/fitness');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
    }
  };

  const toggle = (g: MuscleGroup) => setGroups((s) => (s.includes(g) ? s.filter((x) => x !== g) : [...s, g]));

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
        <View style={styles.top}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{editing ? 'Edit exercise' : 'Your own exercise'}</Text>
        </View>

        <ScrollView contentContainerStyle={{ gap: space.lg, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Hammer Strength chest press"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              maxLength={NAME_MAX}
              autoCapitalize="words"
              accessibilityLabel="Exercise name"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Muscle groups</Text>
            <Text style={styles.help}>The first one you pick is the main target.</Text>
            <View style={styles.chips}>
              {GROUPS.map((g) => {
                const i = groups.indexOf(g.id);
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => toggle(g.id)}
                    style={[styles.chip, i >= 0 && styles.chipOn]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: i >= 0 }}
                  >
                    <Text style={[styles.chipText, i >= 0 && styles.chipTextOn]}>{i === 0 ? `${g.label} (main)` : g.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Equipment</Text>
            <View style={styles.chips}>
              {EQUIPMENT.map((e) => (
                <Pressable
                  key={e.id}
                  onPress={() => setEquipment(e.id)}
                  style={[styles.chip, equipment === e.id && styles.chipOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: equipment === e.id }}
                >
                  <Text style={[styles.chipText, equipment === e.id && styles.chipTextOn]}>{e.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Photo (optional)</Text>
            {photo ? (
              <View style={styles.photoRow}>
                <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" />
                <View style={styles.photoActions}>
                  <Pressable onPress={pick} accessibilityRole="button">
                    <Text style={styles.link}>Replace</Text>
                  </Pressable>
                  <Pressable onPress={removePhoto} accessibilityRole="button">
                    <Text style={styles.linkMuted}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={pick} style={styles.pick} accessibilityRole="button">
                <Ionicons name="image-outline" size={22} color={colors.textMuted} />
                <Text style={styles.pickText}>Choose from gallery</Text>
              </Pressable>
            )}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {editing && canDelete ? (
            <Pressable onPress={remove} accessibilityRole="button">
              <Text style={styles.danger}>Delete exercise</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <Pressable
          onPress={save}
          disabled={busy}
          style={({ pressed }) => [styles.cta, { marginBottom: insets.bottom + space.lg }, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{editing ? 'Save changes' : 'Add exercise'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.base, paddingHorizontal: space.gutter },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.text },
  field: { gap: space.sm },
  label: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  help: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  input: {
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.lg,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.chip, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.fitness, borderColor: colors.fitness },
  chipText: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  chipTextOn: { color: colors.onAccent },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 56,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    paddingHorizontal: space.lg,
  },
  pickText: { fontFamily: fonts.medium, fontSize: 15, color: colors.textMuted },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  photo: { width: 96, height: 96, borderRadius: 16, backgroundColor: colors.raised },
  photoActions: { gap: space.md },
  link: { fontFamily: fonts.semibold, fontSize: 15, color: colors.fitness },
  linkMuted: { fontFamily: fonts.medium, fontSize: 15, color: colors.textMuted },
  error: { fontFamily: fonts.regular, fontSize: 14, color: colors.danger },
  danger: { fontFamily: fonts.semibold, fontSize: 15, color: colors.danger },
  cta: { height: 56, borderRadius: radius.button, backgroundColor: colors.fitness, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onAccent },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
