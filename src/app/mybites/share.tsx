import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getRecipe } from '@/recipe-module/db/recipes';
import type { UnitSystem } from '@/recipe-module/lib/format';
import { buildShareModel, renderHtml, renderText, shareFileName, type ShareModel } from '@/recipe-module/lib/share';
import { SHARE_CARD_WIDTH, ShareCard } from '@/recipe-module/ui/ShareCard';
import { GlassSurface } from '@/theme/GlassSurface';
import { colors, fonts, space } from '@/theme/tokens';

type Kind = 'pdf' | 'image' | 'text';
const MAX_HERO_BYTES = 4 * 1024 * 1024; // a bigger photo would bloat the PDF for no visible gain

export default function ShareSheet() {
  const { id, servings, system } = useLocalSearchParams<{ id: string; servings?: string; system?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [model, setModel] = useState<ShareModel | null>(null);
  const [heroUri, setHeroUri] = useState<string | null>(null);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [cardLaidOut, setCardLaidOut] = useState(false);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
    getRecipe(db, Number(id)).then((r) => {
      if (!r) return setError('Recipe not found');
      const n = Number(servings);
      setModel(buildShareModel(r, Number.isFinite(n) && n > 0 ? n : Math.max(1, Math.round(r.servings ?? 1)), (system as UnitSystem) ?? 'original'));
      setHeroUri(r.thumbnailUri);
      if (!r.thumbnailUri) setHeroLoaded(true);
    });
  }, [db, id, servings, system]);

  const imageReady = !!model && cardLaidOut && heroLoaded;

  /** Copies a generated file to a readable name, then opens the system share sheet. */
  const shareFile = async (from: string, ext: 'pdf' | 'png', mime: string) => {
    const dest = new File(Paths.cache, `${shareFileName(model!.title)}.${ext}`);
    if (dest.exists) dest.delete();
    new File(from.startsWith('file://') ? from : `file://${from}`).copy(dest);
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
    await Sharing.shareAsync(dest.uri, { mimeType: mime, dialogTitle: model!.title });
  };

  const run = async (kind: Kind) => {
    if (!model || busy) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'text') {
        await Share.share({ message: renderText(model) });
      } else if (kind === 'pdf') {
        let hero: string | null = null;
        if (heroUri) {
          const f = new File(heroUri);
          if (f.size > 0 && f.size <= MAX_HERO_BYTES) hero = `data:image/jpeg;base64,${await f.base64()}`;
        }
        const out = await Print.printToFileAsync({ html: renderHtml(model, hero), width: 595, height: 842 });
        await shareFile(out.uri, 'pdf', 'application/pdf');
      } else {
        const png = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
        await shareFile(png, 'png', 'image/png');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share this recipe');
    } finally {
      setBusy(null);
    }
  };

  const options: { kind: Kind; icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; disabled?: boolean }[] = [
    { kind: 'pdf', icon: 'document-text-outline', title: 'Share as PDF', sub: 'Printable page with the photo and emojis' },
    { kind: 'image', icon: 'image-outline', title: 'Share as image', sub: 'A card for chats and stories', disabled: !imageReady },
    { kind: 'text', icon: 'chatbox-ellipses-outline', title: 'Share as text', sub: 'Plain list, easy to paste' },
  ];

  return (
    <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={() => !busy && router.back()} accessibilityLabel="Close" />

      {/* Off-screen: laid out for the image capture, never visible. */}
      {model ? (
        <View style={styles.offscreen} pointerEvents="none">
          <View ref={cardRef} collapsable={false} onLayout={() => setCardLaidOut(true)}>
            <ShareCard model={model} heroUri={heroUri} onHeroLoad={() => setHeroLoaded(true)} />
          </View>
        </View>
      ) : null}

      <GlassSurface strong radius={32} style={[styles.sheet, { marginBottom: Math.max(insets.bottom, space.lg) }]}>
        <View style={styles.head}>
          <Text style={styles.title}>Share recipe</Text>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={colors.textMuted} />
          </Pressable>
        </View>
        {options.map((o) => (
          <Pressable
            key={o.kind}
            onPress={() => run(o.kind)}
            disabled={!model || !!busy || o.disabled}
            style={[styles.option, (!model || o.disabled) && styles.optionOff]}
            accessibilityRole="button"
          >
            <View style={styles.optionIcon}>
              {busy === o.kind ? <ActivityIndicator color={colors.accent} /> : <Ionicons name={o.icon} size={24} color={colors.accent} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>{o.title}</Text>
              <Text style={styles.optionSub}>{o.disabled && model ? 'Preparing the card…' : o.sub}</Text>
            </View>
          </Pressable>
        ))}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(22,22,29,0.38)' },
  offscreen: { position: 'absolute', top: 0, left: -(SHARE_CARD_WIDTH + 200), width: SHARE_CARD_WIDTH },
  sheet: { marginHorizontal: space.gutter, padding: space.xl, gap: space.md, backgroundColor: 'rgba(246,243,255,0.97)' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  optionOff: { opacity: 0.5 },
  optionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  optionTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  optionSub: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  error: { fontFamily: fonts.regular, fontSize: 13, color: '#c0392b' },
});
