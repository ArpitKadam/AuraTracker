// Single source for the look. Mirrors the Figma "Aura" variables (Dark mode):
// https://www.figma.com/design/0gzT4kJHYZcWtOA2ayEfL3
export const colors = {
  base: '#0D0E10',
  surface: '#16171A',
  raised: '#1E2024',
  line: '#2A2D33',
  text: '#ECEDEE',
  textMuted: '#8A8F98',
  textFaint: '#5C616B',
  // MyBites accent (its blue, lifted for dark). Fitness has its own below.
  accent: '#7FA6FF',
  accentSoft: '#33456B',
  onAccent: '#0D0E10',
  fitness: '#C6EE52',
  fitnessSoft: '#6E8233',
  danger: '#FF6B5B',
  success: '#7BD88F',
  star: '#F4C04A',
  instagram: '#E1306C',
  scrim: 'rgba(0,0,0,0.6)',
  glassFill: 'rgba(30,32,36,0.72)',
  glassFillStrong: 'rgba(30,32,36,0.9)',
  glassBorder: 'rgba(255,255,255,0.08)',
  glassHighlight: 'rgba(255,255,255,0.06)',
  imageScrim: 'rgba(0,0,0,0.45)',
} as const;

// Macro identity colors (carbs / fat / protein), checked against the dark surface.
export const macroColors = { c: '#F0A54A', f: '#B39BFF', p: '#5CB8FF' } as const;

// The share card and PDF are exported artifacts meant for other people and print,
// so they keep a light palette on purpose.
export const printColors = {
  page: '#f6f3ff',
  ink: '#16161d',
  inkMuted: '#6b6b7a',
  brand: '#1f5fd6',
  brandSoft: '#dbe4ff',
  tile: '#ffffff',
  chip: 'rgba(255,255,255,0.78)',
  hairline: 'rgba(120,120,150,0.22)',
  border: 'rgba(120,120,150,0.25)',
  photo: 'rgba(120,120,150,0.2)',
  gradient: ['#ffe3d1', '#e4d2ff', '#bdeee6'] as const,
} as const;

export const radius = { chip: 999, card: 20, tabBar: 999, button: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, gutter: 16 } as const;

// Font family names registered in the root layout via expo-font.
export const fonts = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
  boldItalic: 'Geist_700Bold_Italic',
  display: 'BarlowCondensed_700Bold',
  displaySemi: 'BarlowCondensed_600SemiBold',
} as const;

export const TAB_BAR_HEIGHT = 68;
