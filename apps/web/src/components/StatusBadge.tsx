import type { MarketStatus, RampResolution } from '@jet/shared';

interface Props {
  status: MarketStatus;
  resolution: RampResolution | null;
}

const STYLES: Record<MarketStatus, { background: string; color: string }> = {
  open:      { background: '#14532d', color: '#86efac' },
  resolving: { background: '#78350f', color: '#fde68a' },
  resolved:  { background: '#1e3a5f', color: '#93c5fd' },
};

export default function StatusBadge({ status, resolution }: Props) {
  const style = STYLES[status];
  const label =
    status === 'resolved' && resolution
      ? `RESOLVED · ${resolution.outcome}`
      : status.toUpperCase();

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.3rem 0.8rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        ...style,
      }}
    >
      {label}
    </span>
  );
}
