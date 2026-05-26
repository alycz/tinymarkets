import type { CSSProperties, ReactNode } from 'react';
import { C, S, T } from '../theme.js';

interface Props {
  title: string;
  children?: ReactNode;
  style?: CSSProperties;
  bodyPad?: boolean;
  right?: ReactNode;
}

const containerStyle: CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 0,
  boxSizing: 'border-box',
  overflow: 'hidden',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${S.sm}px ${S.md}px`,
  borderBottom: `1px solid ${C.border}`,
  background: C.panelSoft,
  minHeight: 36,
  gap: S.md,
};

export default function Panel({ title, children, style, bodyPad = true, right }: Props) {
  return (
    <div style={{ ...containerStyle, ...style }}>
      <div style={headerStyle}>
        <span style={T.h3}>{title}</span>
        {right}
      </div>
      <div style={bodyPad ? { padding: S.md } : undefined}>{children}</div>
    </div>
  );
}
