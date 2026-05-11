import { dark, light, Theme } from './colors';
export * from './colors';

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
};

export const radius = {
  sm:   4,
  md:   4,
  lg:   4,
  pill: 999,
  circle: 9999,
};

export const typography = {
  h1:       { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2:       { fontSize: 26, fontWeight: '700' as const },
  h3:       { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.5 },
  h4:       { fontSize: 20, fontWeight: '700' as const },
  h5:       { fontSize: 17, fontWeight: '600' as const },
  body:     { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '700' as const },
  caption:  { fontSize: 13, fontWeight: '500' as const },
  label:    { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.5, textTransform: 'uppercase' as const },
  small:    { fontSize: 11, fontWeight: '500' as const },
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 5,
  },
  primaryGlow: (color = '#FF521B') => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  }),
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
};

export { dark, light };
export type { Theme };
