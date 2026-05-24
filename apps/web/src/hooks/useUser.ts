import { useState, useEffect } from 'react';
import type { ClientMessage, ServerEvent, Balance, Position, Fill } from '@jet/shared';
import { userChannel } from '@jet/shared';
import type { WsStatus } from './useWebSocket.js';

export function useUser(
  userId: string,
  send: (msg: ClientMessage) => void,
  lastEvent: ServerEvent | null,
  wsStatus: WsStatus,
): {
  balance: Balance | null;
  position: Position | null;
  recentFills: Fill[];
  resolutionPnl: number | null;
} {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [recentFills, setRecentFills] = useState<Fill[]>([]);
  const [resolutionPnl, setResolutionPnl] = useState<number | null>(null);

  useEffect(() => {
    setBalance(null);
    setPosition(null);
    setRecentFills([]);
    setResolutionPnl(null);
  }, [userId]);

  useEffect(() => {
    if (!userId || wsStatus !== 'connected') return;
    send({ type: 'subscribe', channels: [userChannel(userId)] });
  }, [userId, wsStatus, send]);

  useEffect(() => {
    if (!lastEvent) return;
    switch (lastEvent.type) {
      case 'user:balance':
        if (lastEvent.balance.userId === userId) setBalance(lastEvent.balance);
        break;
      case 'user:position':
        if (lastEvent.position.userId === userId) setPosition(lastEvent.position);
        break;
      case 'user:fill':
        if (lastEvent.fill.userId === userId)
          setRecentFills((prev) => [lastEvent.fill, ...prev].slice(0, 50));
        break;
      case 'user:resolution':
        setResolutionPnl(lastEvent.pnlCents);
        break;
    }
  }, [lastEvent, userId]);

  return { balance, position, recentFills, resolutionPnl };
}
