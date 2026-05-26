import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { C } from '../theme.js';

interface Props {
  topBar: ReactNode;
  resolvingBanner?: ReactNode;
  resolutionBanner?: ReactNode;
  chartWorkspace: ReactNode;
  bookTrades: ReactNode;
  tradeTicket: ReactNode;
  bottomTabs: ReactNode;
  footerAction?: ReactNode;
}

export default function TerminalLayout({
  topBar,
  resolvingBanner,
  resolutionBanner,
  chartWorkspace,
  bookTrades,
  tradeTicket,
  bottomTabs,
  footerAction,
}: Props) {
  const mode = useViewportMode();

  return (
    <div style={outerStyle}>
      {resolvingBanner}
      {resolutionBanner}
      {mode === 'desktop' ? (
        <div style={desktopGridStyle}>
          <div style={{ ...cellStyle, gridArea: 'topbar' }}>{topBar}</div>
          <div style={{ ...cellStyle, gridArea: 'chart' }}>{chartWorkspace}</div>
          <div style={{ ...cellStyle, gridArea: 'book' }}>{bookTrades}</div>
          <div style={{ ...cellStyle, gridArea: 'ticket' }}>{tradeTicket}</div>
        </div>
      ) : (
        <div style={stackStyle}>
          {topBar}
          {chartWorkspace}
          {tradeTicket}
          {bookTrades}
        </div>
      )}
      <div style={bottomTabsCellStyle}>{bottomTabs}</div>
      {footerAction}
    </div>
  );
}

function useViewportMode(): 'desktop' | 'stacked' {
  const [mode, setMode] = useState<'desktop' | 'stacked'>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1180 ? 'desktop' : 'stacked',
  );

  useEffect(() => {
    const onResize = () => setMode(window.innerWidth >= 1180 ? 'desktop' : 'stacked');
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return mode;
}

const outerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  padding: 0,
  background: C.bg,
  minHeight: 'calc(100vh - 48px)',
};

const desktopGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(560px, 1fr) 320px 340px',
  gridTemplateRows: 'auto 1fr',
  gridTemplateAreas: `
    "topbar topbar topbar"
    "chart  book   ticket"
  `,
  gap: 0,
  minHeight: 600,
};

const cellStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
};

const stackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
};

const bottomTabsCellStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};
