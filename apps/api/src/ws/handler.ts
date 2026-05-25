import type { WebSocket, RawData } from 'ws';
import {
  CHANNEL_KINDS,
  type Channel,
  type ChannelKind,
  type ClientMessage,
  timestampMs,
} from '@jet/shared';
import type { WsManager } from './manager.js';

const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_CHANNELS_PER_MESSAGE = 20;
const MAX_CHANNEL_ID_LENGTH = 128;
const SAFE_CHANNEL_ID_RE = /^[A-Za-z0-9._:-]+$/;
const VALID_CHANNEL_KINDS = new Set<string>(CHANNEL_KINDS);

type ValidationResult = { ok: true; message: ClientMessage } | { ok: false; error: string };

export function handleMessage(ws: WebSocket, rawData: RawData, manager: WsManager): void {
  if (rawByteLength(rawData) > MAX_MESSAGE_BYTES) {
    sendValidationError(ws, 'Message is too large');
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawToUtf8(rawData)) as unknown;
  } catch {
    sendValidationError(ws, 'Invalid JSON');
    return;
  }

  const validation = validateClientMessage(parsed);
  if (!validation.ok) {
    sendValidationError(ws, validation.error);
    return;
  }

  const msg = validation.message;
  switch (msg.type) {
    case 'subscribe':
      manager.subscribe(ws, msg.channels);
      break;
    case 'unsubscribe':
      manager.unsubscribe(ws, msg.channels);
      break;
    case 'ping':
      trySend(ws, JSON.stringify({ type: 'pong', ts: timestampMs(Date.now()) }));
      break;
  }
}

function validateClientMessage(value: unknown): ValidationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid('Message must be an object');
  }

  const msg = value as Record<string, unknown>;
  switch (msg['type']) {
    case 'subscribe':
    case 'unsubscribe': {
      const channels = validateChannels(msg['channels']);
      if (!channels.ok) return channels;
      return { ok: true, message: { type: msg['type'], channels: channels.channels } };
    }
    case 'ping': {
      const ts = msg['ts'];
      if (
        ts !== undefined &&
        (typeof ts !== 'number' || !Number.isFinite(ts) || !Number.isInteger(ts) || ts < 0)
      ) {
        return invalid('ping.ts must be a non-negative integer when provided');
      }
      return {
        ok: true,
        message: ts === undefined ? { type: 'ping' } : { type: 'ping', ts: timestampMs(ts) },
      };
    }
    default:
      return invalid('type must be subscribe, unsubscribe, or ping');
  }
}

function validateChannels(value: unknown): { ok: true; channels: Channel[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) {
    return invalid('channels must be an array');
  }
  if (value.length > MAX_CHANNELS_PER_MESSAGE) {
    return invalid(`channels must contain ${MAX_CHANNELS_PER_MESSAGE} or fewer items`);
  }

  const channels: Channel[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') {
      return invalid('channels must contain only strings');
    }
    const channel = validateChannel(raw);
    if (!channel.ok) return channel;
    channels.push(channel.channel);
  }
  return { ok: true, channels };
}

function validateChannel(raw: string): { ok: true; channel: Channel } | { ok: false; error: string } {
  const idx = raw.indexOf(':');
  if (idx <= 0) {
    return invalid('channel must use <kind>:<id> form');
  }

  const kind = raw.slice(0, idx);
  const id = raw.slice(idx + 1);
  if (!VALID_CHANNEL_KINDS.has(kind)) {
    return invalid('channel kind must be market, book, trades, oracle, or user');
  }
  if (id.length === 0) {
    return invalid('channel id is required');
  }
  if (id.length > MAX_CHANNEL_ID_LENGTH) {
    return invalid(`channel id must be ${MAX_CHANNEL_ID_LENGTH} characters or fewer`);
  }
  if (!SAFE_CHANNEL_ID_RE.test(id)) {
    return invalid('channel id contains unsupported characters');
  }
  return { ok: true, channel: `${kind as ChannelKind}:${id}` };
}

function invalid(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function rawByteLength(rawData: RawData): number {
  if (Buffer.isBuffer(rawData)) return rawData.length;
  if (rawData instanceof ArrayBuffer) return rawData.byteLength;
  return (rawData as Buffer[]).reduce((total, buf) => total + buf.length, 0);
}

function rawToUtf8(rawData: RawData): string {
  if (Buffer.isBuffer(rawData)) return rawData.toString('utf8');
  if (rawData instanceof ArrayBuffer) return Buffer.from(rawData).toString('utf8');
  return Buffer.concat(rawData as Buffer[]).toString('utf8');
}

function sendValidationError(ws: WebSocket, message: string): void {
  trySend(ws, JSON.stringify({ type: 'error', code: 'VALIDATION', message }));
}

function trySend(ws: WebSocket, data: string): void {
  try {
    if (ws.readyState === 1 /* OPEN */) ws.send(data);
  } catch { /* ignore */ }
}
