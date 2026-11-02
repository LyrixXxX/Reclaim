// Reclaim design tokens. Surfaces step up in lightness; section colors share
// one saturation/lightness band so no single area shouts over the others.
export const colors = {
  background: '#0A0B0C',
  surface: '#131517',
  surfaceRaised: '#1B1E21',
  border: '#24282C',
  borderStrong: '#33383E',
  text: '#F3F5F4',
  textMuted: '#A3AAA8',
  textDim: '#6E7573',
  accent: '#C5EB63',
  accentSoft: '#232D1B',
  success: '#6FCF97',
  marijuana: '#9CCB8A',
  porn: '#CD9EE0',
  nicotine: '#E8AE70',
  caffeine: '#88B6EC',
  danger: '#EE7F79',
  habitsNav: '#62CDBE',
  healthNav: '#EE869F',
  cpapNav: '#C5EB63',
  weightNav: '#7FB4F2',
  nutritionNav: '#B297F2',
  activityNav: '#6DCEAB',
  workoutsNav: '#4CCBD4',
  nutritionCalories: '#F08AB2',
  settingsNav: '#E8B871',
} as const;

export const spacing = { xs: 4, sm: 8, md: 14, lg: 20, xl: 28 } as const;
export const radius = { sm: 10, md: 14, lg: 18, pill: 999 } as const;
export const layout = { maxWidth: 680, radius: radius.lg } as const;

// Weights stay at 600/700: heavier faces read as shouting on dark surfaces.
export const type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.4 },
  title: { fontSize: 19, lineHeight: 25, fontWeight: '700' as const, letterSpacing: -0.2 },
  heading: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  eyebrow: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    fontWeight: '700' as const,
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

// Neutral card used for every panel; section color goes on accents, not the frame.
export const card = {
  backgroundColor: colors.surface,
  borderColor: colors.border,
  borderWidth: 1,
  borderRadius: radius.lg,
} as const;
