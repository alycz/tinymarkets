import { useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  MarketConfig,
  MarketStatus,
  IndicativeSnapshot,
  VenueWeightedTwapResolution,
  OrderBookSnapshot,
  Trade,
  Balance,
  Position,
  CanonicalOrder,
  Fill,
  OrderIntent,
  PriceCents,
  Shares,
  SharePricePoint,
  TimestampMs,
  UserResolutionEvent,
  UsdCents,
} from '@jet/shared';
import { C, S } from '../theme.js';
import { formatUsdCents } from '../format.js';
import type { WsStatus } from '../hooks/useWebSocket.js';
import type { PricePoint } from '../hooks/usePriceHistory.js';
import TerminalLayout from './TerminalLayout.js';
import MarketTopBar from './MarketTopBar.js';
import ChartWorkspace from './ChartWorkspace.js';
import TradeTicket from './TradeTicket.js';
import BookTradesPanel from './BookTradesPanel.js';
import BottomAccountTabs from './BottomAccountTabs.js';
import OraclePanel from './OraclePanel.js';

interface Props {
  config: MarketConfig;
  marketStatus: MarketStatus;
  msRemaining: number;
  serverTs: TimestampMs | null;
  wsStatus: WsStatus;
  openInterest: Shares | null;
  oracleSnapshot: IndicativeSnapshot | null;
  resolution: VenueWeightedTwapResolution | null;
  orderBookSnapshot: OrderBookSnapshot | null;
  trades: Trade[];
  balance: Balance | null;
  position: Position | null;
  openOrders: CanonicalOrder[];
  recentFills: Fill[];
  userResolution: UserResolutionEvent | null;
  refreshUserSnapshot: () => Promise<void>;
  recordRecentFills: (fills: Fill[]) => void;
  oraclePriceHistory: PricePoint[];
  sharePriceHistory: SharePricePoint[];
  userId: string;
  apiUrl: string;
  onStartNew: () => void;
}

export default function MarketPage({
  config,
  marketStatus,
  msRemaining,
  serverTs,
  wsStatus,
  openInterest,
  oracleSnapshot,
  resolution,
  orderBookSnapshot,
  trades,
  balance,
  position,
  openOrders,
  recentFills,
  userResolution,
  refreshUserSnapshot,
  recordRecentFills,
  oraclePriceHistory,
  sharePriceHistory,
  userId,
  apiUrl,
  onStartNew,
}: Props) {
  const [ticketSelection, setTicketSelection] = useState<{
    intent: OrderIntent;
    price: PriceCents;
    nonce: number;
  } | null>(null);

  const bestBid = orderBookSnapshot?.bids[0];
  const bestAsk = orderBookSnapshot?.asks[0];
  const contractMid: PriceCents | null =
    bestBid != null && bestAsk != null
      ? (Math.round((bestBid.yesPriceCents + bestAsk.yesPriceCents) / 2) as PriceCents)
      : null;
  const spread: PriceCents | null =
    bestBid != null && bestAsk != null
      ? (Math.max(1, bestAsk.yesPriceCents - bestBid.yesPriceCents) as PriceCents)
      : null;

  const currentPoint = sharePriceHistory.at(-1) ?? null;
  const demoVolumeCents = trades.reduce(
    (sum, trade) => sum + (trade.size as number) * (trade.yesPriceCents as number),
    0,
  ) as UsdCents;

  const topBar = (
    <MarketTopBar
      question={config.question}
      thresholdCents={config.thresholdCents}
      marketStatus={marketStatus}
      msRemaining={msRemaining}
      resolution={resolution}
      oracleSnapshot={oracleSnapshot}
      currentPoint={currentPoint}
      bestBid={bestBid?.yesPriceCents ?? null}
      bestAsk={bestAsk?.yesPriceCents ?? null}
      spread={spread}
      demoVolumeCents={demoVolumeCents}
      openInterest={openInterest}
    />
  );

  const chartWorkspace = (
    <ChartWorkspace
      sharePriceHistory={sharePriceHistory}
      oraclePriceHistory={oraclePriceHistory}
      thresholdCents={config.thresholdCents}
      currentOraclePriceCents={oracleSnapshot?.btcPriceCents ?? null}
      currentPoint={currentPoint}
      bestBid={bestBid?.yesPriceCents ?? null}
      bestAsk={bestAsk?.yesPriceCents ?? null}
      spread={spread}
    />
  );

  const ticket = (
    <TradeTicket
      marketId={config.marketId}
      userId={userId}
      marketStatus={marketStatus}
      apiUrl={apiUrl}
      balance={balance}
      position={position}
      bestBid={bestBid?.yesPriceCents ?? null}
      bestAsk={bestAsk?.yesPriceCents ?? null}
      selectedOrder={ticketSelection}
      onOrderAccepted={refreshUserSnapshot}
      onFillsAccepted={recordRecentFills}
    />
  );

  const bookTrades = (
    <BookTradesPanel
      snapshot={orderBookSnapshot}
      trades={trades}
      onSelectLevel={(level, side) => {
        setTicketSelection({
          intent: side === 'ask' ? 'BUY_YES' : 'SELL_YES',
          price: level.yesPriceCents,
          nonce: Date.now(),
        });
      }}
    />
  );

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

  const bottomTabs = (
    <BottomAccountTabs
      balance={balance}
      position={position}
      question={config.question}
      contractMidCents={contractMid}
      openOrders={openOrders}
      recentFills={recentFills}
      trades={trades}
      resolution={resolution}
      userResolution={userResolution}
      userId={userId}
      apiUrl={apiUrl}
      onRefreshUser={refreshUserSnapshot}
      oraclePanel={oracle}
    />
  );

  const startNew = (
    <div style={{ textAlign: 'right', marginTop: S.sm }}>
      <button onClick={onStartNew} style={newMarketBtn}>
        Start New Market
      </button>
    </div>
  );

  const resolvingBanner =
    marketStatus === 'resolving' ? (
        <div style={resolvingStyle}>
          <strong>Resolving</strong>
          <span>Final oracle TWAP in progress. Trading disabled.</span>
        </div>
      ) : undefined;

  const resolutionBanner = resolution ? (
        <ResolutionBanner
          resolution={resolution}
          thresholdCents={config.thresholdCents}
          userResolution={userResolution}
        />
      ) : undefined;

  return (
    <TerminalLayout
      topBar={topBar}
      resolvingBanner={resolvingBanner}
      resolutionBanner={resolutionBanner}
      chartWorkspace={chartWorkspace}
      bookTrades={bookTrades}
      tradeTicket={ticket}
      bottomTabs={bottomTabs}
      footerAction={marketStatus === 'resolved' ? startNew : undefined}
    />
  );
}

