import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import type { MarketConfig, MarketResponse, Result, StartDemoResponse } from '@jet/shared';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useMarket } from './hooks/useMarket.js';
import { useOrderBook } from './hooks/useOrderBook.js';
import { useTrades } from './hooks/useTrades.js';
import { useUser } from './hooks/useUser.js';
import { usePriceHistory } from './hooks/usePriceHistory.js';
import { useSharePriceHistory } from './hooks/useSharePriceHistory.js';
import MarketPage from './components/MarketPage.js';
import { API_URL, WS_URL, DEMO_USER_ID } from './env.js';
import { C, S } from './theme.js';

export default function App() {
  const [marketId, setMarketId] = useState<string | null>(null);
  const [config, setConfig] = useState<MarketConfig | null>(null);

  const { send, lastEvent, status } = useWebSocket(WS_URL);
  const { marketStatus, msRemaining, serverTs, oracleSnapshot, resolution } = useMarket(
    marketId,
    send,
    lastEvent,
    status,
  );
  const { snapshot: orderBookSnapshot } = useOrderBook(marketId, send, lastEvent, status);
  const trades = useTrades(marketId, send, lastEvent, status);
  const {
    balance,
    position,
    openOrders,
    userResolution,
    refreshUserSnapshot,
  } = useUser(DEMO_USER_ID, marketId, API_URL, send, lastEvent, status);
  const oraclePriceHistory = usePriceHistory(marketId, API_URL, oracleSnapshot);
  const sharePriceHistory = useSharePriceHistory(marketId, API_URL, send, lastEvent, status);

  useEffect(() => {
    fetch(`${API_URL}/markets/current`)
      .then((r) => r.json())
      .then((data: Result<MarketResponse>) => {
        if (data.ok && data.market) {
          setMarketId(data.market.config.marketId);
          setConfig(data.market.config);
        }
      })
      .catch(() => {});
  }, []);

  const startDemo = useCallback(async () => {
    const res = await fetch(`${API_URL}/markets/start-demo`, { method: 'POST' });
    const data: Result<StartDemoResponse> = await res.json();
    if (data.ok && data.market) {
      setMarketId(data.market.config.marketId);
      setConfig(data.market.config);
    }
  }, []);

  return (
    <div style={{ background: C.bg, minHeight: '100vh' }}>
      <header style={headerStyle}>
        <span style={{ color: C.accent, fontWeight: 700 }}>JET</span>
        <span style={{ color: C.textMute, marginLeft: S.sm }}>PREDICTION MARKET</span>
      </header>

      {marketId && config && marketStatus ? (
        <MarketPage
          config={config}
          marketStatus={marketStatus}
          msRemaining={msRemaining}
          serverTs={serverTs}
          wsStatus={status}
          oracleSnapshot={oracleSnapshot}
          resolution={resolution}
          orderBookSnapshot={orderBookSnapshot}
          trades={trades}
          balance={balance}
          position={position}
          openOrders={openOrders}
          userResolution={userResolution}
          refreshUserSnapshot={refreshUserSnapshot}
          oraclePriceHistory={oraclePriceHistory}
          sharePriceHistory={sharePriceHistory}
          userId={DEMO_USER_ID}
          apiUrl={API_URL}
          onStartNew={() => void startDemo()}
        />
      ) : (
        <div style={emptyStyle}>
          <p style={{ color: C.textMute, marginBottom: S.lg }}>No active market.</p>
          <button onClick={() => void startDemo()} style={primaryBtn}>
            Start Demo Market
          </button>
        </div>
      )}
    </div>
  );
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: `${S.sm}px ${S.lg}px`,
  borderBottom: `1px solid ${C.border}`,
  fontSize: '0.8rem',
  letterSpacing: '0.1em',
};

const emptyStyle: CSSProperties = {
  padding: '4rem 2rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const primaryBtn: CSSProperties = {
  background: C.accent,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '0.75rem 1.75rem',
  cursor: 'pointer',
  fontSize: '0.95rem',
  fontFamily: 'inherit',
  fontWeight: 600,
};
