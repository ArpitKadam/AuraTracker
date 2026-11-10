import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSwitchButton } from '@/components/AppSwitchButton';
import { clearGeminiKey, DEFAULT_MODEL, getGeminiKey, setGeminiKey } from '@/recipe-module/extraction/key';
import { GlassSurface } from '@/theme/GlassSurface';
import { colors, fonts, radius, space } from '@/theme/tokens';

export default function Profile() {
  const insets = useSafeAreaInsets();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    getGeminiKey().then((k) => setSaved(!!k));
  }, []);

  const save = async () => {
    if (!draft.trim()) return;
    await setGeminiKey(draft);
    setDraft('');
    setSaved(true);
  };
  const remove = async () => {
    await clearGeminiKey();
    setSaved(false);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.xl }]}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Profile</Text>
        <AppSwitchButton />
      </View>
      <GlassSurface style={styles.card}>
        <Text style={styles.heading}>Gemini API key</Text>
        <Text style={styles.body}>
          Stored only on this phone in secure storage. Model: {DEFAULT_MODEL}.
        </Text>
        <Text style={[styles.status, saved ? styles.ok : styles.missing]}>
          {saved === null ? ' ' : saved ? 'Key saved' : 'No key saved'}
        </Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={saved ? 'Paste a new key to replace it' : 'Paste your key'}
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <View style={styles.row}>
          <Pressable onPress={save} style={[styles.btn, styles.primary]} accessibilityRole="button">
            <Text style={styles.primaryText}>Save</Text>
          </Pressable>
          {saved ? (
            <Pressable onPress={remove} style={styles.btn} accessibilityRole="button">
              <Text style={styles.btnText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.gutter },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg },
  title: { fontFamily: fonts.bold, fontSize: 28, color: colors.text },
  card: { padding: space.xl, gap: space.sm },
  heading: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted },
  status: { fontFamily: fonts.medium, fontSize: 14, marginTop: space.xs },
  ok: { color: colors.success },
  missing: { color: colors.textMuted },
  input: {
    marginTop: space.sm,
    height: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },
  row: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  btn: { paddingVertical: 12, paddingHorizontal: 22, borderRadius: radius.button, backgroundColor: colors.glassFillStrong, borderWidth: 1, borderColor: colors.glassBorder },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  primaryText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.onAccent },
});
