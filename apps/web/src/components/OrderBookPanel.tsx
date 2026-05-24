import type { CSSProperties } from 'react';
import type { OrderBookSnapshot } from '@jet/shared';
import { C, S } from '../theme.js';
import { formatPriceCents } from '../format.js';
import Panel from './Panel.js';

const ROWS = 8;

interface Props {
  snapshot: OrderBookSnapshot | null;
}

export default function OrderBookPanel({ snapshot }: Props) {
  return (
    <Panel title="Order Book">
      {!snapshot || (snapshot.bids.length === 0 && snapshot.asks.length === 0) ? (
        <Empty />
      ) : (
        <BookLadder snapshot={snapshot} />
      )}
    </Panel>
  );
}

function BookLadder({ snapshot }: { snapshot: OrderBookSnapshot }) {
  const bids = snapshot.bids.slice(0, ROWS);
  const asks = snapshot.asks.slice(0, ROWS);
  const allSizes = [...bids, ...asks].map((l) => l.size as number);
  const maxSize = allSizes.length > 0 ? Math.max(...allSizes) : 1;

  return (
    <div>
      <Header />
      {[...asks].reverse().map((level) => (
        <BookRow
          key={`ask-${level.yesPriceCents}`}
          yesPriceCents={level.yesPriceCents}
          size={level.size as number}
          maxSize={maxSize}
          side="ask"
        />
      ))}
      <div style={{ height: 1, background: C.border, margin: `${S.xs}px 0` }} />
      {bids.map((level) => (
        <BookRow
          key={`bid-${level.yesPriceCents}`}
          yesPriceCents={level.yesPriceCents}
          size={level.size as number}
          maxSize={maxSize}
          side="bid"
        />
      ))}
    </div>
  );
}

function Header() {
  return (
    <div style={{ ...rowStyle, color: C.textMute, fontSize: 10, letterSpacing: '0.08em', marginBottom: S.xs }}>
      <span>YES ¢</span>
      <span>NO ¢</span>
      <span style={{ textAlign: 'right' }}>SIZE</span>
    </div>
  );
}

function BookRow({
  yesPriceCents,
  size,
  maxSize,
  side,
}: {
  yesPriceCents: number;
  size: number;
  maxSize: number;
  side: 'bid' | 'ask';
}) {
  const noPriceCents = 100 - yesPriceCents;
  const barWidth = maxSize > 0 ? (size / maxSize) * 100 : 0;
  const barColor = side === 'bid' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
  const textColor = side === 'bid' ? C.yes : C.no;

  return (
    <div
      style={{
        ...rowStyle,
        position: 'relative',
        fontSize: 12,
        padding: `2px ${S.xs}px`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: `${barWidth}%`,
          background: barColor,
        }}
      />
      <span style={{ color: textColor, fontWeight: 600, position: 'relative' }}>
        {formatPriceCents(yesPriceCents as Parameters<typeof formatPriceCents>[0])}
      </span>
      <span style={{ color: C.textDim, position: 'relative' }}>{noPriceCents}¢</span>
      <span style={{ color: C.text, textAlign: 'right', position: 'relative' }}>{size}</span>
    </div>
  );
}

function Empty() {
  return (
    <div style={{ color: C.textMute, fontSize: 13, padding: `${S.lg}px 0`, textAlign: 'center' }}>
      Waiting for liquidity
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  gap: S.xs,
  marginBottom: 2,
};
