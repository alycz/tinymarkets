import { useState, useEffect, useRef } from 'react';
import type { ClientMessage, Trade } from '@jet/shared';
import { tradesChannel } from '@jet/shared';
import type { WsEventEnvelope, WsStatus } from './useWebSocket.js';

export function useTrades(
  marketId: string | null,
  send: (msg: ClientMessage) => void,
  events: WsEventEnvelope[],
  wsStatus: WsStatus,
): Trade[] {
  const [trades, setTrades] = useState<Trade[]>([]);
  const lastProcessedSeqRef = useRef(0);

  useEffect(() => {
    setTrades([]);
  }, [marketId]);

  useEffect(() => {
    if (!marketId || wsStatus !== 'connected') return;
    send({ type: 'subscribe', channels: [tradesChannel(marketId)] });
  }, [marketId, wsStatus, send]);

  useEffect(() => {
    if (!marketId) return;

    for (const { seq, event } of events) {
      if (seq <= lastProcessedSeqRef.current) continue;
      lastProcessedSeqRef.current = seq;

      if (event.type === 'trades_snapshot' && event.marketId === marketId) {
        setTrades([...event.trades].reverse().slice(0, 50));
        continue;
      }
      if (event.type === 'trade' && event.trade.marketId === marketId) {
        setTrades((prev) => [event.trade, ...prev].slice(0, 50));
      }
    }
  }, [events, marketId]);

  return trades;
}
