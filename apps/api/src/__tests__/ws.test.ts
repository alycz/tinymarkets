import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import type { ServerEvent } from '@jet/shared';
import { oddsPriceCents, shareChannel, sharePriceChannel, shares, userChannel } from '@jet/shared';
import { buildServer } from '../server.js';
import { Broadcaster } from '../broadcasts.js';
import { MarketSession } from '../session.js';
import { WsManager } from '../ws/manager.js';

type TestServer = {
  session: MarketSession;
  manager: WsManager;
  server: Awaited<ReturnType<typeof buildServer>>;
  url: string;
};

type FakeWs = {
  readyState: number;
  sent: ServerEvent[];
  send(data: string): void;
  on(): void;
  close(): void;
  ping(): void;
  terminate(): void;
};

type LiveWs = {
  ws: WebSocket;
  events: ServerEvent[];
};

const openSockets: WebSocket[] = [];
const openServers: TestServer[] = [];

describe('WebSocket protocol hardening', () => {
  afterEach(async () => {
    for (const ws of openSockets.splice(0)) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
    for (const testServer of openServers.splice(0)) {
      await testServer.server.close();
      testServer.session.destroy();
      testServer.manager.destroy();
    }
    vi.useRealTimers();
  });

  it('returns validation errors for malformed client messages without closing', async () => {
    const { url } = await startServer();
    const live = await connect(url);

    live.ws.send('{not-json');
    expect(await waitForEvent(live, (event) => event.type === 'error')).toMatchObject({
      type: 'error',
      code: 'VALIDATION',
    });
    expect(live.ws.readyState).toBe(WebSocket.OPEN);

    live.ws.send('42');
    expect(await waitForEvent(live, (event, index) => index >= 1 && event.type === 'error')).toMatchObject({
      type: 'error',
      code: 'VALIDATION',
    });

    live.ws.send(JSON.stringify({ type: 'unknown' }));
    expect(await waitForEvent(live, (event, index) => index >= 2 && event.type === 'error')).toMatchObject({
      type: 'error',
      code: 'VALIDATION',
    });

    live.ws.send(JSON.stringify({ type: 'subscribe', channels: ['bad:demo'] }));
    expect(await waitForEvent(live, (event, index) => index >= 3 && event.type === 'error')).toMatchObject({
      type: 'error',
      code: 'VALIDATION',
    });

    live.ws.send(JSON.stringify({ type: 'subscribe', channels: Array.from({ length: 21 }, () => 'market:m1') }));
    expect(await waitForEvent(live, (event, index) => index >= 4 && event.type === 'error')).toMatchObject({
      type: 'error',
      code: 'VALIDATION',
    });
  });

  it('accepts valid subscribe and ping messages', async () => {
    const testServer = await startServer();
    const market = testServer.session.startDemo();
    const live = await connect(testServer.url);

    live.ws.send(JSON.stringify({ type: 'subscribe', channels: [`market:${market.config.marketId}`] }));
    expect(await waitForEvent(live, (event) => event.type === 'subscribed')).toEqual({
      type: 'subscribed',
      channels: [`market:${market.config.marketId}`],
    });
    expect(await waitForEvent(live, (event) => event.type === 'market_status')).toMatchObject({
      type: 'market_status',
      marketId: market.config.marketId,
    });

    live.ws.send(JSON.stringify({ type: 'ping' }));
    expect(await waitForEvent(live, (event) => event.type === 'pong')).toMatchObject({ type: 'pong' });
  });

  it('replays open orders when a user channel subscribes', () => {
    const session = new MarketSession();
    const manager = new WsManager({ heartbeatMs: 60_000 });
    const broadcaster = new Broadcaster(manager);
    try {
      manager.setSession(session);
      session.setBroadcaster(broadcaster);
      const market = session.startDemo();
      session.placeOrder({
        userId: 'userA',
        marketId: market.config.marketId,
        side: 'YES',
        action: 'BUY',
        type: 'LIMIT',
        oddsPriceCents: oddsPriceCents(55),
        size: shares(10),
        tif: 'GTC',
      });

      const ws = makeFakeWs();
      manager.addConnection(ws as unknown as WebSocket);
      manager.subscribe(ws as unknown as WebSocket, [userChannel('userA', market.config.marketId)]);

      expect(ws.sent.some((event) => event.type === 'balance_snapshot')).toBe(true);
      expect(ws.sent.some((event) => event.type === 'position_snapshot')).toBe(true);
      expect(ws.sent.some((event) => event.type === 'open_orders_snapshot')).toBe(true);
      const openOrders = ws.sent.find((event) => event.type === 'open_order');
      expect(openOrders).toMatchObject({
        type: 'open_order',
        userId: 'userA',
        marketId: market.config.marketId,
      });
      expect(openOrders?.type === 'open_order' && openOrders.openOrders).toHaveLength(1);
    } finally {
      manager.destroy();
      session.destroy();
    }
  });

  it('keeps legacy user channel alias working during the protocol migration', () => {
    const session = new MarketSession();
    const manager = new WsManager({ heartbeatMs: 60_000 });
    try {
      manager.setSession(session);
      const market = session.startDemo();
      session.placeOrder({
        userId: 'userA',
        marketId: market.config.marketId,
        side: 'YES',
        action: 'BUY',
        type: 'LIMIT',
        oddsPriceCents: oddsPriceCents(55),
        size: shares(10),
        tif: 'GTC',
      });

      const ws = makeFakeWs();
      manager.addConnection(ws as unknown as WebSocket);
      manager.subscribe(ws as unknown as WebSocket, [userChannel('userA')]);

      const openOrders = ws.sent.find((event) => event.type === 'open_order');
      expect(openOrders).toMatchObject({
        type: 'open_order',
        userId: 'userA',
        marketId: market.config.marketId,
      });
    } finally {
      manager.destroy();
      session.destroy();
    }
  });

  it('replays YES share-price points when a share channel subscribes', () => {
    const session = new MarketSession();
    const manager = new WsManager({ heartbeatMs: 60_000 });
    const broadcaster = new Broadcaster(manager);
    try {
      manager.setSession(session);
      session.setBroadcaster(broadcaster);
      const market = session.startDemo();
      session.placeOrder({
        userId: 'userA',
        marketId: market.config.marketId,
        side: 'YES',
        action: 'BUY',
        type: 'LIMIT',
        oddsPriceCents: oddsPriceCents(55),
        size: shares(10),
        tif: 'GTC',
      });

      const ws = makeFakeWs();
      manager.addConnection(ws as unknown as WebSocket);
      manager.subscribe(ws as unknown as WebSocket, [sharePriceChannel(market.config.marketId)]);

      const snapshot = ws.sent.find((event) => event.type === 'share_price_snapshot');
      expect(snapshot).toMatchObject({
        type: 'share_price_snapshot',
        marketId: market.config.marketId,
      });
      const sharePoint = ws.sent.find((event) => event.type === 'share_price');
      expect(sharePoint).toMatchObject({ type: 'share_price', marketId: market.config.marketId });
      expect(sharePoint?.type === 'share_price' && sharePoint.point.yesPriceCents).toBeGreaterThan(0);
    } finally {
      manager.destroy();
      session.destroy();
    }
  });

  it('keeps legacy share channel alias working during the protocol migration', () => {
    const session = new MarketSession();
    const manager = new WsManager({ heartbeatMs: 60_000 });
    try {
      manager.setSession(session);
      const market = session.startDemo();

      const ws = makeFakeWs();
      manager.addConnection(ws as unknown as WebSocket);
      manager.subscribe(ws as unknown as WebSocket, [shareChannel(market.config.marketId)]);

      expect(ws.sent.some((event) => event.type === 'share_price_snapshot')).toBe(true);
      expect(ws.sent.some((event) => event.type === 'share_price')).toBe(true);
    } finally {
      manager.destroy();
      session.destroy();
    }
  });

  it('sends rich market snapshots on subscribe', () => {
    const session = new MarketSession();
    const manager = new WsManager({ heartbeatMs: 60_000 });
    try {
      manager.setSession(session);
      const market = session.startDemo();

      const ws = makeFakeWs();
      manager.addConnection(ws as unknown as WebSocket);
      manager.subscribe(ws as unknown as WebSocket, [`market:${market.config.marketId}`]);

      const snapshot = ws.sent.find((event) => event.type === 'market_snapshot');
      expect(snapshot).toMatchObject({
        type: 'market_snapshot',
        countdownMs: expect.any(Number),
      });
      expect(snapshot?.type === 'market_snapshot' && snapshot.orderbook?.marketId).toBe(market.config.marketId);
      expect(snapshot?.type === 'market_snapshot' && Array.isArray(snapshot.recentTrades)).toBe(true);
      expect(snapshot?.type === 'market_snapshot' && snapshot.sharePrice?.yesPriceCents).toBeGreaterThan(0);
    } finally {
      manager.destroy();
      session.destroy();
    }
  });

  it('replays public and user resolution events after reconnect', () => {
    vi.useFakeTimers();
    const session = new MarketSession();
    const manager = new WsManager({ heartbeatMs: 60_000 });
    const broadcaster = new Broadcaster(manager);
    try {
      manager.setSession(session);
      session.setBroadcaster(broadcaster);
      const market = session.startDemo();
      session.placeOrder({
        userId: 'userA',
        marketId: market.config.marketId,
        side: 'YES',
        action: 'BUY',
        type: 'LIMIT',
        oddsPriceCents: oddsPriceCents(60),
        size: shares(5),
        tif: 'GTC',
      });
      session.placeOrder({
        userId: 'userB',
        marketId: market.config.marketId,
        side: 'YES',
        action: 'SELL',
        type: 'LIMIT',
        oddsPriceCents: oddsPriceCents(60),
        size: shares(5),
        tif: 'IOC',
      });

      vi.advanceTimersByTime(2 * 60 * 1000 + 3000);

      const ws = makeFakeWs();
      manager.addConnection(ws as unknown as WebSocket);
      manager.subscribe(ws as unknown as WebSocket, [
        `market:${market.config.marketId}`,
        userChannel('userA'),
      ]);

      expect(ws.sent.some((event) => event.type === 'resolution')).toBe(true);
      expect(ws.sent.some((event) => event.type === 'pnl_update')).toBe(true);
    } finally {
      manager.destroy();
      session.destroy();
    }
  });
});

