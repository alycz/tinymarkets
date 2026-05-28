import type { CSSProperties } from 'react';
import type { OrderBookSnapshot } from '@jet/shared';
import { C, S, T, mono } from '../theme.js';
import { formatPriceCents } from '../format.js';
import Panel from './Panel.js';

const ROWS = 5;

type BookLevel = OrderBookSnapshot['bids'][number];
type DisplayBookLevel = { level: BookLevel | null; total: number | null };

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
  return <BookLadder snapshot={snapshot} onSelectLevel={onSelectLevel} />;
}

function BookLadder({
  snapshot,
  onSelectLevel,
}: {
  snapshot: OrderBookSnapshot | null;
  onSelectLevel: (level: BookLevel, side: 'bid' | 'ask') => void;
}) {
  const bids = [...(snapshot?.bids ?? [])]
    .sort((a, b) => b.yesPriceCents - a.yesPriceCents)
    .slice(0, ROWS);
  const asks = [...(snapshot?.asks ?? [])]
    .sort((a, b) => a.yesPriceCents - b.yesPriceCents)
    .slice(0, ROWS);
  const bidRows = buildSideRows(bids);
  const askRows = buildSideRows(asks);
  const realTotals = [...bidRows, ...askRows]
    .map((row) => row.total)
    .filter((total): total is number => total != null);
  const maxTotal = Math.max(1, ...realTotals);

  return (
    <div>
      <Header />
      {[...askRows].reverse().map((row, i) => {
        const level = row.level;
        return (
          <BookRow
            key={`ask-slot-${i}`}
            row={row}
            maxTotal={maxTotal}
            side="ask"
            onSelect={level ? () => onSelectLevel(level, 'ask') : undefined}
          />
        );
      })}
      <SpreadRow bids={bids} asks={asks} />
      {bidRows.map((row, i) => {
        const level = row.level;
        return (
          <BookRow
            key={`bid-slot-${i}`}
            row={row}
            maxTotal={maxTotal}
            side="bid"
            onSelect={level ? () => onSelectLevel(level, 'bid') : undefined}
          />
        );
      })}
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
  row,
  maxTotal,
  side,
  onSelect,
}: {
  row: DisplayBookLevel;
  maxTotal: number;
  side: 'bid' | 'ask';
  onSelect?: () => void;
}) {
  const { level, total } = row;
  const yesPriceCents = level?.yesPriceCents ?? null;
  const noPriceCents = yesPriceCents == null ? null : 100 - yesPriceCents;
  const size = level == null ? null : (level.size as number);
  const barWidth = level != null && total != null && maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  const isBid = side === 'bid';
  const barGradient = isBid
    ? `linear-gradient(to left, rgba(26,166,74,0.22), rgba(26,166,74,0.04))`
    : `linear-gradient(to left, rgba(244,63,94,0.22), rgba(244,63,94,0.04))`;
  const textColor = level == null ? C.textMute : isBid ? C.yes : C.no;
  const title = side === 'ask' ? 'Click to buy YES at this ask' : 'Click to sell YES at this bid';

  return (
    <button
      type="button"
      title={level == null ? undefined : title}
      disabled={level == null}
      onClick={onSelect}
      style={{
        ...buttonRowStyle,
        cursor: level == null ? 'default' : 'pointer',
        color: C.text,
        opacity: 1,
      }}
      onMouseEnter={(e) => {
        if (level == null) return;
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
      <span style={{ ...colAlign.price, ...cellStyle, color: textColor, fontWeight: 600 }}>
        {yesPriceCents == null ? '--' : formatPriceCents(yesPriceCents)}
      </span>
      <span style={{ ...colAlign.below, ...cellStyle, color: C.textMute }}>
        {noPriceCents == null ? '--' : formatPriceCents(noPriceCents as BookLevel['yesPriceCents'])}
      </span>
      <span style={{ ...colAlign.size, ...cellStyle, color: level == null ? C.textMute : C.text }}>
        {size == null ? '--' : size}
      </span>
      <span style={{ ...colAlign.total, ...cellStyle, color: C.textMute }}>
        {total == null ? '--' : total}
      </span>
    </button>
  );
}

function buildSideRows(levels: BookLevel[]): DisplayBookLevel[] {
  let total = 0;
  const rows: DisplayBookLevel[] = levels.map((level) => {
    total += level.size as number;
    return { level, total };
  });

  while (rows.length < ROWS) {
    rows.push({ level: null, total: null });
  }

  return rows;
}

function formatSpread(bid?: BookLevel['yesPriceCents'], ask?: BookLevel['yesPriceCents']): string {
  if (bid == null || ask == null) return '--';
  return `${Math.max(0, ask - bid)}¢`;
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
