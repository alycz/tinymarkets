import type { CSSProperties } from 'react';

export const C = {
  bg:       '#0b0d12',
  panel:    '#11141b',
  panelAlt: '#161a23',
  border:   '#1f2330',
  text:     '#e5e7eb',
  textDim:  '#8b93a6',
  textMute: '#5b6275',
  yes:      '#22c55e',
  no:       '#ef4444',
  accent:   '#3b82f6',
  warn:     '#f59e0b',
  ok:       '#22c55e',
  bad:      '#ef4444',
};

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const panel: CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: S.md,
};
