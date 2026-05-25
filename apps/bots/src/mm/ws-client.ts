import { BotWsClient } from '../lib/ws-client.js';
import type { BotWsCallbacks } from '../lib/ws-client.js';

export type WsCallbacks = BotWsCallbacks;

export class WsClient extends BotWsClient {
  constructor(url: string, callbacks: BotWsCallbacks) {
    super(url, callbacks, '[ws]');
  }
}
