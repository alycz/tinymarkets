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
  PriceCents,
} from '@jet/shared';
import { C, S } from '../theme.js';
import type { WsStatus } from '../hooks/useWebSocket.js';
import type { PricePoint } from '../hooks/usePriceHistory.js';
import MarketHeader from './MarketHeader.js';
import ChartPanel from './ChartPanel.js';
import TradeTicket from './TradeTicket.js';
import AccountPanel from './AccountPanel.js';
import OrderBookPanel from './OrderBookPanel.js';
import TradesFeed from './TradesFeed.js';
import OraclePanel from './OraclePanel.js';

interface Props {
  config: MarketConfig;
  marketStatus: MarketStatus;
  msRemaining: number;
  wsStatus: WsStatus;
  oracleSnapshot: IndicativeSnapshot | null;
  resolution: RampResolution | null;
  orderBookSnapshot: OrderBookSnapshot | null;
  trades: Trade[];
  balance: Balance | null;
  position: Position | null;
  resolutionPnl: number | null;
  priceHistory: PricePoint[];
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
  wsStatus,
  oracleSnapshot,
  resolution,
  orderBookSnapshot,
  trades,
  balance,
  position,
  resolutionPnl,
  priceHistory,
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
      priceHistory={priceHistory}
      thresholdCents={config.thresholdCents}
      currentPriceCents={oracleSnapshot?.priceCents ?? null}
    />
  );

  const ticket = (
    <TradeTicket
      marketId={config.marketId}
      userId={userId}
      marketStatus={marketStatus}
      apiUrl={apiUrl}
    />
  );

  const account = (
    <AccountPanel balance={balance} position={position} contractMidCents={contractMid} />
  );

  const book = <OrderBookPanel snapshot={orderBookSnapshot} />;
  const feed = <TradesFeed trades={trades} />;
  const oracle = (
    <OraclePanel
      oracleSnapshot={oracleSnapshot}
      resolution={resolution}
      resolutionPnl={resolutionPnl}
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
      {narrow ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
          {chart}
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
