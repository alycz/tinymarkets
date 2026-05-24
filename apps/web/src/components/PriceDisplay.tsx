import type { IndicativeSnapshot } from '@jet/shared';

interface Props {
  snapshot: IndicativeSnapshot | null;
}

export default function PriceDisplay({ snapshot }: Props) {
  if (!snapshot) {
    return <p style={{ color: '#555', fontSize: '1rem' }}>Waiting for price…</p>;
  }

  const price = (snapshot.priceCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const healthyVenues = snapshot.venues.filter((v) => v.healthy).length;

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ fontSize: '0.7rem', color: '#666', letterSpacing: '0.12em', marginBottom: '0.4rem' }}>
        BTC / USD  ·  INDICATIVE
      </div>
      <div style={{ fontSize: '3rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
        {price}
      </div>
      <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '0.4rem' }}>
        {snapshot.confidence} confidence · {snapshot.dispersionState} · {healthyVenues} venues
      </div>
    </div>
  );
}
