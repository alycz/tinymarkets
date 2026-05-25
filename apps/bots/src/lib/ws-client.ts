import WebSocket from 'ws';
import type {
  BookDeltaEvent,
  BookSnapshotEvent,
  Channel,
  MarketResolvedEvent,
  MarketStatusEvent,
  OraclePriceEvent,
  ServerEvent,
  SubscribeMessage,
  UserFillEvent,
} from '@jet/shared';

export interface BotWsCallbacks {
  onOracle?: (event: OraclePriceEvent) => void;
  onMarketStatus?: (event: MarketStatusEvent) => void;
  onUserFill?: (event: UserFillEvent) => void;
  onBookSnapshot?: (event: BookSnapshotEvent) => void;
  onBookDelta?: (event: BookDeltaEvent) => void;
  onMarketResolved?: (event: MarketResolvedEvent) => void;
}

export class BotWsClient {
  private ws: WebSocket | null = null;
  private channels: Channel[] = [];
  private backoffMs = 250;
  private readonly maxBackoffMs = 5_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private readonly url: string,
    private readonly callbacks: BotWsCallbacks,
    private readonly logPrefix = '[ws]',
  ) {}

  subscribe(channels: Channel[]): void {
    const fresh = channels.filter(c => !this.channels.includes(c));
    if (fresh.length === 0) return;
    this.channels = [...this.channels, ...fresh];
    this.sendSubscribe(fresh);
  }

  refresh(channels: Channel[]): void {
    this.sendSubscribe(channels);
  }

  connect(): void {
    if (this.destroyed) return;

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.backoffMs = 250;
      this.sendSubscribe(this.channels);
      console.log(`${this.logPrefix} connected, subscribed to`, this.channels.join(', '));
    });

    this.ws.on('message', (data) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(data.toString()) as ServerEvent;
      } catch {
        return;
      }

      switch (event.type) {
        case 'oracle_price':
          this.callbacks.onOracle?.(event);
          break;
        case 'market_status':
          this.callbacks.onMarketStatus?.(event);
          break;
        case 'fill':
          this.callbacks.onUserFill?.(event);
          break;
        case 'orderbook_snapshot':
          this.callbacks.onBookSnapshot?.(event);
          break;
        case 'orderbook_delta':
          this.callbacks.onBookDelta?.(event);
          break;
        case 'resolution':
          this.callbacks.onMarketResolved?.(event);
          break;
      }
    });

    this.ws.on('close', () => {
      if (this.destroyed) return;
      const delay = this.backoffMs;
      console.log(`${this.logPrefix} disconnected; reconnecting in ${delay}ms`);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
      this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
    });

    this.ws.on('error', (err) => {
      console.error(`${this.logPrefix} error:`, err.message);
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

  private sendSubscribe(channels: Channel[]): void {
    if (channels.length === 0 || this.ws?.readyState !== WebSocket.OPEN) return;
    const msg: SubscribeMessage = { type: 'subscribe', channels };
    this.ws.send(JSON.stringify(msg));
  }
}
