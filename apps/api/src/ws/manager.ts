import type { WebSocket } from 'ws';
import {
  type Channel,
  type ServerEvent,
  parseChannel,
} from '@jet/shared';
import { makeMarketStatusEvent } from '../events.js';
import type { MarketSession } from '../session.js';

export class WsManager {
  private clients = new Map<WebSocket, Set<Channel>>();
  private session: MarketSession | null = null;

  setSession(session: MarketSession): void {
    this.session = session;
  }

  addConnection(ws: WebSocket): void {
    this.clients.set(ws, new Set());
  }

  subscribe(ws: WebSocket, channels: Channel[]): void {
    const existing = this.clients.get(ws) ?? new Set<Channel>();
    for (const ch of channels) existing.add(ch);
    this.clients.set(ws, existing);

    this.sendTo(ws, { type: 'subscribed', channels });

    for (const ch of channels) {
      this.sendCatchUp(ws, ch);
    }
  }

  unsubscribe(ws: WebSocket, channels: Channel[]): void {
    const existing = this.clients.get(ws);
    if (!existing) return;
    for (const ch of channels) existing.delete(ch);
  }

  removeConnection(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  broadcast(channel: Channel, event: ServerEvent): void {
    for (const [ws, channels] of this.clients) {
      if (channels.has(channel)) {
        this.sendTo(ws, event);
      }
    }
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
      }
    }
  }

  private sendTo(ws: WebSocket, event: ServerEvent): void {
    try {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(JSON.stringify(event));
      }
    } catch {
      this.removeConnection(ws);
    }
  }
}
