import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ClientMessage,
  Balance,
  Position,
  Fill,
  CanonicalOrder,
  Result,
  UserResponse,
  UserResolutionEvent,
} from '@jet/shared';
import { userChannel } from '@jet/shared';
import type { WsEventEnvelope, WsStatus } from './useWebSocket.js';

export function useUser(
  userId: string,
  marketId: string | null,
  apiUrl: string,
  send: (msg: ClientMessage) => void,
  events: WsEventEnvelope[],
  wsStatus: WsStatus,
): {
  balance: Balance | null;
  position: Position | null;
  openOrders: CanonicalOrder[];
  recentFills: Fill[];
  userResolution: UserResolutionEvent | null;
  refreshUserSnapshot: () => Promise<void>;
  recordRecentFills: (fills: Fill[]) => void;
} {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [openOrders, setOpenOrders] = useState<CanonicalOrder[]>([]);
  const [recentFills, setRecentFills] = useState<Fill[]>([]);
  const [userResolution, setUserResolution] = useState<UserResolutionEvent | null>(null);
  const lastProcessedSeqRef = useRef(0);

  const refreshUserSnapshot = useCallback(async () => {
    if (!userId || !marketId) return;
    const res = await fetch(`${apiUrl}/users/${userId}`);
    if (!res.ok) return;
    const data = (await res.json()) as Result<UserResponse>;
    if (!data.ok) return;

    setBalance(data.snapshot.balance);
    setPosition(data.snapshot.positions.find((p) => p.marketId === marketId) ?? null);
    setOpenOrders(data.snapshot.openOrders);
  }, [apiUrl, marketId, userId]);

  const recordRecentFills = useCallback((fills: Fill[]) => {
    if (fills.length === 0) return;
    setRecentFills((prev) => dedupeFills([...fills, ...prev]).slice(0, 50));
  }, []);

  useEffect(() => {
    setBalance(null);
    setPosition(null);
    setOpenOrders([]);
    setRecentFills([]);
    setUserResolution(null);
  }, [userId, marketId]);

  useEffect(() => {
    if (!userId || !marketId || wsStatus !== 'connected') return;
    send({ type: 'subscribe', channels: [userChannel(userId, marketId)] });
  }, [userId, marketId, wsStatus, send]);

  useEffect(() => {
    if (!userId || !marketId) return;
    void refreshUserSnapshot();
  }, [userId, marketId, wsStatus, refreshUserSnapshot]);

  useEffect(() => {
    for (const { seq, event } of events) {
      if (seq <= lastProcessedSeqRef.current) continue;
      lastProcessedSeqRef.current = seq;

      switch (event.type) {
        case 'balance_snapshot':
        case 'balance_update':
          if (event.userId === userId && event.marketId === marketId) setBalance(event.balance);
          break;
        case 'position_snapshot':
        case 'position_update':
          if (
            event.userId === userId &&
            event.marketId === marketId &&
            event.position.userId === userId &&
            event.position.marketId === marketId
          ) {
            setPosition(event.position);
          }
          break;
        case 'open_orders_snapshot':
        case 'open_order':
          if (event.userId === userId && event.marketId === marketId) setOpenOrders(event.openOrders);
          break;
        case 'order_cancelled':
          if (event.userId === userId && event.marketId === marketId) setOpenOrders(event.openOrders);
          break;
        case 'fill':
          if (event.userId === userId && event.marketId === marketId)
            setRecentFills((prev) => dedupeFills([event.fill, ...prev]).slice(0, 50));
          break;
        case 'pnl_update':
          if (event.userId === userId && event.marketId === marketId) {
            setUserResolution(event);
          }
          break;
      }
    }
  }, [events, marketId, userId]);

  return {
    balance,
    position,
    openOrders,
    recentFills,
    userResolution,
    refreshUserSnapshot,
    recordRecentFills,
  };
}

function dedupeFills(fills: Fill[]): Fill[] {
  const seen = new Set<string>();
  const out: Fill[] = [];
  for (const fill of fills) {
    const key = `${fill.tradeId}:${fill.orderId}:${fill.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fill);
  }
  return out;
}
