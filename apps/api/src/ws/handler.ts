import type { WebSocket, RawData } from 'ws';
import { type Channel, type ClientMessage, timestampMs } from '@jet/shared';
import type { WsManager } from './manager.js';

export function handleMessage(ws: WebSocket, rawData: RawData, manager: WsManager): void {
  let msg: ClientMessage;
  try {
    const str = Buffer.isBuffer(rawData)
      ? rawData.toString('utf8')
      : rawData instanceof ArrayBuffer
        ? Buffer.from(rawData).toString('utf8')
        : Buffer.concat(rawData as Buffer[]).toString('utf8');
    msg = JSON.parse(str) as ClientMessage;
  } catch {
    trySend(ws, JSON.stringify({ type: 'error', code: 'VALIDATION', message: 'Invalid JSON' }));
    return;
  }

  switch (msg.type) {
    case 'subscribe':
      manager.subscribe(ws, msg.channels as Channel[]);
      break;
    case 'unsubscribe':
      manager.unsubscribe(ws, msg.channels as Channel[]);
      break;
    case 'ping':
      trySend(ws, JSON.stringify({ type: 'pong', ts: timestampMs(Date.now()) }));
      break;
  }
}

function trySend(ws: WebSocket, data: string): void {
  try {
    if (ws.readyState === 1 /* OPEN */) ws.send(data);
  } catch { /* ignore */ }
}
