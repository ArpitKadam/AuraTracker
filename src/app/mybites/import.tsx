import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PickedImage } from '@/recipe-module/import/importer';
import { useImport } from '@/recipe-module/import/useImport';
import { GlassSurface } from '@/theme/GlassSurface';
import { colors, fonts, radius, space } from '@/theme/tokens';

const MAX_IMAGES = 6;

export default function ImportSheet() {
  const insets = useSafeAreaInsets();
  const { state, startLink, startImages, reset } = useImport();
  // auratracker://mybites/import?url=<reel link> pre-fills the field (also the hook for a future share-to-app intent).
  const { url: prefill } = useLocalSearchParams<{ url?: string }>();
  const [url, setUrl] = useState(typeof prefill === 'string' ? prefill : '');
  const [pickError, setPickError] = useState<string | null>(null);

  // A finished import closes the sheet; the Recipes list reloads on focus.
  useEffect(() => {
    if (state.phase === 'done') router.back();
  }, [state.phase]);

  const pickImages = async () => {
    setPickError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: MAX_IMAGES,
        base64: true,
        quality: 0.8,
      });
      if (res.canceled) return;
      const images: PickedImage[] = res.assets
        .filter((a) => !!a.base64)
        .map((a) => ({ uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg', base64: a.base64 as string }));
      if (images.length === 0) {
        setPickError('Could not read the selected images.');
        return;
      }
      startImages(images);
    } catch (e) {
      setPickError(e instanceof Error ? e.message : 'Could not open your photos.');
    }
  };

  const busy = state.phase === 'running';

  return (
    <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={() => !busy && router.back()} accessibilityLabel="Close" />
      {/* Android is edge-to-edge here, so the window does not resize for the keyboard: pad explicitly. */}
      <KeyboardAvoidingView behavior="padding" pointerEvents="box-none">
        <GlassSurface strong radius={32} style={[styles.sheet, { marginBottom: Math.max(insets.bottom, space.lg) }]}>
          {state.phase === 'idle' || state.phase === 'done' ? (
            <>
              <View style={styles.head}>
                <Text style={styles.title}>Import a recipe</Text>
                <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
                  <Ionicons name="close" size={26} color={colors.textMuted} />
                </Pressable>
              </View>
              <Text style={styles.sub}>Paste an Instagram reel or post link, or upload screenshots of a recipe.</Text>

              <View style={styles.inputRow}>
                <Ionicons name="link-outline" size={20} color={colors.textMuted} />
                <TextInput
                  value={url}
                  onChangeText={setUrl}
                  placeholder="https://www.instagram.com/reel/…"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="go"
                  onSubmitEditing={() => url.trim() && startLink(url)}
                  style={styles.input}
                />
              </View>
              <Pressable
                disabled={!url.trim()}
                onPress={() => startLink(url)}
                style={[styles.primary, !url.trim() && styles.disabled]}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>Import from link</Text>
              </Pressable>

              <View style={styles.orRow}>
                <View style={styles.line} />
                <Text style={styles.or}>or</Text>
                <View style={styles.line} />
              </View>

              <Pressable onPress={pickImages} style={styles.secondary} accessibilityRole="button">
                <Ionicons name="images-outline" size={20} color={colors.accent} />
                <Text style={styles.secondaryText}>Upload screenshots</Text>
              </Pressable>
              {pickError ? <Text style={styles.error}>{pickError}</Text> : null}
            </>
          ) : null}

          {state.phase === 'running' ? (
            <>
              <Text style={styles.title}>Importing…</Text>
              <View style={styles.stages}>
                {state.stages.length === 0 ? (
                  <Stage label="Starting" done={false} />
                ) : (
                  state.stages.map((s) => <Stage key={s.id} label={s.label} done={s.done} />)
                )}
              </View>
              <Text style={styles.hint}>Videos can take up to a minute.</Text>
            </>
          ) : null}

          {state.phase === 'error' ? (
            <>
              <View style={styles.errHead}>
                <Ionicons name="alert-circle" size={26} color={colors.danger} />
                <Text style={styles.title}>Could not import</Text>
              </View>
              <Text style={styles.errMsg}>{state.message}</Text>
              {state.code === 'NO_KEY' ? (
                <Pressable onPress={() => router.replace('/mybites/profile')} style={styles.primary}>
                  <Text style={styles.primaryText}>Open Profile</Text>
                </Pressable>
              ) : state.code === 'DUPLICATE' ? (
                <Pressable onPress={() => router.back()} style={styles.primary}>
                  <Text style={styles.primaryText}>Back to recipes</Text>
                </Pressable>
              ) : (
                <Pressable onPress={reset} style={styles.primary}>
                  <Text style={styles.primaryText}>Try again</Text>
                </Pressable>
              )}
              <Pressable onPress={() => router.back()} style={styles.secondary}>
                <Text style={styles.secondaryText}>Close</Text>
              </Pressable>
            </>
          ) : null}
        </GlassSurface>
      </KeyboardAvoidingView>
    </View>
  );
}

function Stage({ label, done }: { label: string; done: boolean }) {
  return (
    <View style={styles.stage}>
      {done ? (
        <Ionicons name="checkmark-circle" size={22} color={colors.success} />
      ) : (
        <ActivityIndicator size="small" color={colors.accent} />
      )}
      <Text style={[styles.stageText, done && { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  // No blur behind this sheet (it sits outside the blur target), so an opaque base keeps the page from bleeding through.
  sheet: { marginHorizontal: space.gutter, padding: space.xl, gap: space.md, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, marginBottom: space.xs },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.text, padding: 0 },
  primary: { height: 52, borderRadius: radius.button, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.onAccent },
  disabled: { opacity: 0.45 },
  secondary: {
    height: 52,
    borderRadius: radius.button,
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.accent },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.glassBorder },
  or: { fontFamily: fonts.medium, fontSize: 13, color: colors.textFaint },
  stages: { gap: space.md, marginVertical: space.sm },
  stage: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stageText: { fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.textFaint },
  errHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  errMsg: { fontFamily: fonts.regular, fontSize: 15, color: colors.text, lineHeight: 21 },
  error: { fontFamily: fonts.regular, fontSize: 13, color: colors.danger },
});
