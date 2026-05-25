import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import type {
  MarketConfig,
  MarketStatus,
  IndicativeSnapshot,
  RampResolution,
  OrderBookSnapshot,
  Trade,
  Balance,
  Position,
  CanonicalOrder,
  PriceCents,
  SharePricePoint,
  TimestampMs,
  UserResolutionEvent,
  UsdCents,
} from '@jet/shared';
import { C, S } from '../theme.js';
import { formatUsdCents } from '../format.js';
import type { WsStatus } from '../hooks/useWebSocket.js';
import type { PricePoint } from '../hooks/usePriceHistory.js';
import MarketHeader from './MarketHeader.js';
import ChartPanel from './ChartPanel.js';
import OracleReferencePanel from './OracleReferencePanel.js';
import TradeTicket from './TradeTicket.js';
import AccountPanel from './AccountPanel.js';
import OrderBookPanel from './OrderBookPanel.js';
import TradesFeed from './TradesFeed.js';
import OraclePanel from './OraclePanel.js';

interface Props {
  config: MarketConfig;
  marketStatus: MarketStatus;
  msRemaining: number;
  serverTs: TimestampMs | null;
  wsStatus: WsStatus;
  oracleSnapshot: IndicativeSnapshot | null;
  resolution: RampResolution | null;
  orderBookSnapshot: OrderBookSnapshot | null;
  trades: Trade[];
  balance: Balance | null;
  position: Position | null;
  openOrders: CanonicalOrder[];
  userResolution: UserResolutionEvent | null;
  refreshUserSnapshot: () => Promise<void>;
  oraclePriceHistory: PricePoint[];
  sharePriceHistory: SharePricePoint[];
  userId: string;
  apiUrl: string;
  onStartNew: () => void;
}

function useNarrow(breakpoint = 1100) {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < breakpoint,
  );
  useEffect(() => {
    const h = () => setNarrow(window.innerWidth < breakpoint);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [breakpoint]);
  return narrow;
}

export default function MarketPage({
  config,
  marketStatus,
  msRemaining,
  serverTs,
  wsStatus,
  oracleSnapshot,
  resolution,
  orderBookSnapshot,
  trades,
  balance,
  position,
  openOrders,
  userResolution,
  refreshUserSnapshot,
  oraclePriceHistory,
  sharePriceHistory,
  userId,
  apiUrl,
  onStartNew,
}: Props) {
  const narrow = useNarrow();

  const bestBid = orderBookSnapshot?.bids[0];
  const bestAsk = orderBookSnapshot?.asks[0];
  const contractMid: PriceCents | null =
    bestBid != null && bestAsk != null
      ? (Math.round((bestBid.yesPriceCents + bestAsk.yesPriceCents) / 2) as PriceCents)
      : null;

  const header = (
    <MarketHeader
      question={config.question}
      thresholdCents={config.thresholdCents}
      marketStatus={marketStatus}
      msRemaining={msRemaining}
      wsStatus={wsStatus}
      resolution={resolution}
    />
  );

  const chart = (
    <ChartPanel
      sharePriceHistory={sharePriceHistory}
      currentPoint={sharePriceHistory.at(-1) ?? null}
      bestBid={bestBid?.yesPriceCents ?? null}
      bestAsk={bestAsk?.yesPriceCents ?? null}
    />
  );

  const oracleReference = (
    <OracleReferencePanel
      priceHistory={oraclePriceHistory}
      thresholdCents={config.thresholdCents}
      currentPriceCents={oracleSnapshot?.btcPriceCents ?? null}
    />
  );

  const ticket = (
    <TradeTicket
      marketId={config.marketId}
      userId={userId}
      marketStatus={marketStatus}
      apiUrl={apiUrl}
      onOrderAccepted={refreshUserSnapshot}
    />
  );

  const account = (
    <AccountPanel
      balance={balance}
      position={position}
      contractMidCents={contractMid}
      openOrders={openOrders}
      userId={userId}
      apiUrl={apiUrl}
      onRefreshUser={refreshUserSnapshot}
    />
  );

  const book = <OrderBookPanel snapshot={orderBookSnapshot} />;
  const feed = <TradesFeed trades={trades} />;
  const oracle = (
    <OraclePanel
      oracleSnapshot={oracleSnapshot}
      resolution={resolution}
      marketId={config.marketId}
      marketStatus={marketStatus}
      msRemaining={msRemaining}
      serverTs={serverTs}
      apiUrl={apiUrl}
    />
  );

  const startNew = (
    <div style={{ textAlign: 'right', marginTop: S.sm }}>
      <button onClick={onStartNew} style={newMarketBtn}>
        Start New Market
      </button>
    </div>
  );

  return (
    <div style={outerStyle}>
      {header}
      {resolution && (
        <ResolutionBanner
          resolution={resolution}
          thresholdCents={config.thresholdCents}
          userResolution={userResolution}
        />
      )}
      {narrow ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
          {chart}
          {oracleReference}
          {ticket}
          {account}
          {book}
          {feed}
          {oracle}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
          <div style={twoColStyle}>
            {chart}
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
              {oracleReference}
              {ticket}
              {account}
            </div>
          </div>
          <div style={twoColStyle}>
            {book}
            {feed}
          </div>
          {oracle}
        </div>
      )}
      {marketStatus === 'resolved' && startNew}
    </div>
  );
}

