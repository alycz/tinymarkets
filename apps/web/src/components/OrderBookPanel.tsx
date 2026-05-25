import type { CSSProperties } from 'react';
import type { OrderBookSnapshot } from '@jet/shared';
import { C, S } from '../theme.js';
import { formatPriceCents } from '../format.js';
import Panel from './Panel.js';

const ROWS = 8;

type BookLevel = OrderBookSnapshot['bids'][number];

interface Props {
  snapshot: OrderBookSnapshot | null;
  onSelectLevel: (level: BookLevel, side: 'bid' | 'ask') => void;
}

export default function OrderBookPanel({ snapshot, onSelectLevel }: Props) {
  return (
    <Panel title="Canonical YES Order Book">
      <div style={helperStyle}>
        One YES book. NO price is always 1 - YES.
      </div>
      {!snapshot || (snapshot.bids.length === 0 && snapshot.asks.length === 0) ? (
        <Empty />
      ) : (
        <BookLadder snapshot={snapshot} onSelectLevel={onSelectLevel} />
      )}
    </Panel>
  );
}

function BookLadder({
  snapshot,
  onSelectLevel,
}: {
  snapshot: OrderBookSnapshot;
  onSelectLevel: (level: BookLevel, side: 'bid' | 'ask') => void;
}) {
  const bids = snapshot.bids.slice(0, ROWS);
  const asks = snapshot.asks.slice(0, ROWS);
  const allSizes = [...bids, ...asks].map((level) => level.size as number);
  const maxSize = allSizes.length > 0 ? Math.max(...allSizes) : 1;

  return (
    <div>
      <Header />
      {[...asks].reverse().map((level) => (
        <BookRow
          key={`ask-${level.yesPriceCents}`}
          level={level}
          total={cumulativeSize(asks, level.yesPriceCents, 'ask')}
          maxSize={maxSize}
          side="ask"
          onSelect={() => onSelectLevel(level, 'ask')}
        />
      ))}
      <div style={midlineStyle}>
        <span>Spread</span>
        <span>{formatSpread(bids[0]?.yesPriceCents, asks[0]?.yesPriceCents)}</span>
      </div>
      {bids.map((level) => (
        <BookRow
          key={`bid-${level.yesPriceCents}`}
          level={level}
          total={cumulativeSize(bids, level.yesPriceCents, 'bid')}
          maxSize={maxSize}
          side="bid"
          onSelect={() => onSelectLevel(level, 'bid')}
        />
      ))}
    </div>
  );
}

function Header() {
  return (
    <div style={{ ...rowStyle, color: C.textMute, fontSize: 10, letterSpacing: '0.08em', marginBottom: S.xs }}>
      <span>YES</span>
      <span>NO</span>
      <span style={{ textAlign: 'right' }}>SIZE</span>
      <span style={{ textAlign: 'right' }}>TOTAL</span>
    </div>
  );
}

function BookRow({
  level,
  total,
  maxSize,
  side,
  onSelect,
}: {
  level: BookLevel;
  total: number;
  maxSize: number;
  side: 'bid' | 'ask';
  onSelect: () => void;
}) {
  const yesPriceCents = level.yesPriceCents;
  const noPriceCents = 100 - yesPriceCents;
  const size = level.size as number;
  const barWidth = maxSize > 0 ? (size / maxSize) * 100 : 0;
  const barColor = side === 'bid' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
  const textColor = side === 'bid' ? C.yes : C.no;
  const title = side === 'ask' ? 'Click to buy YES at this ask' : 'Click to sell YES at this bid';

  return (
    <button
      type="button"
      title={title}
      onClick={onSelect}
      style={{
        ...rowStyle,
        ...buttonRowStyle,
        color: C.text,
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
      <span style={{ color: textColor, fontWeight: 700, position: 'relative' }}>
        {formatPriceCents(yesPriceCents)}
      </span>
      <span style={{ color: C.textDim, position: 'relative' }}>{formatPriceCents(noPriceCents as typeof yesPriceCents)}</span>
      <span style={{ color: C.text, textAlign: 'right', position: 'relative' }}>{size}</span>
      <span style={{ color: C.textDim, textAlign: 'right', position: 'relative' }}>{total}</span>
    </button>
  );
}

function cumulativeSize(levels: BookLevel[], price: BookLevel['yesPriceCents'], side: 'bid' | 'ask'): number {
  if (side === 'bid') {
    return levels
      .filter((level) => level.yesPriceCents >= price)
      .reduce((sum, level) => sum + (level.size as number), 0);
  }
  return levels
    .filter((level) => level.yesPriceCents <= price)
    .reduce((sum, level) => sum + (level.size as number), 0);
}

function formatSpread(bid?: BookLevel['yesPriceCents'], ask?: BookLevel['yesPriceCents']): string {
  if (bid == null || ask == null) return '--';
  return `${Math.max(0, ask - bid)} cents`;
}

function Empty() {
  return (
    <div style={{ color: C.textMute, fontSize: 13, padding: `${S.lg}px 0`, textAlign: 'center' }}>
      Waiting for liquidity
    </div>
  );
}

const helperStyle: CSSProperties = {
  color: C.textMute,
  fontSize: 11,
  marginBottom: S.sm,
};

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr 1fr',
  gap: S.xs,
  alignItems: 'center',
};

const buttonRowStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  border: 'none',
  background: 'transparent',
  fontFamily: 'inherit',
  fontSize: 12,
  padding: `3px ${S.xs}px`,
  marginBottom: 2,
  overflow: 'hidden',
  cursor: 'pointer',
  textAlign: 'left',
};

const midlineStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderTop: `1px solid ${C.border}`,
  borderBottom: `1px solid ${C.border}`,
  color: C.textMute,
  fontSize: 11,
  fontWeight: 700,
  padding: `${S.xs}px 0`,
  margin: `${S.xs}px 0`,
};
