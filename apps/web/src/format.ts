import type { Bps, PriceCents, UsdCents } from '@jet/shared';

export function formatUsdCents(c: UsdCents): string {
  const abs = Math.abs(c);
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  const sign = c < 0 ? '-' : '';
  const dollarsFormatted = new Intl.NumberFormat('en-US').format(dollars);
  return `${sign}$${dollarsFormatted}.${String(cents).padStart(2, '0')}`;
}

export function formatPriceCents(p: PriceCents): string {
  return `${p}¢`;
}

export function formatBps(b: Bps): string {
  return `${(b as number).toFixed(1)} bps`;
}

export function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ago`;
}
