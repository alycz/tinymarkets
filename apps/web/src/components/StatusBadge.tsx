import type { MarketStatus, VenueWeightedTwapResolution } from '@jet/shared';
import { C, mono } from '../theme.js';

interface Props {
  status: MarketStatus;
  resolution: VenueWeightedTwapResolution | null;
}

interface BadgeStyle {
  background: string;
  color: string;
  dot: string;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const STYLES: Record<MarketStatus, BadgeStyle> = {
  open:      { background: C.yesSoft, color: C.yes, dot: C.yes },
  resolving: { background: C.warnSoft, color: C.warn, dot: C.warn },
  resolved:  { background: C.accentSoft, color: C.accent, dot: C.accent },
};

export default function StatusBadge({ status, resolution }: Props) {
  let style = STYLES[status];
  let label = titleCase(status);

  if (status === 'resolved' && resolution) {
    label = `Resolved · ${titleCase(resolution.outcome)}`;
    if (resolution.outcome === 'YES') {
      style = { background: C.yesSoft, color: C.yes, dot: C.yes };
    } else {
      style = { background: C.noSoft, color: C.no, dot: C.no };
    }
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 9px',
        borderRadius: 0,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.02em',
        fontFamily: mono,
        background: style.background,
        color: style.color,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: style.dot,
          boxShadow: `0 0 8px ${style.dot}`,
        }}
      />
      {label}
    </span>
  );
}
