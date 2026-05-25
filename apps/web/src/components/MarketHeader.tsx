import type { CSSProperties } from 'react';
import type { MarketStatus, VenueWeightedTwapResolution, UsdCents } from '@jet/shared';
import { C, S } from '../theme.js';
import { formatUsdCents } from '../format.js';
import StatusBadge from './StatusBadge.js';
import Countdown from './Countdown.js';
import type { WsStatus } from '../hooks/useWebSocket.js';

interface Props {
  question: string;
  thresholdCents: UsdCents;
  marketStatus: MarketStatus;
  msRemaining: number;
  wsStatus: WsStatus;
  resolution: VenueWeightedTwapResolution | null;
}

export default function MarketHeader({
  question,
  thresholdCents,
  marketStatus,
  msRemaining,
  wsStatus,
  resolution,
}: Props) {
  return (
    <div style={wrapper}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={labelStyle}>BINARY PREDICTION MARKET</div>
        <h1 style={questionStyle}>{question}</h1>
        <div style={{ fontSize: 13, color: C.textDim }}>
          Strike: <strong style={{ color: C.text }}>{formatUsdCents(thresholdCents)}</strong>
        </div>
      </div>
      <div style={rightSide}>
        <StatusBadge status={marketStatus} resolution={resolution} />
        <Countdown msRemaining={msRemaining} status={marketStatus} />
        <WsDot status={wsStatus} />
      </div>
    </div>
  );
}

function WsDot({ status }: { status: WsStatus }) {
  const color =
    status === 'connected' ? C.ok : status === 'connecting' ? C.warn : C.textMute;
  return (
    <div title={`WS ${status}`} style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
  );
}

const wrapper: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: S.lg,
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: S.lg,
};

const labelStyle: CSSProperties = {
  fontSize: 10,
  color: C.textMute,
  letterSpacing: '0.12em',
  fontWeight: 700,
  textTransform: 'uppercase',
  marginBottom: S.xs,
};

const questionStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: C.text,
  margin: `${S.xs}px 0 ${S.sm}px`,
  lineHeight: 1.3,
};

const rightSide: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: S.sm,
  flexShrink: 0,
};
