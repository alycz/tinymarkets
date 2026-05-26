import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PriceCents, SharePricePoint, UsdCents } from '@jet/shared';
import { C } from '../theme.js';
import type { PricePoint } from '../hooks/usePriceHistory.js';
import ChartPanel from './ChartPanel.js';
import OracleReferencePanel from './OracleReferencePanel.js';

interface Props {
  sharePriceHistory: SharePricePoint[];
  oraclePriceHistory: PricePoint[];
  thresholdCents: UsdCents;
  currentOraclePriceCents: UsdCents | null;
  currentPoint: SharePricePoint | null;
  bestBid: PriceCents | null;
  bestAsk: PriceCents | null;
  spread: PriceCents | null;
}

export default function ChartWorkspace({
  sharePriceHistory,
  oraclePriceHistory,
  thresholdCents,
  currentOraclePriceCents,
  currentPoint,
  bestBid,
  bestAsk,
  spread,
}: Props) {
  const compact = useCompactCharts();
  const height = compact ? 240 : 460;

  return (
    <section style={workspaceStyle}>
      <div style={compact ? stackChartsStyle : splitChartsStyle}>
        <ChartPanel
          key={`prediction-${height}`}
          sharePriceHistory={sharePriceHistory}
          currentPoint={currentPoint}
          bestBid={bestBid}
          bestAsk={bestAsk}
          spread={spread}
          height={height}
        />
        <OracleReferencePanel
          key={`oracle-${height}`}
          priceHistory={oraclePriceHistory}
          thresholdCents={thresholdCents}
          currentPriceCents={currentOraclePriceCents}
          height={height}
        />
      </div>
    </section>
  );
}

function useCompactCharts(): boolean {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900);
  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return compact;
}

const workspaceStyle: CSSProperties = {
  background: C.panel,
  borderRight: `1px solid ${C.border}`,
  height: '100%',
  minHeight: 0,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const splitChartsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 0,
  padding: 0,
  minHeight: 0,
  flex: 1,
};

const stackChartsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  padding: 0,
  minHeight: 0,
  flex: 1,
};
