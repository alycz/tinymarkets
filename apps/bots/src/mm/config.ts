import { intEnv, parseLevelSizes, readApiBaseUrl, readWsUrl } from '../lib/env.js';

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
    apiBaseUrl: readApiBaseUrl(),
    wsUrl: readWsUrl(),
    botUserId: process.env['BOT_USER_ID'] ?? 'market-maker-1',
    levelSizes: parseLevelSizes(process.env['LEVEL_SIZES'] ?? '25,50,100,150,250'),
    baseSpreadCents: intEnv('BASE_SPREAD_CENTS', 5),
    requoteMs: intEnv('REQUOTE_MS', 1000),
    requoteFairMoveCents: intEnv('REQUOTE_FAIR_MOVE_CENTS', 2),
    volatilityScaleCents: intEnv('FAIR_VALUE_VOL_SCALE_CENTS', 50000),
  };
}
