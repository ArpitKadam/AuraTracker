import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';
import type { ShareModel } from '../lib/share';

export const SHARE_CARD_WIDTH = 540;

/**
 * The image version of the share template. It is laid out once, off-screen, and captured to a PNG,
 * so it uses plain RN views and the stock Image (native image views can capture blank).
 */
export function ShareCard({ model, heroUri, onHeroLoad }: { model: ShareModel; heroUri: string | null; onHeroLoad?: () => void }) {
  return (
    <View style={styles.card} collapsable={false}>
      <LinearGradient
        colors={[colors.peach, colors.lavender, colors.mint]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.top}
      >
        {heroUri ? <Image source={{ uri: heroUri }} style={styles.hero} onLoad={onHeroLoad} onError={onHeroLoad} /> : null}
        <Text style={styles.title}>{model.title}</Text>
        <View style={styles.chips}>
          {model.chips.map((c) => (
            <Text key={c} style={styles.chip}>
              {c}
            </Text>
          ))}
          {model.tags.slice(0, 3).map((t) => (
            <Text key={t} style={styles.chip}>{`🌿 ${t}`}</Text>
          ))}
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.h2}>INGREDIENTS</Text>
        {model.groups.map((g, gi) => (
          <View key={gi}>
            {g.section ? <Text style={styles.h3}>{g.section}:</Text> : null}
            {g.rows.map((r, ri) => (
              <View key={ri} style={[styles.row, ri === 0 && !g.section && gi === 0 && { borderTopWidth: 0 }]}>
                <Text style={styles.emoji}>{r.emoji}</Text>
                <Text style={styles.text}>
                  {r.amount ? <Text style={styles.bold}>{r.amount} </Text> : null}
                  {r.name}
                  {r.note ? <Text style={styles.note}>{` (${r.note})`}</Text> : null}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.h2}>METHOD</Text>
        {model.steps.map((s) => (
          <View key={s.n} style={styles.row}>
            <Text style={styles.num}>{s.n}</Text>
            <Text style={styles.text}>{s.text}</Text>
            <Text style={styles.stepEmoji}>{s.emoji}</Text>
          </View>
        ))}

        {model.nutrition.length ? (
          <>
            <Text style={styles.h2}>PER SERVING</Text>
            <View style={styles.nut}>
              {model.nutrition.map((n) => (
                <View key={n.label} style={styles.nutTile}>
                  <Text style={styles.nutValue}>{n.value}</Text>
                  <Text style={styles.nutLabel}>{n.label}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.foot}>
          <Text style={styles.footText} numberOfLines={1}>
            {model.sourceLabel ? `via ${model.sourceLabel}` : ''}
          </Text>
          <Text style={styles.brand}>MyBites</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: SHARE_CARD_WIDTH, backgroundColor: '#f6f3ff' },
  top: { padding: 28, paddingBottom: 24, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 },
  hero: { width: '100%', height: 250, borderRadius: 24, marginBottom: 18, backgroundColor: 'rgba(120,120,150,0.2)' },
  title: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, color: colors.text, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  body: { padding: 28, paddingTop: 8 },
  h2: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 1.8, color: colors.accent, marginTop: 26, marginBottom: 8 },
  h3: { fontFamily: fonts.bold, fontSize: 16, color: colors.accent, marginTop: 16, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(120,120,150,0.22)' },
  emoji: { width: 32, fontSize: 24, textAlign: 'center' },
  text: { flex: 1, fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.text },
  bold: { fontFamily: fonts.bold },
  note: { color: colors.textMuted },
  num: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 26,
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  stepEmoji: { width: 36, fontSize: 26, textAlign: 'center' },
  nut: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  nutTile: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, minWidth: 96, borderWidth: 1, borderColor: 'rgba(120,120,150,0.25)' },
  nutValue: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  nutLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.accent },
  foot: { marginTop: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footText: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, flex: 1 },
  brand: { fontFamily: fonts.bold, fontStyle: 'italic', fontSize: 18, color: colors.accent },
});
