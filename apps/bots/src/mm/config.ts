import { clamp, floatEnv, intEnv, parseLevelSizes, readApiBaseUrl, readWsUrl } from '../lib/env.js';

export interface MmConfig {
  apiBaseUrl: string;
  wsUrl: string;
  botUserId: string;
  levelSizes: number[];
  baseSpreadCents: number;
  requoteMs: number;
  requoteJitterRatio: number;
  requoteFairMoveCents: number;
  volatilityScaleCents: number;
  sizeJitterMin: number;
  sizeJitterMax: number;
}

export function loadConfig(): MmConfig {
  const sizeJitterMin = Math.max(0.01, floatEnv('SIZE_JITTER_MIN', 0.75));
  const sizeJitterMax = Math.max(sizeJitterMin, floatEnv('SIZE_JITTER_MAX', 1.35));

  return {
    apiBaseUrl: readApiBaseUrl(),
    wsUrl: readWsUrl(),
    botUserId: process.env['BOT_USER_ID'] ?? 'market-maker-1',
    levelSizes: parseLevelSizes(process.env['LEVEL_SIZES'] ?? '25,50,100,150,250'),
    baseSpreadCents: intEnv('BASE_SPREAD_CENTS', 5),
    requoteMs: intEnv('REQUOTE_MS', 1000),
    requoteJitterRatio: clamp(floatEnv('REQUOTE_JITTER_RATIO', 0.1), 0, 0.5),
    requoteFairMoveCents: intEnv('REQUOTE_FAIR_MOVE_CENTS', 1),
    volatilityScaleCents: intEnv('FAIR_VALUE_VOL_SCALE_CENTS', 25000),
    sizeJitterMin,
    sizeJitterMax,
  };
}
