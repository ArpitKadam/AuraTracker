import { Ionicons } from '@expo/vector-icons';
import { fetch as expoFetch } from 'expo/fetch';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { recipeContext, type ChatMessage } from '@/recipe-module/chat/logic';
import { streamChat } from '@/recipe-module/chat/stream';
import { addMessage, clearChat, listMessages } from '@/recipe-module/db/chat';
import { getRecipe, type Recipe } from '@/recipe-module/db/recipes';
import { CHAT_MODEL, getGeminiKey } from '@/recipe-module/extraction/key';
import { GlassSurface } from '@/theme/GlassSurface';
import { colors, fonts, radius, space } from '@/theme/tokens';

const SUGGESTIONS = ['What can I substitute?', 'Scale this for 6 people', 'Any tips to make it better?', 'What goes well with it?'];

/** **bold** is the only markdown worth rendering in a chat bubble. */
function Rich({ text, style }: { text: string; style: object }) {
  return (
    <Text style={style}>
      {text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <Text key={i} style={{ fontFamily: fonts.bold }}>{part}</Text> : part))}
    </Text>
  );
}

/** Tall sheet opened from a recipe: chat grounded on that recipe, history kept per recipe. */
export default function Chat() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const rid = Number(recipeId);
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState<string | null>(null); // the model's answer while it streams
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    getRecipe(db, rid).then(setRecipe);
    listMessages(db, rid).then(setMessages);
    return () => abort.current?.abort();
  }, [db, rid]);

  const sending = reply !== null;

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || sending || !recipe) return;
    setError(null);
    setInput('');
    const apiKey = await getGeminiKey();
    if (!apiKey) {
      setError('Add your Gemini key in Profile first.');
      return;
    }
    const mine: ChatMessage = { id: await addMessage(db, rid, 'user', text), role: 'user', content: text };
    const history = [...messages, mine];
    setMessages(history);
    setReply('');
    const ctrl = new AbortController();
    abort.current = ctrl;
    let partial = '';
    try {
      await streamChat({ apiKey, model: CHAT_MODEL }, recipeContext(recipe), history, (d) => {
        partial += d;
        setReply(partial);
      }, { fetchImpl: expoFetch as unknown as typeof fetch, signal: ctrl.signal });
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'Something went wrong');
    }
    // keep whatever arrived, even if the stream was stopped or broke part-way
    if (partial.trim()) {
      const id = await addMessage(db, rid, 'model', partial);
      setMessages((m) => [...m, { id, role: 'model', content: partial }]);
    }
    abort.current = null;
    setReply(null);
  };

  const clear = async () => {
    abort.current?.abort();
    await clearChat(db, rid);
    setMessages([]);
    setError(null);
  };

  return (
    <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior="padding" pointerEvents="box-none">
        <GlassSurface strong radius={32} style={[styles.sheet, { marginBottom: Math.max(insets.bottom, space.lg) }]}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Ask the chef</Text>
              <Text style={styles.sub} numberOfLines={1}>{recipe?.title ?? ' '}</Text>
            </View>
            {messages.length > 0 ? (
              <Pressable onPress={clear} hitSlop={10} accessibilityLabel="Clear chat">
                <Ionicons name="trash-outline" size={22} color={colors.textMuted} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Close chat">
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView
            ref={scroll}
            style={styles.list}
            contentContainerStyle={{ gap: space.sm, paddingVertical: space.sm }}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {messages.length === 0 && !sending ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Ask anything about this recipe. Answers use only what is saved here, plus general cooking knowledge when it says so.</Text>
                <View style={styles.chips}>
                  {SUGGESTIONS.map((s) => (
                    <Pressable key={s} onPress={() => send(s)} style={styles.suggest}>
                      <Text style={styles.suggestText}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            {messages.map((m) => (
              <View key={m.id} style={[styles.bubble, m.role === 'user' ? styles.mine : styles.theirs]}>
                <Rich text={m.content} style={[styles.bubbleText, m.role === 'user' && { color: colors.onAccent }]} />
              </View>
            ))}
            {sending ? (
              <View style={[styles.bubble, styles.theirs]}>
                <Rich text={reply || '…'} style={styles.bubbleText} />
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask about this recipe"
              placeholderTextColor={colors.textFaint}
              multiline
              maxLength={600}
              style={styles.input}
            />
            {sending ? (
              <Pressable onPress={() => abort.current?.abort()} style={styles.send} accessibilityLabel="Stop">
                <Ionicons name="stop" size={20} color={colors.onAccent} />
              </Pressable>
            ) : (
              <Pressable onPress={() => send(input)} disabled={!input.trim()} style={[styles.send, !input.trim() && { opacity: 0.4 }]} accessibilityLabel="Send">
                <Ionicons name="arrow-up" size={22} color={colors.onAccent} />
              </Pressable>
            )}
          </View>
        </GlassSurface>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  sheet: { marginHorizontal: space.gutter, padding: space.lg, gap: space.sm, height: 560, maxHeight: '88%', backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  list: { flex: 1 },
  empty: { gap: space.md, paddingTop: space.sm },
  emptyText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  suggest: { paddingHorizontal: 14, height: 38, borderRadius: radius.chip, justifyContent: 'center', backgroundColor: colors.accentSoft },
  suggestText: { fontFamily: fonts.medium, fontSize: 14, color: colors.accent },
  bubble: { maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.glassBorder, borderBottomLeftRadius: 6 },
  bubbleText: { fontFamily: fonts.regular, fontSize: 15.5, lineHeight: 22, color: colors.text },
  error: { fontFamily: fonts.regular, fontSize: 13, color: colors.danger, paddingHorizontal: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  input: { flex: 1, minHeight: 46, maxHeight: 110, paddingHorizontal: space.lg, paddingTop: 12, paddingBottom: 12, borderRadius: 24, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.glassBorder, fontFamily: fonts.regular, fontSize: 16, color: colors.text },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
