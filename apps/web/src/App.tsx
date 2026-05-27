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
import { C, S, T, sans } from './theme.js';

export default function App() {
  const [marketId, setMarketId] = useState<string | null>(null);
  const [config, setConfig] = useState<MarketConfig | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [slowLaunch, setSlowLaunch] = useState(false);

  const { send, events, status } = useWebSocket(WS_URL);
  const { marketStatus, msRemaining, serverTs, openInterest, oracleSnapshot, resolution } = useMarket(
    marketId,
    API_URL,
    send,
    events,
    status,
  );
  const { snapshot: orderBookSnapshot } = useOrderBook(marketId, send, events, status);
  const trades = useTrades(marketId, send, events, status);
  const {
    balance,
    position,
    openOrders,
    recentFills,
    userResolution,
    refreshUserSnapshot,
    recordRecentFills,
  } = useUser(DEMO_USER_ID, marketId, API_URL, send, events, status);
  const oraclePriceHistory = usePriceHistory(marketId, API_URL, oracleSnapshot);
  const sharePriceHistory = useSharePriceHistory(marketId, API_URL, send, events, status);

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

  const showStartNew = marketStatus === 'resolved' || resolution != null;

  const startDemo = useCallback(async () => {
    if (launching) return;
    setLaunching(true);
    setLaunchError(null);
    setSlowLaunch(false);
    const slowTimer = setTimeout(() => setSlowLaunch(true), 10_000);
    const finishWithError = (message: string): void => {
      clearTimeout(slowTimer);
      setSlowLaunch(false);
      setLaunching(false);
      setLaunchError(message);
    };
    try {
      const res = await fetch(`${API_URL}/markets/start-demo`, { method: 'POST' });
      const bodyText = await res.text();
      let data: Result<StartDemoResponse> | null = null;
      try {
        data = bodyText ? (JSON.parse(bodyText) as Result<StartDemoResponse>) : null;
      } catch {
        data = null;
      }
      const ok = res.ok && data !== null && data.ok && data.market != null;
      if (!ok) {
        const backendMsg =
          data && data.ok === false ? data.error.message : bodyText.trim().slice(0, 200);
        const message = backendMsg
          ? `Unable to start market. Please try again.\n${backendMsg}`
          : 'Unable to start market. Please try again.';
        finishWithError(message);
        return;
      }
      // Success: keep `launching` true until `marketStatus` arrives via WS,
      // so the launch panel doesn't briefly flash back to its default state
      // between the REST response and the first market snapshot.
      const okData = data as Extract<Result<StartDemoResponse>, { ok: true }>;
      clearTimeout(slowTimer);
      setMarketId(okData.market.config.marketId);
      setConfig(okData.market.config);
    } catch {
      finishWithError('Unable to start market. Please try again.');
    }
  }, [launching]);

  useEffect(() => {
    if (launching && marketId && config && marketStatus) {
      setLaunching(false);
      setSlowLaunch(false);
    }
  }, [launching, marketId, config, marketStatus]);

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: sans, color: C.text }}>
      <header style={headerStyle}>
        <div style={brandRowStyle}>
          <img src="/tiny-logo.png" alt="TINY" style={logoStyle} />
          <nav style={navStyle}>
            <a href="#" style={navItemActiveStyle}>
              Trade
            </a>
          </nav>
        </div>
        {showStartNew && (
          <div style={headerLaunchWrapStyle}>
            {launchError && <span style={headerErrorStyle}>{launchError}</span>}
            <button
              onClick={() => void startDemo()}
              disabled={launching}
              style={{
                ...headerNewMarketBtn,
                opacity: launching ? 0.6 : 1,
                cursor: launching ? 'not-allowed' : 'pointer',
              }}
            >
              {launching ? 'Launching Market...' : 'Start New Market'}
            </button>
          </div>
        )}
      </header>

      {marketId && config && marketStatus ? (
        <MarketPage
          config={config}
          marketStatus={marketStatus}
          msRemaining={msRemaining}
          serverTs={serverTs}
          wsStatus={status}
          openInterest={openInterest}
          oracleSnapshot={oracleSnapshot}
          resolution={resolution}
          orderBookSnapshot={orderBookSnapshot}
          trades={trades}
          balance={balance}
          position={position}
          openOrders={openOrders}
          recentFills={recentFills}
          userResolution={userResolution}
          refreshUserSnapshot={refreshUserSnapshot}
          recordRecentFills={recordRecentFills}
          oraclePriceHistory={oraclePriceHistory}
          sharePriceHistory={sharePriceHistory}
          userId={DEMO_USER_ID}
          apiUrl={API_URL}
        />
      ) : (
        <div style={emptyStyle}>
          <div style={launchPanelStyle}>
            <div style={launchEyebrowStyle}>BTC Binary Terminal</div>
            <div style={launchTitleStyle}>No Active Market</div>
            <p style={launchCopyStyle}>
              Start A Short-Duration BTC/USD Market
              <br />
              To Open The Live Trading Workspace.
            </p>
            <button
              onClick={() => void startDemo()}
              disabled={launching}
              style={{
                ...primaryBtn,
                opacity: launching ? 0.6 : 1,
                cursor: launching ? 'not-allowed' : 'pointer',
              }}
            >
              {launching ? 'Launching Market...' : 'Start Demo Market'}
            </button>
            {launching && (
              <div style={launchHelperStyle}>
                Starting demo market. This can take a few seconds if the API is waking up.
                {slowLaunch && (
                  <div style={launchHelperEmphStyle}>Still launching — please wait.</div>
                )}
              </div>
            )}
            {launchError && (
              <div style={launchErrorStyle}>
                {launchError.split('\n').map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `0 ${S.lg}px`,
  borderBottom: `1px solid ${C.border}`,
  background: C.bg,
  height: 48,
};

const brandRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: S.xl,
  height: '100%',
};

const logoStyle: CSSProperties = {
  height: 22,
  display: 'block',
};

const navStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 0,
  height: '100%',
};

const navItemActiveStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: `0 ${S.sm}px`,
  color: '#ffffff',
  fontSize: 13,
  fontWeight: 700,
  textDecoration: 'none',
  borderBottom: `2px solid ${C.accent}`,
  marginBottom: -1,
  letterSpacing: '0.02em',
};

const headerNewMarketBtn: CSSProperties = {
  background: C.accent,
  color: '#ffffff',
  border: 'none',
  borderRadius: 0,
  padding: '0.45rem 0.9rem',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'inherit',
  fontWeight: 700,
  letterSpacing: '0.02em',
};

const emptyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 'calc(100vh - 48px)',
  padding: `${S.xl}px ${S.lg}px`,
};

const launchPanelStyle: CSSProperties = {
  width: 'min(440px, 100%)',
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 0,
  padding: S.xl,
  textAlign: 'center',
  boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
};

const launchEyebrowStyle: CSSProperties = {
  ...T.eyebrow,
  color: C.accent,
};

const launchTitleStyle: CSSProperties = {
  ...T.h1,
  fontSize: 24,
  marginTop: S.sm,
};

const launchCopyStyle: CSSProperties = {
  color: C.textDim,
  fontSize: 13,
  lineHeight: 1.5,
  margin: `${S.sm}px 0 ${S.lg}px`,
};

const primaryBtn: CSSProperties = {
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

const launchHelperStyle: CSSProperties = {
  marginTop: S.sm,
  color: C.textDim,
  fontSize: 12,
  lineHeight: 1.5,
};

const launchHelperEmphStyle: CSSProperties = {
  marginTop: 4,
  color: C.text,
};

const launchErrorStyle: CSSProperties = {
  marginTop: S.sm,
  color: C.bad,
  fontSize: 12,
};

const headerLaunchWrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: S.sm,
};

const headerErrorStyle: CSSProperties = {
  color: C.bad,
  fontSize: 11,
};
