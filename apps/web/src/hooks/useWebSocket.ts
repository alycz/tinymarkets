import { useState, useEffect, useRef, useCallback } from 'react';
import type { ClientMessage, ServerEvent } from '@jet/shared';

export type WsStatus = 'connecting' | 'connected' | 'disconnected';

export function useWebSocket(url: string): {
  send: (msg: ClientMessage) => void;
  lastEvent: ServerEvent | null;
  status: WsStatus;
} {
  const [status, setStatus] = useState<WsStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<ServerEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (cancelled) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      setStatus('connecting');

      ws.onopen = () => {
        if (!cancelled) setStatus('connected');
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        if (cancelled) return;
        try {
          setLastEvent(JSON.parse(event.data) as ServerEvent);
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setStatus('disconnected');
        reconnectTimer = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [url]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  return { send, lastEvent, status };
}
