export interface TakersConfig {
  apiBaseUrl: string;
  wsUrl: string;
  numTakers: number;
  rateLimitTps: number;
  minIntervalMs: number;
  maxIntervalMs: number;
  baseSigma: number;
  fadeRatio: number;
  userIdPrefix: string;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function floatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function loadConfig(): TakersConfig {
  const minIntervalMs = Math.max(250, intEnv('MIN_INTERVAL_MS', 2_500));
  const maxIntervalMs = Math.max(minIntervalMs, intEnv('MAX_INTERVAL_MS', 8_000));

  return {
    apiBaseUrl: readUrlEnv('API_BASE_URL', ['http:', 'https:']),
    wsUrl: readUrlEnv('WS_URL', ['ws:', 'wss:']),
    numTakers: clamp(intEnv('NUM_TAKERS', 30), 1, 100),
    rateLimitTps: Math.max(0.1, floatEnv('RATE_LIMIT_TPS', 4)),
    minIntervalMs,
    maxIntervalMs,
    baseSigma: Math.max(0.0001, floatEnv('BASE_SIGMA', 0.005)),
    fadeRatio: clamp(floatEnv('FADE_RATIO', 0.15), 0, 1),
    userIdPrefix: process.env['USER_ID_PREFIX'] ?? 'taker',
  };
}

function readUrlEnv(name: 'API_BASE_URL' | 'WS_URL', protocols: string[]): string {
  const raw = process.env[name];
  if (!raw) {
    throw new Error(`${name} is required`);
  }

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