function ResolutionBanner({
  resolution,
  thresholdCents,
  userResolution,
}: {
  resolution: VenueWeightedTwapResolution;
  thresholdCents: UsdCents;
  userResolution: UserResolutionEvent | null;
}) {
  const pnlCents = userResolution?.pnlCents ?? 0;
  const payoutCents = userResolution?.payoutCents ?? (0 as UsdCents);
  const netAtResolution = userResolution?.netAtResolution ?? 0;
  const outcomeColor = resolution.outcome === 'YES' ? C.yes : C.no;
  const userWon =
    userResolution && netAtResolution !== 0
      ? (resolution.outcome === 'YES' && netAtResolution > 0) ||
        (resolution.outcome === 'NO' && netAtResolution < 0)
      : null;

  return (
    <div style={{ ...resolutionStyle, borderColor: outcomeColor + '66' }}>
      <ResolutionStat label="Final Oracle" value={formatUsdCents(resolution.resolutionPriceCents)} />
      <ResolutionStat label="Strike" value={formatUsdCents(thresholdCents)} />
      <ResolutionStat label="Your Position" value={formatResolvedPosition(netAtResolution)} />
      <ResolutionStat
        label="Your Result"
        value={userWon === null ? 'N/A' : userWon ? 'Won' : 'Lost'}
        color={userWon === null ? C.textMute : userWon ? C.yes : C.no}
        emphasize
      />
      <ResolutionStat label="Payout" value={formatUsdCents(payoutCents)} emphasize />
      <ResolutionStat label="Settled" value={titleCaseOutcome(resolution.outcome)} color={outcomeColor} emphasize />
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
    <div style={{ textAlign: 'center' }}>
      <div style={resolutionLabel}>{label}</div>
      <div style={{ color: color ?? C.text, fontSize: emphasize ? 16 : 14, fontWeight: emphasize ? 800 : 700 }}>
        {value}
      </div>
    </div>
  );
}

function formatResolvedPosition(net: number): string {
  if (net > 0) return `Long ${net} Above`;
  if (net < 0) return `Long ${Math.abs(net)} Below`;
  return 'N/A';
}

function titleCaseOutcome(outcome: 'YES' | 'NO'): string {
  return outcome === 'YES' ? 'Above' : 'Below';
}

const resolutionStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  alignItems: 'center',
  gap: S.xl,
  background: C.panel,
  borderBottom: `1px solid ${C.border}`,
  borderRadius: 0,
  padding: `${S.md}px ${S.lg}px`,
};

const resolvingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: S.sm,
  flexWrap: 'wrap',
  background: C.warnSoft,
  borderBottom: `1px solid ${C.warn}44`,
  borderRadius: 0,
  padding: `${S.sm}px ${S.md}px`,
  color: C.text,
  fontSize: 12,
};

const resolutionLabel: CSSProperties = {
  color: C.textMute,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.02em',
  marginBottom: S.xs,
};

const newMarketBtn: CSSProperties = {
  background: C.accent,
  color: '#ffffff',
  border: 'none',
  borderRadius: 0,
  padding: '0.75rem 1.6rem',
  cursor: 'pointer',
  fontSize: 14,
  fontFamily: 'inherit',
  fontWeight: 700,
  letterSpacing: '0.02em',
};
