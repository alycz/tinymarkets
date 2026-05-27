import { useState, useEffect, useRef, useCallback } from 'react';
import type { ClientMessage, ServerEvent } from '@jet/shared';

export type WsStatus = 'connecting' | 'connected' | 'disconnected';
export type WsEventEnvelope = { seq: number; event: ServerEvent };

const MAX_EVENT_LOG = 500;

export function useWebSocket(url: string): {
  send: (msg: ClientMessage) => void;
  events: WsEventEnvelope[];
  status: WsStatus;
} {
  const [status, setStatus] = useState<WsStatus>('disconnected');
  const [events, setEvents] = useState<WsEventEnvelope[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const seqRef = useRef(0);

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
          const parsed = JSON.parse(event.data) as ServerEvent;
          const seq = ++seqRef.current;
          setEvents((prev) => [...prev, { seq, event: parsed }].slice(-MAX_EVENT_LOG));
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

  return { send, events, status };
}
