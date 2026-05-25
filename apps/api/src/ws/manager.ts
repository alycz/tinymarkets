import type { WebSocket } from 'ws';
import {
  type Channel,
  type OrderBookSnapshot,
  type ServerEvent,
  parseChannel,
  timestampMs,
} from '@jet/shared';
import { makeCountdownEvent, makeMarketSnapshotEvent, makeMarketStatusEvent } from '../events.js';
import type { MarketSession } from '../session.js';

type ClientState = {
  channels: Set<Channel>;
  isAlive: boolean;
};

export class WsManager {
  private clients = new Map<WebSocket, ClientState>();
  private session: MarketSession | null = null;
  private readonly heartbeatInterval: ReturnType<typeof setInterval>;

  constructor(opts?: { heartbeatMs?: number }) {
    this.heartbeatInterval = setInterval(
      () => this.checkHeartbeats(),
      opts?.heartbeatMs ?? 30_000,
    );
    this.heartbeatInterval.unref?.();
  }

  setSession(session: MarketSession): void {
    this.session = session;
  }

  addConnection(ws: WebSocket): void {
    this.clients.set(ws, { channels: new Set(), isAlive: true });
    ws.on('pong', () => {
      const client = this.clients.get(ws);
      if (client) client.isAlive = true;
    });
    ws.on('close', () => this.removeConnection(ws));
    ws.on('error', () => this.removeConnection(ws));
  }

  subscribe(ws: WebSocket, channels: Channel[]): void {
    const existing = this.clients.get(ws) ?? { channels: new Set<Channel>(), isAlive: true };
    for (const ch of channels) existing.channels.add(ch);
    this.clients.set(ws, existing);

    this.sendTo(ws, { type: 'subscribed', channels });

    for (const ch of channels) {
      this.sendCatchUp(ws, ch);
    }
  }

  unsubscribe(ws: WebSocket, channels: Channel[]): void {
    const existing = this.clients.get(ws);
    if (!existing) return;
    for (const ch of channels) existing.channels.delete(ch);
  }

  removeConnection(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  broadcast(channel: Channel, event: ServerEvent): void {
    for (const [ws, client] of this.clients) {
      if (client.channels.has(channel)) {
        this.sendTo(ws, event);
      }
    }
  }

  destroy(): void {
    clearInterval(this.heartbeatInterval);
    for (const ws of this.clients.keys()) {
      try {
        ws.close();
      } catch {
        this.removeConnection(ws);
      }
    }
    this.clients.clear();
  }

  private sendCatchUp(ws: WebSocket, ch: Channel): void {
    const s = this.session;
    if (!s) return;

    const { kind, id } = parseChannel(ch);

    if (kind === 'market') {
      const state = s.getMarketState();
      if (state?.config.marketId === id) {
        this.sendTo(ws, makeMarketSnapshotEvent(state, {
          orderbook: s.getOrderBookSnapshot(),
          recentTrades: s.getRecentTrades(),
          oracle: s.getOracleSnapshot(),
          sharePrice: s.getLatestSharePrice(),
        }));
        this.sendTo(ws, makeMarketStatusEvent(state));
        this.sendTo(ws, makeCountdownEvent(state));
        if (state.status === 'resolved') {
          const resolution = s.getLastResolution();
          if (resolution) {
            this.sendTo(ws, { type: 'resolution', marketId: state.config.marketId, resolution });
          }
        }
      }
    } else if (kind === 'book') {
      const state = s.getMarketState();
      if (state?.config.marketId === id) {
        const book = s.getOrderBookSnapshot();
        if (book) {
          this.sendTo(ws, makeBookSnapshotEvent(book));
        }
      }
    } else if (kind === 'trades') {
      const state = s.getMarketState();
      if (state?.config.marketId === id) {
        this.sendTo(ws, {
          type: 'trades_snapshot',
          marketId: state.config.marketId,
          trades: s.getRecentTrades(),
          ts: timestampMs(Date.now()),
        });
      }
    } else if (kind === 'oracle') {
      const state = s.getMarketState();
      if (state?.config.marketId === id) {
        this.sendTo(ws, {
          type: 'oracle_series_snapshot',
          marketId: state.config.marketId,
          snapshots: s.getOracleSeries(),
          ts: timestampMs(Date.now()),
        });
        const snap = s.getOracleSnapshot();
        if (snap?.marketId === id) {
          this.sendTo(ws, {
            type: 'oracle_price',
            marketId: snap.marketId,
            tick: snap,
            snapshot: snap,
          });
        }
      }
    } else if (kind === 'share' || kind === 'share_price') {
      const state = s.getMarketState();
      if (state?.config.marketId === id) {
        const points = s.getSharePriceSeries();
        const latest = s.getLatestSharePricePoint();
        this.sendTo(ws, {
          type: 'share_price_snapshot',
          marketId: state.config.marketId,
          points,
          latest,
          ts: timestampMs(Date.now()),
        });
        if (latest) {
          this.sendTo(ws, {
            type: 'share_price',
            marketId: latest.marketId,
            point: latest,
          });
        }
      }
    } else if (kind === 'user') {
      const parsed = parseChannel(ch);
      const userId = parsed.userId ?? id;
      const snap = s.getUserSnapshot(userId);
      const state = s.getMarketState();
      const marketId = parsed.marketId ?? state?.config.marketId;
      if (parsed.marketId && state?.config.marketId !== parsed.marketId) return;
      if (snap) {
        if (!marketId) return;
        this.sendTo(ws, {
          type: 'balance_snapshot',
          userId: snap.userId,
          marketId,
          balance: snap.balance,
        });
        for (const position of snap.positions) {
          this.sendTo(ws, {
            type: 'position_snapshot',
            userId: snap.userId,
            marketId: position.marketId,
            position,
          });
        }
        this.sendTo(ws, {
          type: 'open_orders_snapshot',
          userId: snap.userId,
          marketId,
          openOrders: snap.openOrders,
        });
        this.sendTo(ws, {
          type: 'balance_update',
          userId: snap.userId,
          marketId,
          balance: snap.balance,
        });
        for (const position of snap.positions) {
          this.sendTo(ws, {
            type: 'position_update',
            userId: snap.userId,
            marketId: position.marketId,
            position,
          });
        }
        this.sendTo(ws, {
          type: 'open_order',
          userId: snap.userId,
          marketId,
          openOrders: snap.openOrders,
        });
        const resolution = s.getLastUserResolution(snap.userId);
        if (resolution && resolution.marketId === marketId) {
          this.sendTo(ws, resolution);
        }
      }
    }
  }

  private checkHeartbeats(): void {
    for (const [ws, client] of this.clients) {
      if (!client.isAlive) {
        this.removeConnection(ws);
        try {
          ws.terminate();
        } catch {
          // Already gone.
        }
        continue;
      }

      client.isAlive = false;
      try {
        if (ws.readyState === 1 /* OPEN */) {
          ws.ping();
        } else {
          this.removeConnection(ws);
        }
      } catch {
        this.removeConnection(ws);
      }
    }
  }

  private sendTo(ws: WebSocket, event: ServerEvent): void {
    try {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(JSON.stringify(event));
      } else {
        this.removeConnection(ws);
      }
    } catch {
      this.removeConnection(ws);
    }
  }
}

function makeBookSnapshotEvent(book: OrderBookSnapshot): ServerEvent {
  return {
    type: 'orderbook_snapshot',
    marketId: book.marketId,
    bids: book.bids,
    asks: book.asks,
    seq: book.seq,
    ts: book.ts,
    book,
  };
}
