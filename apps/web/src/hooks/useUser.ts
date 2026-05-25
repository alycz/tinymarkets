import { useState, useEffect, useCallback } from 'react';
import type {
  ClientMessage,
  ServerEvent,
  Balance,
  Position,
  Fill,
  CanonicalOrder,
  Result,
  UserResponse,
  UserResolutionEvent,
} from '@jet/shared';
import { userChannel } from '@jet/shared';
import type { WsStatus } from './useWebSocket.js';

export function useUser(
  userId: string,
  marketId: string | null,
  apiUrl: string,
  send: (msg: ClientMessage) => void,
  lastEvent: ServerEvent | null,
  wsStatus: WsStatus,
): {
  balance: Balance | null;
  position: Position | null;
  openOrders: CanonicalOrder[];
  recentFills: Fill[];
  userResolution: UserResolutionEvent | null;
  refreshUserSnapshot: () => Promise<void>;
} {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [openOrders, setOpenOrders] = useState<CanonicalOrder[]>([]);
  const [recentFills, setRecentFills] = useState<Fill[]>([]);
  const [userResolution, setUserResolution] = useState<UserResolutionEvent | null>(null);

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

  useEffect(() => {
    setBalance(null);
    setPosition(null);
    setOpenOrders([]);
    setRecentFills([]);
    setUserResolution(null);
  }, [userId, marketId]);

  useEffect(() => {
    if (!userId || wsStatus !== 'connected') return;
    send({ type: 'subscribe', channels: [userChannel(userId)] });
  }, [userId, wsStatus, send]);

  useEffect(() => {
    if (!userId || !marketId) return;
    void refreshUserSnapshot();
  }, [userId, marketId, wsStatus, refreshUserSnapshot]);

  useEffect(() => {
    if (!lastEvent) return;
    switch (lastEvent.type) {
      case 'user:balance':
        if (lastEvent.balance.userId === userId) setBalance(lastEvent.balance);
        break;
      case 'user:position':
        if (lastEvent.position.userId === userId && lastEvent.position.marketId === marketId) {
          setPosition(lastEvent.position);
        }
        break;
      case 'user:open_orders':
        if (lastEvent.userId === userId) setOpenOrders(lastEvent.openOrders);
        break;
      case 'user:fill':
        if (lastEvent.fill.userId === userId)
          setRecentFills((prev) => [lastEvent.fill, ...prev].slice(0, 50));
        break;
      case 'user:resolution':
        if (lastEvent.marketId === marketId) {
          setUserResolution(lastEvent);
        }
        break;
    }
  }, [lastEvent, marketId, userId]);

  return {
    balance,
    position,
    openOrders,
    recentFills,
    userResolution,
    refreshUserSnapshot,
  };
}
