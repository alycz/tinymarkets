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
  const visible = trades.slice(0, 20);
  return (
    <Panel title="Recent Trades">
      {visible.length === 0 ? (
        <div style={{ color: C.textMute, fontSize: 13, padding: `${S.lg}px 0`, textAlign: 'center' }}>
          No trades yet
        </div>
      ) : (
        <div>
          <Header />
          {visible.map((t) => (
            <TradeRow key={t.tradeId} trade={t} />
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
      <span>ACTION</span>
      <span>PRICE</span>
      <span style={{ textAlign: 'right' }}>SIZE</span>
      <span>KIND</span>
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const age = formatAge(Date.now() - trade.ts);
  const sideColor = trade.takerSide === 'YES' ? C.yes : C.no;
  const displayPrice =
    trade.takerSide === 'YES'
      ? trade.yesPriceCents
      : ((100 - trade.yesPriceCents) as typeof trade.yesPriceCents);

  return (
    <div style={{ ...row, fontSize: 12, marginBottom: 3 }}>
      <span style={{ color: C.textMute }}>{age}</span>
      <span style={{ color: sideColor, fontWeight: 600 }}>Bought {trade.takerSide}</span>
      <span style={{ color: C.text }}>
        {formatPriceCents(displayPrice)}
      </span>
      <span style={{ color: C.text, textAlign: 'right' }}>{trade.size as number}</span>
      <span style={{ color: C.textMute }}>{KIND_LABEL[trade.kind]}</span>
    </div>
  );
}

const row = {
  display: 'grid',
  gridTemplateColumns: '3fr 2fr 2fr 2fr 3fr',
  gap: S.xs,
} as const;