function ResolutionBanner({
  resolution,
  thresholdCents,
  userResolution,
}: {
  resolution: RampResolution;
  thresholdCents: UsdCents;
  userResolution: UserResolutionEvent | null;
}) {
  const pnlCents = userResolution?.pnlCents ?? 0;
  const payoutCents = userResolution?.payoutCents ?? (0 as UsdCents);
  const netAtResolution = userResolution?.netAtResolution ?? 0;
  const outcomeColor = resolution.outcome === 'YES' ? C.yes : C.no;

  return (
    <div style={{ ...resolutionStyle, borderColor: outcomeColor + '66' }}>
      <div>
        <div style={resolutionLabel}>Resolved</div>
        <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 900, color: outcomeColor }}>
          {resolution.outcome}
        </div>
      </div>
      <ResolutionStat label="RAMP_V1 reference price" value={formatUsdCents(resolution.resolutionPriceCents)} />
      <ResolutionStat label="Strike" value={formatUsdCents(thresholdCents)} />
      <ResolutionStat label="Your position at resolution" value={formatResolvedPosition(netAtResolution)} />
      <ResolutionStat label="Payout" value={formatUsdCents(payoutCents)} emphasize />
      <ResolutionStat
        label="Final PnL"
        value={`${pnlCents >= 0 ? '+' : ''}${formatUsdCents(pnlCents as UsdCents)}`}
        color={pnlCents >= 0 ? C.yes : C.bad}
        emphasize
      />
    </div>
  );
}

function ResolutionStat({
  label,
  value,
  color,
  emphasize,
}: {
  label: string;
  value: string;
  color?: string;
  emphasize?: boolean;
}) {
  return (
    <div style={{ minWidth: 132 }}>
      <div style={resolutionLabel}>{label}</div>
      <div style={{ color: color ?? C.text, fontSize: emphasize ? 16 : 14, fontWeight: emphasize ? 800 : 700 }}>
        {value}
      </div>
    </div>
  );
}

function formatResolvedPosition(net: number): string {
  if (net > 0) return `Long ${net} YES`;
  if (net < 0) return `Long ${Math.abs(net)} NO`;
  return 'Flat';
}

const outerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: S.md,
  padding: S.md,
  background: C.bg,
  minHeight: '100vh',
};

const twoColStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 1fr',
  gap: S.md,
};

const resolutionStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: S.lg,
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: S.lg,
};

const resolutionLabel: CSSProperties = {
  color: C.textMute,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: S.xs,
};

const newMarketBtn: CSSProperties = {
  background: C.accent,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '0.65rem 1.5rem',
  cursor: 'pointer',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  fontWeight: 600,
};
