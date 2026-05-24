export const API_URL = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3001';
export const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';
export const DEMO_USER_ID = (import.meta.env['VITE_DEMO_USER_ID'] as string | undefined) ?? 'demo';
