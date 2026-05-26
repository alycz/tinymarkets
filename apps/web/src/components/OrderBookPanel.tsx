import type { CSSProperties } from 'react';
import type { OrderBookSnapshot } from '@jet/shared';
import { C, S, T, mono } from '../theme.js';
import { formatPriceCents } from '../format.js';
import Panel from './Panel.js';

const ROWS = 5;

type BookLevel = OrderBookSnapshot['bids'][number];
type DisplayBookLevel = { level: BookLevel; total: number };

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
  const bidRows = withCumulativeTotals(bids);
  const askRows = withCumulativeTotals(asks);
  const allTotals = [...bidRows, ...askRows].map((row) => row.total);
  const maxTotal = allTotals.length > 0 ? Math.max(...allTotals) : 1;

  return (
    <div>
      <Header />
      {[...askRows].reverse().map(({ level, total }) => (
        <BookRow
          key={`ask-${level.yesPriceCents}`}
          level={level}
          total={total}
          maxTotal={maxTotal}
          side="ask"
          onSelect={() => onSelectLevel(level, 'ask')}
        />
      ))}
      <SpreadRow bids={bids} asks={asks} />
      {bidRows.map(({ level, total }) => (
        <BookRow
          key={`bid-${level.yesPriceCents}`}
          level={level}
          total={total}
          maxTotal={maxTotal}
          side="bid"
          onSelect={() => onSelectLevel(level, 'bid')}
        />
      ))}
    </div>
  );
}

function Header() {
  return (
    <div style={{ ...rowStyle, ...T.eyebrow, color: C.textMute, marginBottom: S.xs }}>
      <span style={colAlign.price}>Price</span>
      <span style={colAlign.below}>Below</span>
      <span style={colAlign.size}>Size</span>
      <span style={colAlign.total}>Total</span>
    </div>
  );
}

function SpreadRow({ bids, asks }: { bids: BookLevel[]; asks: BookLevel[] }) {
  const spread = formatSpread(bids[0]?.yesPriceCents, asks[0]?.yesPriceCents);
  const mid = bids[0] && asks[0] ? Math.round((bids[0].yesPriceCents + asks[0].yesPriceCents) / 2) : null;
  return (
    <div style={midlineStyle}>
      <span>
        <span style={{ color: C.textMute, fontWeight: 700, marginRight: 6 }}>Mid</span>
        <span style={{ color: C.text }}>
          {mid != null ? formatPriceCents(mid as BookLevel['yesPriceCents']) : '--'}
        </span>
      </span>
      <span>
        <span style={{ color: C.textMute, fontWeight: 700, marginRight: 6 }}>Spread</span>
        <span style={{ color: C.text, fontWeight: 700 }}>{spread}</span>
      </span>
    </div>
  );
}

function BookRow({
  level,
  total,
  maxTotal,
  side,
  onSelect,
}: {
  level: BookLevel;
  total: number;
  maxTotal: number;
  side: 'bid' | 'ask';
  onSelect: () => void;
}) {
  const yesPriceCents = level.yesPriceCents;
  const noPriceCents = 100 - yesPriceCents;
  const size = level.size as number;
  const barWidth = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
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
          transition: 'width 180ms ease',
          zIndex: 0,
        }}
      />
      <span style={{ ...colAlign.price, ...cellStyle, color: textColor, fontWeight: 600 }}>{formatPriceCents(yesPriceCents)}</span>
      <span style={{ ...colAlign.below, ...cellStyle, color: C.textMute }}>{formatPriceCents(noPriceCents as typeof yesPriceCents)}</span>
      <span style={{ ...colAlign.size, ...cellStyle, color: C.text }}>{size}</span>
      <span style={{ ...colAlign.total, ...cellStyle, color: C.textMute }}>{total}</span>
    </button>
  );
}

function withCumulativeTotals(levels: BookLevel[]): DisplayBookLevel[] {
  let total = 0;
  return levels.map((level) => {
    total += level.size as number;
    return { level, total };
  });
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

const BOOK_GRID = '64px 1fr 1fr 64px';

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: BOOK_GRID,
  gap: S.xs,
  alignItems: 'center',
  fontFamily: mono,
  fontVariantNumeric: 'tabular-nums',
  fontSize: 12.5,
  padding: `0 ${S.sm}px`,
  height: 26,
};

const cellStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
};

const colAlign = {
  price: { textAlign: 'left' } as CSSProperties,
  below: { textAlign: 'center' } as CSSProperties,
  size: { textAlign: 'center' } as CSSProperties,
  total: { textAlign: 'right' } as CSSProperties,
};

const buttonRowStyle: CSSProperties = {
  ...rowStyle,
  position: 'relative',
  width: '100%',
  border: 'none',
  background: 'transparent',
  fontFamily: mono,
  overflow: 'hidden',
  cursor: 'pointer',
  transition: 'background 120ms ease',
};

const midlineStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-around',
  alignItems: 'center',
  fontFamily: mono,
  fontVariantNumeric: 'tabular-nums',
  fontSize: 12.5,
  padding: `0 ${S.sm}px`,
  height: 26,
  background: C.panelSoft,
  borderTop: `1px solid ${C.border}`,
  borderBottom: `1px solid ${C.border}`,
  borderRadius: 0,
  margin: `${S.xs}px 0`,
};
