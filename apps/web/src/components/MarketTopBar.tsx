import type { CSSProperties } from 'react';
import type {
  IndicativeSnapshot,
  MarketStatus,
  PriceCents,
  Shares,
  SharePricePoint,
  UsdCents,
  VenueWeightedTwapResolution,
} from '@jet/shared';
import { C, S, T, mono } from '../theme.js';
import { formatUsdCents } from '../format.js';

interface Props {
  question: string;
  thresholdCents: UsdCents;
  marketStatus: MarketStatus;
  msRemaining: number;
  resolution: VenueWeightedTwapResolution | null;
  oracleSnapshot: IndicativeSnapshot | null;
  currentPoint: SharePricePoint | null;
  bestBid: PriceCents | null;
  bestAsk: PriceCents | null;
  spread: PriceCents | null;
  demoVolumeCents: UsdCents;
  openInterest: Shares | null;
}

export default function MarketTopBar({
  question: _question,
  thresholdCents,
  marketStatus: _marketStatus,
  msRemaining,
  resolution: _resolution,
  oracleSnapshot: _oracleSnapshot,
  currentPoint: _currentPoint,
  bestBid: _bestBid,
  bestAsk: _bestAsk,
  spread: _spread,
  demoVolumeCents: _demoVolumeCents,
  openInterest: _openInterest,
}: Props) {
  return (
    <div style={barStyle}>
      <div style={titleBlockStyle}>
        <div style={titleRowStyle}>
          <span style={btcGlyphStyle}>₿</span>
          <h1 style={titleStyle}>
            BTC Above or Below {formatUsdCents(thresholdCents)} in{' '}
            <span style={countdownInlineStyle}>{formatSecondsCountdown(msRemaining)}</span>?
          </h1>
        </div>
      </div>
    </div>
  );
}

function formatSecondsCountdown(ms: number): string {
  const total = Math.max(0, ms);
  if (total >= 60_000) {
    const totalSec = Math.ceil(total / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }
  const seconds = total / 1000;
  return `${seconds.toFixed(2)}s`;
}

const barStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  background: C.panel,
  borderBottom: `1px solid ${C.border}`,
  minHeight: 80,
};

const titleBlockStyle: CSSProperties = {
  padding: `${S.md}px ${S.lg}px`,
  display: 'flex',
  alignItems: 'center',
  flex: '1 1 auto',
  minWidth: 0,
};

const titleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: S.md,
};

const btcGlyphStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 40,
  borderRadius: '50%',
  background: C.btc,
  color: '#ffffff',
  fontFamily: mono,
  fontWeight: 800,
  fontSize: 22,
  lineHeight: 1,
  flexShrink: 0,
};

const titleStyle: CSSProperties = {
  ...T.h1,
  fontSize: 24,
  lineHeight: 1.2,
  margin: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const countdownInlineStyle: CSSProperties = {
  fontFamily: mono,
  fontVariantNumeric: 'tabular-nums',
  color: '#ffffff',
  fontWeight: 800,
};
