import { clamp, floatEnv, intEnv, readApiBaseUrl, readWsUrl } from '../lib/env.js';

export interface TakersConfig {
  apiBaseUrl: string;
  wsUrl: string;
  numTakers: number;
  rateLimitTps: number;
  minIntervalMs: number;
  maxIntervalMs: number;
  volatilityScaleCents: number;
  minContrarianRatio: number;
  maxContrarianRatio: number;
  userIdPrefix: string;
}

export function loadConfig(): TakersConfig {
  const minIntervalMs = Math.max(250, intEnv('MIN_INTERVAL_MS', 250));
  const maxIntervalMs = Math.max(minIntervalMs, intEnv('MAX_INTERVAL_MS', 1_500));

  return {
    apiBaseUrl: readApiBaseUrl(),
    wsUrl: readWsUrl(),
    numTakers: clamp(intEnv('NUM_TAKERS', 75), 50, 100),
    rateLimitTps: Math.max(0.1, floatEnv('RATE_LIMIT_TPS', 6)),
    minIntervalMs,
    maxIntervalMs,
    volatilityScaleCents: Math.max(1, intEnv('FAIR_VALUE_VOL_SCALE_CENTS', 50000)),
    minContrarianRatio: clamp(floatEnv('MIN_CONTRARIAN_RATIO', 0.2), 0, 1),
    maxContrarianRatio: clamp(floatEnv('MAX_CONTRARIAN_RATIO', 0.35), 0, 1),
    userIdPrefix: process.env['USER_ID_PREFIX'] ?? 'taker',
  };
}
