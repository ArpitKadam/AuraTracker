import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSwitchButton } from '@/components/AppSwitchButton';
import { exportMyBites, importMyBites, myBitesCounts, parseMyBitesBackup } from '@/recipe-module/db/backup';
import { clearGeminiKey, DEFAULT_MODEL, getGeminiKey, setGeminiKey } from '@/recipe-module/extraction/key';
import { GlassSurface } from '@/theme/GlassSurface';
import { colors, fonts, radius, space } from '@/theme/tokens';

/** Recipe photos live here (same dir the importer uses). */
function writePhoto(name: string, base64: string): Promise<string> {
  const dir = new Directory(Paths.document, 'thumbs');
  dir.create({ intermediates: true, idempotent: true });
  const f = new File(dir, name);
  f.write(base64, { encoding: 'base64' });
  return Promise.resolve(f.uri);
}

async function readPhoto(uri: string): Promise<string | null> {
  try {
    const f = new File(uri);
    return f.exists ? await f.base64() : null;
  } catch {
    return null;
  }
}

export default function Profile() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const [dataStatus, setDataStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
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

  const exportNow = async () => {
    setBusy(true);
    setDataStatus(null);
    try {
      const data = await exportMyBites(db, Date.now(), readPhoto);
      const file = new File(Paths.cache, `auratracker-mybites-${new Date(data.exportedAt).toISOString().slice(0, 10)}.json`);
      file.write(JSON.stringify(data));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your MyBites backup', UTI: 'public.json' });
      const c = myBitesCounts(data);
      setDataStatus({ ok: true, text: `Backup ready: ${c.recipes} recipes, ${c.photos} photos, ${c.cookbooks} cookbooks, ${c.meals} planned meals` });
    } catch (e) {
      setDataStatus({ ok: false, text: e instanceof Error ? e.message : 'Export failed' });
    } finally {
      setBusy(false);
    }
  };

  const importNow = async () => {
    setDataStatus(null);
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    let backup;
    try {
      backup = parseMyBitesBackup(await new File(res.assets[0].uri).text());
    } catch (e) {
      setDataStatus({ ok: false, text: e instanceof Error ? e.message : 'Could not read that file' });
      return;
    }
    const c = myBitesCounts(backup);
    Alert.alert(
      'Replace all MyBites data?',
      `This backup is from ${new Date(backup.exportedAt).toLocaleString()} with ${c.recipes} recipes, ${c.photos} photos, ${c.cookbooks} cookbooks and ${c.meals} planned meals.

Everything currently in MyBites on this phone will be replaced. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await importMyBites(db, backup, writePhoto);
              setDataStatus({ ok: true, text: `Imported ${c.recipes} recipes and ${c.photos} photos` });
            } catch {
              setDataStatus({ ok: false, text: 'Import failed. Your previous data is unchanged.' });
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.root, { paddingTop: insets.top + space.xl }]}>
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

      <GlassSurface style={[styles.card, styles.gap]}>
        <Text style={styles.heading}>Your data</Text>
        <Text style={styles.body}>Recipes, photos, cookbooks, meal plan and chats in one file. Your Gemini key is not included.</Text>
        <View style={styles.row}>
          <Pressable onPress={exportNow} disabled={busy} style={[styles.btn, styles.primary]} accessibilityRole="button">
            <Text style={styles.primaryText}>Export</Text>
          </Pressable>
          <Pressable onPress={importNow} disabled={busy} style={styles.btn} accessibilityRole="button">
            <Text style={styles.btnText}>Import</Text>
          </Pressable>
        </View>
        {dataStatus ? <Text style={[styles.status, dataStatus.ok ? styles.ok : styles.bad]}>{dataStatus.text}</Text> : null}
      </GlassSurface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { paddingHorizontal: space.gutter, paddingBottom: 140 },
  gap: { marginTop: space.lg },
  bad: { color: colors.danger },
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
