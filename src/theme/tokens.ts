// Single source for the look. Values sampled from the reference screenshots.
export const colors = {
  base: '#f1edff',
  peach: '#ffe3d1',
  periwinkle: '#d9dcff',
  lavender: '#e4d2ff',
  mint: '#bdeee6',
  accent: '#1f5fd6',
  accentSoft: '#dbe4ff',
  text: '#16161d',
  textMuted: '#6b6b7a',
  textFaint: '#9a9aa8',
  glassFill: 'rgba(255,255,255,0.55)',
  glassFillStrong: 'rgba(255,255,255,0.72)',
  glassBorder: 'rgba(120,120,150,0.28)',
  glassHighlight: 'rgba(255,255,255,0.9)',
  success: '#2f7d32',
  star: '#f4b400',
} as const;

export const radius = { chip: 999, card: 28, tabBar: 36, button: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, gutter: 16 } as const;

// Font family names registered in the root layout via expo-font.
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  serifItalic: 'Lora_500Medium_Italic',
} as const;

export const TAB_BAR_HEIGHT = 72;
