import type { CSSProperties } from 'react';
import type { Trade } from '@jet/shared';
import { C, S, T, mono } from '../theme.js';
import { formatPriceCents, formatAge } from '../format.js';
import Panel from './Panel.js';

interface Props {
  trades: Trade[];
}

export default function TradesFeed({ trades }: Props) {
  return (
    <Panel title="Recent Trades">
      <TradesFeedBody trades={trades} />
    </Panel>
  );
}

export function TradesFeedBody({ trades }: Props) {
  const visible = trades.flatMap(activityRows).slice(0, 20);
  return (
    <>
      {visible.length === 0 ? (
        <div style={{ color: C.textMute, fontSize: 12, padding: `${S.lg}px 0`, textAlign: 'center' }}>
          No trades yet
        </div>
      ) : (
        <div>
          <Header />
          {visible.map((activity) => (
            <TradeRow key={`${activity.trade.tradeId}-${activity.role}`} activity={activity} />
          ))}
        </div>
      )}
    </>
  );
}

function Header() {
  return (
    <div style={{ ...tradeGridStyle, ...T.eyebrow, color: C.textMute, padding: `0 ${S.sm}px`, marginBottom: S.xs }}>
      <span />
      <span style={colAlign.time}>Time</span>
      <span style={colAlign.side}>Side</span>
      <span style={colAlign.price}>Price</span>
      <span style={colAlign.size}>Size</span>
    </div>
  );
}

interface ActivityRow {
  role: 'taker' | 'maker';
  trade: Trade;
  userId: string;
  side: 'YES' | 'NO';
  action: 'bought' | 'sold';
  priceCents: number;
}

function TradeRow({ activity }: { activity: ActivityRow }) {
  const { trade } = activity;
  const age = formatAge(Date.now() - trade.ts);
  const sideColor = trade.takerSide === 'YES' ? C.yes : C.no;
  const displayPrice =
    trade.takerSide === 'YES'
      ? trade.yesPriceCents
      : ((100 - trade.yesPriceCents) as typeof trade.yesPriceCents);

  return (
    <div style={{ ...tradeGridStyle, ...tradeRowStyle }}>
      <span
        style={{
          width: 2,
          height: 16,
          background: sideColor,
          borderRadius: 0,
        }}
      />
      <span style={{ ...colAlign.time, color: C.textMute }}>{age}</span>
      <span style={{ ...colAlign.side, color: sideColor, fontWeight: 600 }}>{trade.takerSide === 'YES' ? 'Above' : 'Below'}</span>
      <span style={{ ...colAlign.price, color: C.text }}>{formatPriceCents(displayPrice)}</span>
      <span style={{ ...colAlign.size, color: C.text }}>{trade.size as number}</span>
    </div>
  );
}

function activityRows(trade: Trade): ActivityRow[] {
  const takerYesAction = trade.takerYesAction ?? (trade.takerSide === 'YES' ? 'BUY' : 'SELL');
  const makerYesAction = trade.makerYesAction ?? (takerYesAction === 'BUY' ? 'SELL' : 'BUY');
  return [
    {
      role: 'taker',
      trade,
      userId: trade.takerUserId ?? 'taker',
      side: trade.takerSide,
      action: displayAction(trade.takerSide, takerYesAction),
      priceCents: displayPrice(trade.takerSide, trade.yesPriceCents as number),
    },
    {
      role: 'maker',
      trade,
      userId: trade.makerUserId ?? 'maker',
      side: 'YES',
      action: makerYesAction === 'BUY' ? 'bought' : 'sold',
      priceCents: trade.yesPriceCents as number,
    },
  ];
}

function displayAction(side: 'YES' | 'NO', yesAction: 'BUY' | 'SELL'): 'bought' | 'sold' {
  if (side === 'YES') return yesAction === 'BUY' ? 'bought' : 'sold';
  return yesAction === 'SELL' ? 'bought' : 'sold';
}

function displayPrice(side: 'YES' | 'NO', yesPriceCents: number): number {
  return side === 'YES' ? yesPriceCents : 100 - yesPriceCents;
}

const tradeGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '4px 72px 1fr 1fr 48px',
  gap: S.xs,
  fontFamily: mono,
  fontVariantNumeric: 'tabular-nums',
  fontSize: 11.5,
  alignItems: 'center',
};

const colAlign = {
  time: { textAlign: 'left' } as CSSProperties,
  side: { textAlign: 'center' } as CSSProperties,
  price: { textAlign: 'center' } as CSSProperties,
  size: { textAlign: 'right' } as CSSProperties,
};

const tradeRowStyle: CSSProperties = {
  height: 22,
  padding: `0 ${S.sm}px`,
};
