import type { CSSProperties, ReactNode } from 'react';
import { C, S, panel } from '../theme.js';

interface Props {
  title: string;
  children?: ReactNode;
  style?: CSSProperties;
}

const titleStyle: CSSProperties = {
  fontSize: 10,
  color: C.textMute,
  letterSpacing: '0.12em',
  fontWeight: 700,
  textTransform: 'uppercase',
  marginBottom: S.sm,
};

export default function Panel({ title, children, style }: Props) {
  return (
    <div style={{ ...panel, ...style }}>
      <div style={titleStyle}>{title}</div>
      {children}
    </div>
  );
}
