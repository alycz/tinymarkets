import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import type { MarketState } from '@jet/shared';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useMarket } from './hooks/useMarket.js';
import MarketView from './components/MarketView.js';

const API_URL = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3001';
const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';

export default function App() {
  const [marketId, setMarketId] = useState<string | null>(null);

  const { send, lastEvent, status } = useWebSocket(WS_URL);
  const { marketStatus, msRemaining, oracleSnapshot, resolution } = useMarket(
    marketId,
    send,
    lastEvent,
    status,
  );

  // On mount: check if a market is already running
  useEffect(() => {
    fetch(`${API_URL}/markets/current`)
      .then((r) => r.json())
      .then((data: { ok: boolean; market?: MarketState }) => {
        if (data.ok && data.market) setMarketId(data.market.config.marketId);
      })
      .catch(() => { /* no market yet — that's fine */ });
  }, []);

  const startDemo = useCallback(async () => {
    const res = await fetch(`${API_URL}/markets/start-demo`, { method: 'POST' });
    const data: { ok: boolean; market?: MarketState } = await res.json();
    if (data.ok && data.market) setMarketId(data.market.config.marketId);
  }, []);

  return (
    <div style={layout}>
      <header style={header}>
        <span style={{ color: '#2563eb', fontWeight: 700 }}>JET</span>
        <span style={{ color: '#444', marginLeft: '0.5rem' }}>PREDICTION MARKET</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: statusColor(status) }}>
          WS {status.toUpperCase()}
        </span>
      </header>

      <main style={main}>
        {marketId && marketStatus ? (
          <MarketView
            question="Will BTC be above $100,000 in 2 minutes?"
            marketStatus={marketStatus}
            msRemaining={msRemaining}
            oracleSnapshot={oracleSnapshot}
            resolution={resolution}
            onStartNew={() => void startDemo()}
          />
        ) : (
          <div>
            <p style={{ color: '#555', marginBottom: '1.5rem' }}>No active market.</p>
            <button onClick={() => void startDemo()} style={primaryBtn}>
              Start Demo Market
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function statusColor(s: string) {
  if (s === 'connected') return '#22c55e';
  if (s === 'connecting') return '#f59e0b';
  return '#555';
}

const layout: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
};

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '1rem 2rem',
  borderBottom: '1px solid #1f1f1f',
  fontSize: '0.85rem',
  letterSpacing: '0.08em',
};

const main: CSSProperties = {
  flex: 1,
  padding: '2.5rem 2rem',
  maxWidth: '640px',
};

const primaryBtn: CSSProperties = {
  background: '#1d4ed8',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '0.75rem 1.75rem',
  cursor: 'pointer',
  fontSize: '0.95rem',
  fontFamily: 'inherit',
  fontWeight: 600,
};