async function startServer(): Promise<TestServer> {
  const session = new MarketSession();
  const manager = new WsManager({ heartbeatMs: 60_000 });
  const broadcaster = new Broadcaster(manager);
  session.setBroadcaster(broadcaster);
  manager.setSession(session);
  const server = await buildServer(session, manager);
  await server.listen({ host: '127.0.0.1', port: 0 });
  const address = server.server.address() as AddressInfo;
  const testServer = { session, manager, server, url: `ws://127.0.0.1:${address.port}/ws` };
  openServers.push(testServer);
  return testServer;
}

async function connect(url: string): Promise<LiveWs> {
  const ws = new WebSocket(url);
  const events: ServerEvent[] = [];
  openSockets.push(ws);
  ws.on('message', (data) => {
    events.push(JSON.parse(data.toString()) as ServerEvent);
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return { ws, events };
}

async function waitForEvent(
  live: LiveWs,
  predicate: (event: ServerEvent, index: number) => boolean,
): Promise<ServerEvent> {
  const existing = live.events.find(predicate);
  if (existing) return existing;

  return await new Promise<ServerEvent>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WS event')), 1000);
    live.ws.on('message', () => {
      const event = live.events.find(predicate);
      if (!event) return;
      clearTimeout(timer);
      resolve(event);
    });
    live.ws.once('error', reject);
  });
}

function makeFakeWs(): FakeWs {
  return {
    readyState: WebSocket.OPEN,
    sent: [],
    send(data: string) {
      this.sent.push(JSON.parse(data) as ServerEvent);
    },
    on() {},
    close() {
      this.readyState = WebSocket.CLOSED;
    },
    ping() {},
    terminate() {
      this.readyState = WebSocket.CLOSED;
    },
  };
}
