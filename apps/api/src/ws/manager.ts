import type { WebSocket } from 'ws';
import {
  type Channel,
  type ServerEvent,
  type MarketState,
  type IndicativeSnapshot,
  parseChannel,
} from '@jet/shared';
import { makeMarketStatusEvent } from '../events.js';

export class WsManager {
  private clients = new Map<WebSocket, Set<Channel>>();

  constructor(
    private getMarketState: () => MarketState | null,
    private getOracleSnapshot: () => IndicativeSnapshot | null,
  ) {}

  addConnection(ws: WebSocket): void {
    this.clients.set(ws, new Set());
  }

  subscribe(ws: WebSocket, channels: Channel[]): void {
    const existing = this.clients.get(ws) ?? new Set<Channel>();
    for (const ch of channels) existing.add(ch);
    this.clients.set(ws, existing);

    this.sendTo(ws, { type: 'subscribed', channels });

    // Send catch-up state immediately so client doesn't wait for next tick
    for (const ch of channels) {
      const { kind, id } = parseChannel(ch);
      if (kind === 'market') {
        const state = this.getMarketState();
        if (state?.config.marketId === id) {
          this.sendTo(ws, makeMarketStatusEvent(state));
        }
      } else if (kind === 'oracle') {
        const snap = this.getOracleSnapshot();
        if (snap?.marketId === id) {
          this.sendTo(ws, { type: 'oracle:price', snapshot: snap });
        }
      }
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
