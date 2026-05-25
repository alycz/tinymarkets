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
    apiBaseUrl: readUrlEnv('API_BASE_URL', ['http:', 'https:'], 'http://localhost:3001'),
    wsUrl: readUrlEnv('WS_URL', ['ws:', 'wss:'], 'ws://localhost:3001/ws'),
    botUserId: process.env['BOT_USER_ID'] ?? 'mm-bot',
    levels: parseInt(process.env['LEVELS'] ?? '5', 10),
    sizePerLevel: parseInt(process.env['SIZE_PER_LEVEL'] ?? '20', 10),
    halfSpreadCents: parseInt(process.env['HALF_SPREAD_CENTS'] ?? '2', 10),
    levelStepCents: parseInt(process.env['LEVEL_STEP_CENTS'] ?? '1', 10),
    requoteMs: parseInt(process.env['REQUOTE_MS'] ?? '1500', 10),
    baseSigma: parseFloat(process.env['BASE_SIGMA'] ?? '0.005'),
  };
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
