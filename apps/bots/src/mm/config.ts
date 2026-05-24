export interface MmConfig {
  apiBaseUrl: string;
  wsUrl: string;
  botUserId: string;
  levels: number;
  sizePerLevel: number;
  halfSpreadCents: number;
  levelStepCents: number;
  requoteMs: number;
  baseSigma: number;
}

export function loadConfig(): MmConfig {
  return {
    apiBaseUrl: process.env['API_BASE_URL'] ?? 'http://localhost:3001',
    wsUrl: process.env['WS_URL'] ?? 'ws://localhost:3001/ws',
    botUserId: process.env['BOT_USER_ID'] ?? 'mm-bot',
    levels: parseInt(process.env['LEVELS'] ?? '5', 10),
    sizePerLevel: parseInt(process.env['SIZE_PER_LEVEL'] ?? '20', 10),
    halfSpreadCents: parseInt(process.env['HALF_SPREAD_CENTS'] ?? '2', 10),
    levelStepCents: parseInt(process.env['LEVEL_STEP_CENTS'] ?? '1', 10),
    requoteMs: parseInt(process.env['REQUOTE_MS'] ?? '1500', 10),
    baseSigma: parseFloat(process.env['BASE_SIGMA'] ?? '0.005'),
  };
}
