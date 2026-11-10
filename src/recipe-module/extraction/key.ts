import * as SecureStore from 'expo-secure-store';

const KEY = 'gemini_api_key';
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

export const getGeminiKey = () => SecureStore.getItemAsync(KEY);
export const setGeminiKey = (v: string) => SecureStore.setItemAsync(KEY, v.trim());
export const clearGeminiKey = () => SecureStore.deleteItemAsync(KEY);

// Chat uses the same cheap model with thinking off. ponytail: a constant; make it a setting only if a different chat model is ever wanted.
export const CHAT_MODEL = DEFAULT_MODEL;
