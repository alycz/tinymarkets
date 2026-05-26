export function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function floatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function parseLevelSizes(raw: string): number[] {
  const sizes = raw
    .split(',')
    .map((part) => parseInt(part.trim(), 10))
    .filter((size) => Number.isInteger(size) && size > 0);
  return sizes.length > 0 ? sizes : [25, 50, 100, 150, 250];
}

export function readApiBaseUrl(): string {
  return readUrlEnv('API_BASE_URL', ['http:', 'https:'], 'http://localhost:3001');
}

export function readWsUrl(): string {
  return readUrlEnv('WS_URL', ['ws:', 'wss:'], 'ws://localhost:3001/ws');
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
