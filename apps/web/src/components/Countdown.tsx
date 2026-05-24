import type { MarketStatus } from '@jet/shared';

interface Props {
  msRemaining: number;
  status: MarketStatus;
}

export default function Countdown({ msRemaining, status }: Props) {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const urgent = msRemaining > 0 && msRemaining < 15_000;
  const color = status === 'resolved' ? '#444' : urgent ? '#ef4444' : '#f0f0f0';

  return (
    <div style={{ fontSize: '2.5rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
      {display}
    </div>
  );
}
