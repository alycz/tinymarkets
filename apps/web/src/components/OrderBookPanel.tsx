import type { CSSProperties } from 'react';
import type { OrderBookSnapshot } from '@jet/shared';
import { C, S, T, mono } from '../theme.js';
import { formatPriceCents } from '../format.js';
import Panel from './Panel.js';

const ROWS = 5;

type BookLevel = OrderBookSnapshot['bids'][number];

interface Props {
  snapshot: OrderBookSnapshot | null;
  onSelectLevel: (level: BookLevel, side: 'bid' | 'ask') => void;
}

export default function OrderBookPanel({ snapshot, onSelectLevel }: Props) {
  return (
    <Panel title="Canonical YES Order Book" bodyPad={false}>
      <div style={{ padding: S.sm }}>
        <OrderBookPanelBody snapshot={snapshot} onSelectLevel={onSelectLevel} />
      </div>
    </Panel>
  );
}

export function OrderBookPanelBody({ snapshot, onSelectLevel }: Props) {
  return (
    <>
      {!snapshot || (snapshot.bids.length === 0 && snapshot.asks.length === 0) ? (
        <Empty />
      ) : (
        <BookLadder snapshot={snapshot} onSelectLevel={onSelectLevel} />
      )}
    </>
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
      <SpreadRow bids={bids} asks={asks} />
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
    <div style={{ ...rowStyle, ...T.eyebrow, color: C.textMute, padding: `0 ${S.sm}px`, marginBottom: S.xs }}>
      <span>Price</span>
      <span>No</span>
      <span>Size</span>
      <span>Total</span>
    </div>
  );
}

function SpreadRow({ bids, asks }: { bids: BookLevel[]; asks: BookLevel[] }) {
  const spread = formatSpread(bids[0]?.yesPriceCents, asks[0]?.yesPriceCents);
  const mid = bids[0] && asks[0] ? Math.round((bids[0].yesPriceCents + asks[0].yesPriceCents) / 2) : null;
  return (
    <div style={midlineStyle}>
      <span style={{ color: C.textMute, fontWeight: 700 }}>Spread</span>
      <span style={{ color: C.textMute }}>
        {mid != null ? `mid ${formatPriceCents(mid as BookLevel['yesPriceCents'])}` : ''}
      </span>
      <span />
      <span style={{ color: C.text, fontWeight: 700 }}>{spread}</span>
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
  const isBid = side === 'bid';
  const barGradient = isBid
    ? `linear-gradient(to left, rgba(26,166,74,0.22), rgba(26,166,74,0.04))`
    : `linear-gradient(to left, rgba(244,63,94,0.22), rgba(244,63,94,0.04))`;
  const textColor = isBid ? C.yes : C.no;
  const title = side === 'ask' ? 'Click to buy YES at this ask' : 'Click to sell YES at this bid';

  return (
    <button
      type="button"
      title={title}
      onClick={onSelect}
      style={buttonRowStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: `${barWidth}%`,
          background: barGradient,
          pointerEvents: 'none',
        }}
      />
      <div style={{ ...rowStyle, position: 'relative', padding: `0 ${S.sm}px` }}>
        <span style={{ color: textColor, fontWeight: 600 }}>{formatPriceCents(yesPriceCents)}</span>
        <span style={{ color: C.textMute }}>{formatPriceCents(noPriceCents as typeof yesPriceCents)}</span>
        <span style={{ color: C.text }}>{size}</span>
        <span style={{ color: C.textMute }}>{total}</span>
      </div>
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
  return `${Math.max(0, ask - bid)}¢`;
}

function Empty() {
  return (
    <div style={{ color: C.textMute, fontSize: 12, padding: `${S.lg}px 0`, textAlign: 'center' }}>
      Waiting for liquidity
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: S.xs,
  alignItems: 'center',
  fontFamily: mono,
  fontVariantNumeric: 'tabular-nums',
  fontSize: 12.5,
  textAlign: 'right',
};

const buttonRowStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  border: 'none',
  background: 'transparent',
  fontFamily: 'inherit',
  height: 26,
  padding: 0,
  overflow: 'hidden',
  cursor: 'pointer',
  textAlign: 'left',
  display: 'flex',
  alignItems: 'center',
  transition: 'background 120ms ease',
};

const midlineStyle: CSSProperties = {
  ...rowStyle,
  background: C.panelSoft,
  borderTop: `1px solid ${C.border}`,
  borderBottom: `1px solid ${C.border}`,
  borderRadius: 0,
  padding: `4px ${S.sm}px`,
  margin: `${S.xs}px 0`,
  height: 26,
};
