export const API_URL = readUrlEnv('VITE_API_URL', ['http:', 'https:'], 'http://localhost:3001');
export const WS_URL = readUrlEnv('VITE_WS_URL', ['ws:', 'wss:'], 'ws://localhost:3001/ws');
export const DEMO_USER_ID = (import.meta.env['VITE_DEMO_USER_ID'] as string | undefined) ?? 'demo';

function readUrlEnv(name: 'VITE_API_URL' | 'VITE_WS_URL', protocols: string[], fallback: string): string {
  const raw = (import.meta.env[name] as string | undefined) ?? fallback;

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

  if (name === 'VITE_API_URL' && url.pathname !== '/') {
    throw new Error('VITE_API_URL must be an origin with no path');
  }
  if (name === 'VITE_WS_URL' && !url.pathname.endsWith('/ws')) {
    throw new Error('VITE_WS_URL must include the /ws endpoint');
  }

  return normalized;
}
