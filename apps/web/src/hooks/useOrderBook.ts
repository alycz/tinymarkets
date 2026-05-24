import { useState, useEffect, useRef } from 'react';
import type { ClientMessage, ServerEvent, OrderBookSnapshot } from '@jet/shared';
import { bookChannel } from '@jet/shared';
import type { WsStatus } from './useWebSocket.js';

export function useOrderBook(
  marketId: string | null,
  send: (msg: ClientMessage) => void,
  lastEvent: ServerEvent | null,
  wsStatus: WsStatus,
): { snapshot: OrderBookSnapshot | null } {
  const [snapshot, setSnapshot] = useState<OrderBookSnapshot | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    setSnapshot(null);
    seqRef.current = 0;
  }, [marketId]);

  useEffect(() => {
    if (!marketId || wsStatus !== 'connected') return;
    send({ type: 'subscribe', channels: [bookChannel(marketId)] });
  }, [marketId, wsStatus, send]);

  useEffect(() => {
    if (!lastEvent || !marketId) return;

    if (lastEvent.type === 'book:snapshot' && lastEvent.book.marketId === marketId) {
      setSnapshot(lastEvent.book);
      seqRef.current = lastEvent.book.seq;
      return;
    }

    if (lastEvent.type === 'book:delta' && lastEvent.delta.marketId === marketId) {
      const delta = lastEvent.delta;
      if (delta.seq !== seqRef.current + 1) {
        send({ type: 'unsubscribe', channels: [bookChannel(marketId)] });
        send({ type: 'subscribe', channels: [bookChannel(marketId)] });
        return;
      }
      setSnapshot((prev) => {
        if (!prev) return prev;
        const newBids = [...prev.bids];
        const newAsks = [...prev.asks];
        for (const change of delta.changes) {
          const levels = change.side === 'BID' ? newBids : newAsks;
          const idx = levels.findIndex((l) => l.yesPriceCents === change.yesPriceCents);
          if (change.size === 0) {
            if (idx !== -1) levels.splice(idx, 1);
          } else if (idx !== -1) {
            // noUncheckedIndexedAccess: idx is known valid, assert defined
            levels[idx] = { ...levels[idx]!, size: change.size };
          } else {
            levels.push({ yesPriceCents: change.yesPriceCents, size: change.size });
          }
        }
        newBids.sort((a, b) => b.yesPriceCents - a.yesPriceCents);
        newAsks.sort((a, b) => a.yesPriceCents - b.yesPriceCents);
        return { ...prev, bids: newBids, asks: newAsks, seq: delta.seq, ts: delta.ts };
      });
      seqRef.current = delta.seq;
    }
  }, [lastEvent, marketId, send]);

  return { snapshot };
}
