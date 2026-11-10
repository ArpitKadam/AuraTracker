import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Text } from 'react-native';

import { INGREDIENT_ICONS } from '../lib/ingredientIcons.generated';
import { iconKeyFor } from '../lib/ingredientIcon';

const KEYS = new Set(Object.keys(INGREDIENT_ICONS));

/** The matching icon from the set; Gemini's emoji when no icon fits. */
export function IngredientIcon({ name, emoji, size = 40 }: { name: string; emoji: string; size?: number }) {
  const source = useMemo(() => {
    const key = iconKeyFor(name, KEYS);
    return key ? INGREDIENT_ICONS[key] : null;
  }, [name]);
  if (source) return <Image source={source} style={{ width: size, height: size }} contentFit="contain" />;
  return <Text style={{ width: size, textAlign: 'center', fontSize: size * 0.6 }}>{emoji}</Text>;
}
