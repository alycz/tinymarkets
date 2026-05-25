export interface MmConfig {
  apiBaseUrl: string;
  wsUrl: string;
  botUserId: string;
  levelSizes: number[];
  baseSpreadCents: number;
  requoteMs: number;
  requoteFairMoveCents: number;
  volatilityScaleCents: number;
}

export function loadConfig(): MmConfig {
  return {
    apiBaseUrl: readUrlEnv('API_BASE_URL', ['http:', 'https:'], 'http://localhost:3001'),
    wsUrl: readUrlEnv('WS_URL', ['ws:', 'wss:'], 'ws://localhost:3001/ws'),
    botUserId: process.env['BOT_USER_ID'] ?? 'market-maker-1',
    levelSizes: parseLevelSizes(process.env['LEVEL_SIZES'] ?? '50,100,150'),
    baseSpreadCents: parseInt(process.env['BASE_SPREAD_CENTS'] ?? '5', 10),
    requoteMs: parseInt(process.env['REQUOTE_MS'] ?? '1000', 10),
    requoteFairMoveCents: parseInt(process.env['REQUOTE_FAIR_MOVE_CENTS'] ?? '2', 10),
    volatilityScaleCents: parseInt(process.env['FAIR_VALUE_VOL_SCALE_CENTS'] ?? '50000', 10),
  };
}

function parseLevelSizes(raw: string): number[] {
  const sizes = raw
    .split(',')
    .map((part) => parseInt(part.trim(), 10))
    .filter((size) => Number.isInteger(size) && size > 0);
  return sizes.length > 0 ? sizes : [50, 100, 150];
}

function readUrlEnv(name: 'API_BASE_URL' | 'WS_URL', protocols: string[], fallback: string): string {
  const raw = process.env[name] ?? fallback;

  const normalized = raw.replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }

  if (!protocols.includes(url.protocol)) {
    throw new Error(`${name} must use one of: ${protocols.join(', ')}`);
  }
  if (name === 'API_BASE_URL' && url.pathname !== '/') {
    throw new Error('API_BASE_URL must be an origin with no path');
  }
  if (name === 'WS_URL' && !url.pathname.endsWith('/ws')) {
    throw new Error('WS_URL must include the /ws endpoint');
  }

  return normalized;
}
