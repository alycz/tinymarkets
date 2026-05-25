import { useState, useEffect } from 'react';
import type { ClientMessage, ServerEvent, Trade } from '@jet/shared';
import { tradesChannel } from '@jet/shared';
import type { WsStatus } from './useWebSocket.js';

export function useTrades(
  marketId: string | null,
  send: (msg: ClientMessage) => void,
  lastEvent: ServerEvent | null,
  wsStatus: WsStatus,
): Trade[] {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    setTrades([]);
  }, [marketId]);

  useEffect(() => {
    if (!marketId || wsStatus !== 'connected') return;
    send({ type: 'subscribe', channels: [tradesChannel(marketId)] });
  }, [marketId, wsStatus, send]);

  useEffect(() => {
    if (!lastEvent || !marketId) return;
    if (lastEvent.type === 'trades_snapshot' && lastEvent.marketId === marketId) {
      setTrades([...lastEvent.trades].reverse().slice(0, 50));
      return;
    }
    if (lastEvent.type === 'trade' && lastEvent.trade.marketId === marketId) {
      setTrades((prev) => [lastEvent.trade, ...prev].slice(0, 50));
    }
  }, [lastEvent, marketId]);

  return trades;
}
