import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WsClient as MmWsClient } from '../mm/ws-client.js';
import { WsClient as TakersWsClient } from '../takers/ws-client.js';

interface MockSocket {
  close: ReturnType<typeof vi.fn>;
  emit: (event: string) => void;
  removeAllListeners: ReturnType<typeof vi.fn>;
}

const wsInstances = vi.hoisted(() => [] as MockSocket[]);

vi.mock('ws', () => {
  class MockWebSocket {
    static readonly OPEN = 1;

    readonly close = vi.fn(() => {
      this.emit('close');
    });

    readonly removeAllListeners = vi.fn(() => {
      this.listeners.clear();
    });

    private readonly listeners = new Map<string, Array<() => void>>();

    constructor(readonly url: string) {
      wsInstances.push(this);
    }

    on(event: string, callback: () => void): this {
      const listeners = this.listeners.get(event) ?? [];
      listeners.push(callback);
      this.listeners.set(event, listeners);
      return this;
    }

    send(): void {}

    emit(event: string): void {
      for (const callback of this.listeners.get(event) ?? []) callback();
    }
  }

  return { default: MockWebSocket };
});

describe('bot WebSocket lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    wsInstances.length = 0;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    wsInstances.length = 0;
  });

  it('reconnects the market maker client while active', async () => {
    const client = new MmWsClient('ws://localhost:3001/ws', {});
    client.connect();

    wsInstances[0]!.emit('close');
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(250);

    expect(wsInstances).toHaveLength(2);
  });

  it('clears a pending market maker reconnect on destroy', async () => {
    const client = new MmWsClient('ws://localhost:3001/ws', {});
    client.connect();

    wsInstances[0]!.emit('close');
    client.destroy();
    await vi.advanceTimersByTimeAsync(250);

    expect(wsInstances).toHaveLength(1);
    expect(wsInstances[0]!.removeAllListeners).toHaveBeenCalledTimes(1);
    expect(wsInstances[0]!.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reconnects the takers client while active', async () => {
    const client = new TakersWsClient('ws://localhost:3001/ws', {});
    client.connect();

    wsInstances[0]!.emit('close');
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(250);

    expect(wsInstances).toHaveLength(2);
  });

  it('clears a pending takers reconnect on destroy', async () => {
    const client = new TakersWsClient('ws://localhost:3001/ws', {});
    client.connect();

    wsInstances[0]!.emit('close');
    client.destroy();
    await vi.advanceTimersByTimeAsync(250);

    expect(wsInstances).toHaveLength(1);
    expect(wsInstances[0]!.removeAllListeners).toHaveBeenCalledTimes(1);
    expect(wsInstances[0]!.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
