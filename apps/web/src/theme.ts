import type { CSSProperties } from 'react';

export const C = {
  bg:         '#000000',
  bgAlt:      '#050608',
  panel:      '#0a0c10',
  panelAlt:   '#13161d',
  panelSoft:  '#070809',
  elevated:   '#14181f',

  border:     '#1a1d24',
  borderSoft: '#2a2e37',
  borderHair: '#0d1015',

  text:       '#ffffff',
  textDim:    '#a8aeba',
  textMute:   '#6b7280',

  yes:        '#1aa64a',
  no:         '#f43f5e',
  yesSoft:    'rgba(26,166,74,0.16)',
  noSoft:     'rgba(244,63,94,0.14)',

  accent:     '#2563eb',
  accentSoft: 'rgba(37,99,235,0.18)',
  oracle:     '#22d3ee',
  warn:       '#f59e0b',
  warnSoft:   'rgba(245,158,11,0.14)',
  ok:         '#1aa64a',
  bad:        '#f43f5e',

  btc:        '#f7931a',
  btcSoft:    'rgba(247,147,26,0.16)',
};

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const R = { sm: 0, md: 0, lg: 0, pill: 0 };

export const sans =
  '"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
// `mono` is aliased to Inter — every numeric value renders in Inter with
// `fontVariantNumeric: 'tabular-nums'` to keep columns aligned.
export const mono = sans;

export const T = {
  eyebrow: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.04em',
    color: C.textDim,
  } satisfies CSSProperties,
  body: { fontSize: 12, fontWeight: 500, color: C.text } satisfies CSSProperties,
  bodyDim: { fontSize: 12, fontWeight: 500, color: C.textDim } satisfies CSSProperties,
  numXs: {
    fontFamily: mono,
    fontVariantNumeric: 'tabular-nums' as const,
    fontSize: 11,
    fontWeight: 600,
  } satisfies CSSProperties,
  numSm: {
    fontFamily: mono,
    fontVariantNumeric: 'tabular-nums' as const,
    fontSize: 12,
    fontWeight: 700,
    color: C.text,
  } satisfies CSSProperties,
  numMd: {
    fontFamily: mono,
    fontVariantNumeric: 'tabular-nums' as const,
    fontSize: 14,
    fontWeight: 700,
    color: C.text,
  } satisfies CSSProperties,
  numLg: {
    fontFamily: mono,
    fontVariantNumeric: 'tabular-nums' as const,
    fontSize: 22,
    fontWeight: 800,
    color: C.text,
  } satisfies CSSProperties,
  numXl: {
    fontFamily: mono,
    fontVariantNumeric: 'tabular-nums' as const,
    fontSize: 30,
    fontWeight: 800,
    color: C.text,
    letterSpacing: '-0.01em',
  } satisfies CSSProperties,
  h1: {
    fontSize: 18,
    fontWeight: 800,
    color: '#ffffff',
    letterSpacing: '-0.01em',
  } satisfies CSSProperties,
  h2: { fontSize: 14, fontWeight: 700, color: '#ffffff' } satisfies CSSProperties,
  h3: {
    fontSize: 12,
    fontWeight: 700,
    color: '#ffffff',
    letterSpacing: '0.02em',
  } satisfies CSSProperties,
};

export const panel: CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 0,
  padding: S.md,
  boxSizing: 'border-box',
};

export const panelHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${S.sm}px ${S.md}px`,
  borderBottom: `1px solid ${C.border}`,
  background: C.panelSoft,
  minHeight: 36,
  gap: S.md,
};

export const chip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: S.xs,
  padding: '3px 8px',
  borderRadius: 0,
  fontSize: 11,
  fontWeight: 700,
  fontFamily: mono,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1.2,
};
