import type { CSSProperties } from 'react';
import type { MarketStatus, IndicativeSnapshot, RampResolution } from '@jet/shared';
import PriceDisplay from './PriceDisplay.js';
import Countdown from './Countdown.js';
import StatusBadge from './StatusBadge.js';

interface Props {
  question: string;
  marketStatus: MarketStatus;
  msRemaining: number;
  oracleSnapshot: IndicativeSnapshot | null;
  resolution: RampResolution | null;
  onStartNew: () => void;
}

export default function MarketView({
  question,
  marketStatus,
  msRemaining,
  oracleSnapshot,
  resolution,
  onStartNew,
}: Props) {
  return (
    <div>
      <h1 style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: '1.5rem', color: '#e0e0e0' }}>
        {question}
      </h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <StatusBadge status={marketStatus} resolution={resolution} />
        <Countdown msRemaining={msRemaining} status={marketStatus} />
      </div>

      <PriceDisplay snapshot={oracleSnapshot} />

      {resolution && (
        <div style={resolutionBox}>
          <div style={{ fontSize: '0.7rem', color: '#666', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
            SETTLEMENT  ·  RAMP_V1
          </div>
          <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
            Outcome:{' '}
            <strong style={{ color: resolution.outcome === 'YES' ? '#22c55e' : '#ef4444' }}>
              {resolution.outcome}
            </strong>
          </div>
          <div style={{ marginBottom: '0.25rem' }}>
            Resolution price:{' '}
            {(resolution.resolutionPriceCents / 100).toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 2,
            })}
          </div>
          <div style={{ color: '#555', fontSize: '0.8rem' }}>
            {resolution.partitions.length} partitions · venues: {resolution.sourcesUsed.join(', ')}
          </div>
        </div>
      )}

      <button onClick={onStartNew} style={btnStyle}>
        Start New Market
      </button>
    </div>
  );
}

const resolutionBox: CSSProperties = {
  marginTop: '1.5rem',
  marginBottom: '1.5rem',
  padding: '1rem 1.25rem',
  background: '#1a1a2e',
  border: '1px solid #2a2a4a',
  borderRadius: '8px',
};

const btnStyle: CSSProperties = {
  marginTop: '0.5rem',
  background: '#1d4ed8',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '0.65rem 1.5rem',
  cursor: 'pointer',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  fontWeight: 600,
};
