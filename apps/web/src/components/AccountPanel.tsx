import type { Balance, Position, PriceCents, UsdCents } from '@jet/shared';
import { MARKET } from '@jet/config';
import { C, S } from '../theme.js';
import { formatUsdCents, formatPriceCents } from '../format.js';
import Panel from './Panel.js';

interface Props {
  balance: Balance | null;
  position: Position | null;
  contractMidCents: PriceCents | null;
}

export default function AccountPanel({ balance, position, contractMidCents }: Props) {
  const available = balance?.availableBalanceCents ?? (MARKET.startingBalanceCents as UsdCents);
  const reserved = balance?.reservedForOrdersCents ?? (0 as UsdCents);
  const locked = balance?.lockedSettlementCollateralCents ?? (0 as UsdCents);

  const net = position?.net ?? 0;
  const avgEntry = position?.avgEntryPriceCents ?? null;

  let unrealizedPnl: number | null = null;
  if (net !== 0 && avgEntry !== null && contractMidCents !== null) {
    unrealizedPnl = net * (contractMidCents - avgEntry);
  }

  const sideLabel = net > 0 ? 'LONG YES' : net < 0 ? 'LONG NO' : 'FLAT';
  const sideColor = net > 0 ? C.yes : net < 0 ? C.no : C.textMute;

  return (
    <Panel title="Account">
      <Row label="Available" value={formatUsdCents(available)} />
      <Row label="Reserved orders" value={formatUsdCents(reserved)} dim />
      <Row label="Settlement collateral" value={formatUsdCents(locked)} dim />
      <div style={{ height: 1, background: C.border, margin: `${S.sm}px 0` }} />
      <Row
        label="Position"
        value={
          net !== 0 ? (
            <span>
              <span style={{ color: sideColor, fontWeight: 600 }}>{sideLabel}</span>
              {' '}
              <span style={{ color: C.text }}>{Math.abs(net)} shares</span>
            </span>
          ) : (
            <span style={{ color: C.textMute }}>FLAT</span>
          )
        }
      />
      {net !== 0 && avgEntry !== null && (
        <Row label="Avg entry" value={formatPriceCents(avgEntry)} dim />
      )}
      <Row
        label="Unrealized PnL"
        value={
          unrealizedPnl !== null ? (
            <span style={{ color: unrealizedPnl >= 0 ? C.yes : C.no }}>
              {unrealizedPnl >= 0 ? '+' : ''}
              {formatUsdCents(unrealizedPnl as UsdCents)}
            </span>
          ) : (
            <span style={{ color: C.textMute }}>—</span>
          )
        }
      />
    </Panel>
  );
}

function Row({
  label,
  value,
  dim,
}: {
  label: string;
  value: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.xs, fontSize: 13 }}>
      <span style={{ color: C.textDim }}>{label}</span>
      <span style={{ color: dim ? C.textDim : C.text }}>{value}</span>
    </div>
  );
}
