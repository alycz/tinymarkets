import type { Trade } from '@jet/shared';
import { C, S } from '../theme.js';
import { formatPriceCents, formatAge } from '../format.js';
import Panel from './Panel.js';

interface Props {
  trades: Trade[];
}

const KIND_LABEL: Record<Trade['kind'], string> = {
  OPEN: 'OPEN',
  TRANSFER_YES: 'XFER Y',
  TRANSFER_NO: 'XFER N',
  CLOSE: 'CLOSE',
};

export default function TradesFeed({ trades }: Props) {
  const visible = trades.flatMap(activityRows).slice(0, 20);
  return (
    <Panel title="Recent Trades">
      {visible.length === 0 ? (
        <div style={{ color: C.textMute, fontSize: 13, padding: `${S.lg}px 0`, textAlign: 'center' }}>
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
    </Panel>
  );
}

function Header() {
  return (
    <div style={{ ...row, color: C.textMute, fontSize: 10, letterSpacing: '0.08em', marginBottom: S.xs }}>
      <span>AGE</span>
      <span>TRADER</span>
      <span>ACTION</span>
      <span>PRICE</span>
      <span style={{ textAlign: 'right' }}>SIZE</span>
      <span>KIND</span>
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
  const sideColor = activity.side === 'YES' ? C.yes : C.no;

  return (
    <div style={{ ...row, fontSize: 12, marginBottom: 3 }}>
      <span style={{ color: C.textMute }}>{age}</span>
      <span style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {activity.userId}
      </span>
      <span style={{ color: sideColor, fontWeight: 600 }}>{activity.action} {activity.side}</span>
      <span style={{ color: C.text }}>
        {formatPriceCents(activity.priceCents as Trade['yesPriceCents'])}
      </span>
      <span style={{ color: C.text, textAlign: 'right' }}>{trade.size as number}</span>
      <span style={{ color: C.textMute }}>{KIND_LABEL[trade.kind]}</span>
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

const row = {
  display: 'grid',
  gridTemplateColumns: '2fr 4fr 3fr 2fr 2fr 2fr',
  gap: S.xs,
} as const;
