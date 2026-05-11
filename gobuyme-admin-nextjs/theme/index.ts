export * from './colors';

export const spacing = {
  xs: '4px',  sm: '8px',  md: '12px', lg: '16px',
  xl: '20px', xxl: '24px', xxxl: '32px',
};

export const radius = {
  sm:   '4px',
  md:   '4px',
  lg:   '4px',
  pill: '999px',
};

export const typography = {
  h1:      { fontSize: '32px', fontWeight: 800, letterSpacing: '-0.5px' },
  h2:      { fontSize: '26px', fontWeight: 700 },
  h3:      { fontSize: '20px', fontWeight: 800 },
  body:    { fontSize: '14px', fontWeight: 400, lineHeight: 1.5 },
  bodyBold:{ fontSize: '14px', fontWeight: 700 },
  caption: { fontSize: '12px', fontWeight: 500 },
  label:   { fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' as const },
  small:   { fontSize: '11px', fontWeight: 500 },
};

export const shadows = {
  card:    '0 4px 12px rgba(0,0,0,0.18)',
  primary: '0 8px 24px rgba(255,82,27,0.35)',
  subtle:  '0 2px 6px rgba(0,0,0,0.08)',
};
