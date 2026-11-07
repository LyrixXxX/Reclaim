// Reclaim design tokens.
// Midnight base: depth comes from stepped surfaces, not outlines. One mint
// signature accent; section colors share a soft pastel band so they read as a
// family rather than competing highlights.
export const colors = {
  background: '#0B0D10',
  surface: '#14171C',
  surfaceRaised: '#1C2027',
  border: '#1F242B',
  borderStrong: '#2D333C',
  text: '#F3F5F7',
  textMuted: '#9BA4AF',
  textDim: '#646D78',
  accent: '#6EE7A8',
  accentSoft: '#15291F',
  success: '#6EE7A8',
  marijuana: '#93D49A',
  porn: '#C9A3F0',
  nicotine: '#F5B37A',
  caffeine: '#8DB8F7',
  danger: '#FF8A80',
  habitsNav: '#5DD6C6',
  healthNav: '#F590AB',
  cpapNav: '#B5E37A',
  weightNav: '#86B7FF',
  nutritionNav: '#B7A0FF',
  activityNav: '#62D2F2',
  workoutsNav: '#FFAF73',
  nutritionCalories: '#FF93BC',
  settingsNav: '#C3CAD3',
} as const;

// Manrope, loaded in the root layout. Android cannot synthesize weights for
// custom fonts, so each weight is its own family; set fontFamily, not fontWeight.
export const font = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

export const spacing = { xs: 4, sm: 8, md: 14, lg: 20, xl: 28 } as const;
export const radius = { sm: 12, md: 16, lg: 22, pill: 999 } as const;
export const layout = { maxWidth: 680, radius: radius.lg } as const;

export const type = {
  display: { fontSize: 30, lineHeight: 36, fontFamily: font.extrabold, letterSpacing: -0.8 },
  title: { fontSize: 19, lineHeight: 25, fontFamily: font.bold, letterSpacing: -0.3 },
  heading: { fontSize: 16, lineHeight: 22, fontFamily: font.bold, letterSpacing: -0.1 },
  eyebrow: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    fontFamily: font.bold,
  },
  micro: {
    fontSize: 11,
    lineHeight: 14,
  },
  metadata: {
    fontSize: 12,
    lineHeight: 16,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
  },
};

// Standard panel: tonal lift with a hairline edge.
export const card = {
  backgroundColor: colors.surface,
  borderColor: colors.border,
  borderWidth: 1,
  borderRadius: radius.lg,
} as const;
