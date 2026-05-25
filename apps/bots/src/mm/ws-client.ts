import WebSocket from 'ws';
import type {
  Channel,
  SubscribeMessage,
  OraclePriceEvent,
  MarketStatusEvent,
  UserFillEvent,
  MarketResolvedEvent,
  ServerEvent,
} from '@jet/shared';

export interface WsCallbacks {
  onOracle?: (event: OraclePriceEvent) => void;
  onMarketStatus?: (event: MarketStatusEvent) => void;
  onUserFill?: (event: UserFillEvent) => void;
  onMarketResolved?: (event: MarketResolvedEvent) => void;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private channels: Channel[] = [];
  private backoffMs = 250;
  private readonly maxBackoffMs = 5_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private readonly url: string,
    private readonly callbacks: WsCallbacks,
  ) {}

  subscribe(channels: Channel[]): void {
    const fresh = channels.filter(c => !this.channels.includes(c));
    if (fresh.length === 0) return;
    this.channels = [...this.channels, ...fresh];
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg: SubscribeMessage = { type: 'subscribe', channels: fresh };
      this.ws.send(JSON.stringify(msg));
    }
  }

  connect(): void {
    if (this.destroyed) return;

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.backoffMs = 250;
      if (this.channels.length > 0) {
        const msg: SubscribeMessage = { type: 'subscribe', channels: this.channels };
        this.ws!.send(JSON.stringify(msg));
      }
      console.log('[ws] connected, subscribed to', this.channels.join(', '));
    });

    this.ws.on('message', (data) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(data.toString()) as ServerEvent;
      } catch {
        return;
      }

      switch (event.type) {
        case 'oracle:price':
          this.callbacks.onOracle?.(event);
          break;
        case 'market:status':
          this.callbacks.onMarketStatus?.(event);
          break;
        case 'user:fill':
          this.callbacks.onUserFill?.(event);
          break;
        case 'market:resolved':
          this.callbacks.onMarketResolved?.(event);
          break;
      }
    });

    this.ws.on('close', () => {
      if (this.destroyed) return;
      const delay = this.backoffMs;
      console.log(`[ws] disconnected; reconnecting in ${delay}ms`);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
      this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
    });

    this.ws.on('error', (err) => {
      console.error('[ws] error:', err.message);
    });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.removeAllListeners();
    try {
      this.ws?.close();
    } catch {
      // ignore close failures during cleanup
    }
    this.ws = null;
  }
}
