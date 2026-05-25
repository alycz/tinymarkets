import type { WebSocket } from 'ws';
import {
  type Channel,
  type ServerEvent,
  parseChannel,
} from '@jet/shared';
import { makeMarketStatusEvent } from '../events.js';
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
        this.sendTo(ws, makeMarketStatusEvent(state));
        if (state.status === 'resolved') {
          const resolution = s.getLastResolution();
          if (resolution) {
            this.sendTo(ws, { type: 'market:resolved', resolution });
          }
        }
      }
    } else if (kind === 'book') {
      const state = s.getMarketState();
      if (state?.config.marketId === id) {
        const book = s.getOrderBookSnapshot();
        if (book) {
          this.sendTo(ws, { type: 'book:snapshot', book });
        }
      }
    } else if (kind === 'trades') {
      const state = s.getMarketState();
      if (state?.config.marketId === id) {
        for (const trade of s.getRecentTrades()) {
          this.sendTo(ws, { type: 'trade:created', trade });
        }
      }
    } else if (kind === 'oracle') {
      const snap = s.getOracleSnapshot();
      if (snap?.marketId === id) {
        this.sendTo(ws, { type: 'oracle:price', snapshot: snap });
      }
    } else if (kind === 'user') {
      const snap = s.getUserSnapshot(id);
      if (snap) {
        this.sendTo(ws, { type: 'user:balance', balance: snap.balance });
        for (const position of snap.positions) {
          this.sendTo(ws, { type: 'user:position', position });
        }
        this.sendTo(ws, {
          type: 'user:open_orders',
          userId: snap.userId,
          openOrders: snap.openOrders,
        });
        const resolution = s.getLastUserResolution(snap.userId);
        if (resolution) {
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
