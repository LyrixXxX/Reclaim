export const colors = {
  background: '#0B0D0C',
  surface: '#141715',
  surfaceRaised: '#1A1E1B',
  border: '#252A26',
  text: '#F1F4EF',
  textMuted: '#A4ADA5',
  textDim: '#697169',
  accent: '#C8F15A',
  accentSoft: '#26321C',
  success: '#70D69A',
  marijuana: '#9FD28B',
  porn: '#D69BE8',
  nicotine: '#F0AE67',
  caffeine: '#84B8F4',
  danger: '#F07C76',
  habitsNav: '#63D8C6',
  healthNav: '#F47F9B',
  cpapNav: '#C8F15A',
  weightNav: '#78B7FF',
  nutritionNav: '#B98CFF',
  activityNav: '#6DD7B1',
  nutritionCalories: '#FF7AAE',
  settingsNav: '#F2B766',
} as const;

export const spacing = { xs: 4, sm: 8, md: 14, lg: 20, xl: 28 } as const;
export const layout = { maxWidth: 680, radius: 22 } as const;
export const type = {
  eyebrow: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.7,
    fontWeight: '800' as const,
  },
  micro: {
    fontSize: 10,
    lineHeight: 14,
  },
  metadata: {
    fontSize: 11,
    lineHeight: 16,
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
  },
};
