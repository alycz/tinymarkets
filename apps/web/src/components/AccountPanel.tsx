import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type {
  Balance,
  CanonicalOrder,
  Fill,
  Position,
  PriceCents,
  Result,
  UsdCents,
  UserResolutionEvent,
  VenueWeightedTwapResolution,
} from '@jet/shared';
import { MARKET } from '@jet/config';
import { C, S } from '../theme.js';
import { formatAge, formatUsdCents, formatPriceCents } from '../format.js';
import Panel from './Panel.js';

interface Props {
  balance: Balance | null;
  position: Position | null;
  contractMidCents: PriceCents | null;
  openOrders: CanonicalOrder[];
  recentFills: Fill[];
  resolution: VenueWeightedTwapResolution | null;
  userResolution: UserResolutionEvent | null;
  userId: string;
  apiUrl: string;
  onRefreshUser: () => Promise<void>;
}

export default function AccountPanel({
  balance,
  position,
  contractMidCents,
  openOrders,
  recentFills,
  resolution,
  userResolution,
  userId,
  apiUrl,
  onRefreshUser,
}: Props) {
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const available = balance?.availableBalanceCents ?? (MARKET.startingBalanceCents as UsdCents);
  const reserved = balance?.reservedForOrdersCents ?? (0 as UsdCents);
  const locked = balance?.lockedSettlementCollateralCents ?? (0 as UsdCents);

  const liveNet = position?.net ?? 0;
  const net = resolution && userResolution ? userResolution.netAtResolution : liveNet;
  const avgEntry = position?.avgEntryPriceCents ?? null;

  let unrealizedPnl: number | null = null;
  if (!resolution && liveNet !== 0 && avgEntry !== null && contractMidCents !== null) {
    unrealizedPnl = liveNet * (contractMidCents - avgEntry);
  }

  const sideColor = net > 0 ? C.yes : net < 0 ? C.no : C.textMute;
  const absNet = Math.abs(net);
  const markValueCents =
    contractMidCents !== null && liveNet !== 0
      ? liveNet > 0
        ? (liveNet * contractMidCents as UsdCents)
        : (Math.abs(liveNet) * (100 - contractMidCents) as UsdCents)
      : null;
  const yesPayoutCents = (net > 0 ? absNet * 100 : 0) as UsdCents;
  const noPayoutCents = (net < 0 ? absNet * 100 : 0) as UsdCents;
  const userWon =
    resolution && userResolution && userResolution.netAtResolution !== 0
      ? (resolution.outcome === 'YES' && userResolution.netAtResolution > 0) ||
        (resolution.outcome === 'NO' && userResolution.netAtResolution < 0)
      : null;

  async function cancelOrder(order: CanonicalOrder) {
    setCancellingOrderId(order.orderId);
    setCancelError(null);
    try {
      const res = await fetch(`${apiUrl}/orders/${order.orderId}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = (await res.json().catch(() => null)) as Result<{ orderId: string }> | null;
      if (!res.ok || !data?.ok) {
        setCancelError(data && !data.ok ? data.error.message : `Cancel failed (${res.status})`);
        return;
      }
      await onRefreshUser();
    } catch {
      setCancelError('Network error while cancelling order');
    } finally {
      setCancellingOrderId(null);
    }
  }

  return (
    <Panel title="Account">
      <Row label="Available" value={formatUsdCents(available)} />
      <Row label="Reserved orders" value={formatUsdCents(reserved)} dim />
      <Row label="OI collateral share" value={formatUsdCents(locked)} dim />
      <div style={noteStyle}>
        Demo display; system invariant is preserved. Production would track exact price-basis collateral per user.
      </div>
      <div style={{ height: 1, background: C.border, margin: `${S.sm}px 0` }} />
      <Row label="Position" value={<span style={{ color: sideColor, fontWeight: 700 }}>{formatPosition(net)}</span>} />
      {liveNet !== 0 && avgEntry !== null && !resolution && (
        <Row label="Avg entry" value={formatPriceCents(avgEntry)} dim />
      )}
      <Row
        label="Mark value"
        value={markValueCents !== null && !resolution ? formatUsdCents(markValueCents) : <span style={{ color: C.textMute }}>--</span>}
        dim={markValueCents === null || !!resolution}
      />
      <Row label="Payout if YES wins" value={formatUsdCents(yesPayoutCents)} dim={yesPayoutCents === 0} />
      <Row label="Payout if NO wins" value={formatUsdCents(noPayoutCents)} dim={noPayoutCents === 0} />
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
      {resolution && userResolution && (
        <>
          <Row
            label="Result"
            value={
              userWon === null ? (
                <span style={{ color: C.textMute }}>No settled position</span>
              ) : (
                <span style={{ color: userWon ? C.yes : C.no, fontWeight: 800 }}>
                  {userWon ? 'Won' : 'Lost'} on {resolution.outcome}
                </span>
              )
            }
          />
          <Row label="Final payout" value={formatUsdCents(userResolution.payoutCents)} />
          <Row
            label="Final PnL"
            value={
              <span style={{ color: userResolution.pnlCents >= 0 ? C.yes : C.no, fontWeight: 800 }}>
                {userResolution.pnlCents >= 0 ? '+' : ''}
                {formatUsdCents(userResolution.pnlCents as UsdCents)}
              </span>
            }
          />
        </>
      )}
      <OpenOrders
        orders={openOrders}
        cancellingOrderId={cancellingOrderId}
        cancelError={cancelError}
        onCancel={(order) => void cancelOrder(order)}
      />
      <RecentFills fills={recentFills} />
    </Panel>
  );
}

function OpenOrders({
  orders,
  cancellingOrderId,
  cancelError,
  onCancel,
}: {
  orders: CanonicalOrder[];
  cancellingOrderId: string | null;
  cancelError: string | null;
  onCancel: (order: CanonicalOrder) => void;
}) {
  return (
    <div style={openOrdersStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.xs }}>
        <span style={{ color: C.textDim, fontSize: 12, fontWeight: 700 }}>Open orders</span>
        <span style={{ color: C.textMute, fontSize: 11 }}>{orders.length}</span>
      </div>
      {orders.length === 0 ? (
        <div style={{ color: C.textMute, fontSize: 12 }}>No resting orders</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.xs }}>
          {orders.map((order) => {
            const cancelling = cancellingOrderId === order.orderId;
            const filled = (order.size as number) - (order.remaining as number);
            return (
              <div key={order.orderId} style={orderRowStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: order.display.side === 'YES' ? C.yes : C.no, fontSize: 12, fontWeight: 800 }}>
                    {order.display.action} {order.display.side}
                  </div>
                  <div style={{ color: C.textMute, fontSize: 11 }}>
                    {formatPriceCents(order.display.oddsPriceCents)} · {filled}/{order.size as number} filled · {order.remaining as number} remaining · {order.status}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={() => onCancel(order)}
                  style={{
                    ...cancelButtonStyle,
                    opacity: cancelling ? 0.55 : 1,
                    cursor: cancelling ? 'default' : 'pointer',
                  }}
                >
                  {cancelling ? 'Canceling' : 'Cancel'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {cancelError && <div style={{ color: C.bad, fontSize: 11, marginTop: S.xs }}>{cancelError}</div>}
    </div>
  );
}

function RecentFills({ fills }: { fills: Fill[] }) {
  return (
    <div style={openOrdersStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.xs }}>
        <span style={{ color: C.textDim, fontSize: 12, fontWeight: 700 }}>Your fills</span>
        <span style={{ color: C.textMute, fontSize: 11 }}>{fills.length}</span>
      </div>
      {fills.length === 0 ? (
        <div style={{ color: C.textMute, fontSize: 12 }}>No fills yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.xs }}>
          {fills.slice(0, 6).map((fill) => (
            <div key={`${fill.tradeId}:${fill.orderId}:${fill.userId}`} style={fillRowStyle}>
              <span style={{ color: C.textMute }}>{formatAge(Date.now() - fill.ts)}</span>
              <span style={{ color: fill.yesAction === 'BUY' ? C.yes : C.no, fontWeight: 800 }}>
                {fill.yesAction === 'BUY' ? 'Bought YES' : 'Sold YES'}
              </span>
              <span style={{ color: C.text }}>{fill.size as number} @ {formatPriceCents(fill.yesPriceCents)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  dim,
}: {
  label: string;
  value: ReactNode;
  dim?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.xs, fontSize: 13 }}>
      <span style={{ color: C.textDim }}>{label}</span>
      <span style={{ color: dim ? C.textDim : C.text }}>{value}</span>
    </div>
  );
}

function formatPosition(net: number): string {
  if (net > 0) return `Long YES: ${net} shares`;
  if (net < 0) return `Long NO: ${Math.abs(net)} shares`;
  return 'No position';
}

const noteStyle: CSSProperties = {
  color: C.textMute,
  fontSize: 10,
  lineHeight: 1.35,
  marginTop: -2,
  marginBottom: S.sm,
};

const openOrdersStyle: CSSProperties = {
  borderTop: `1px solid ${C.border}`,
  marginTop: S.sm,
  paddingTop: S.sm,
};

const orderRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: S.sm,
  alignItems: 'center',
  background: C.panelAlt,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: S.sm,
};

const fillRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.2fr 1.4fr 1fr',
  gap: S.xs,
  alignItems: 'center',
  background: C.panelAlt,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: S.sm,
  fontSize: 11,
};

const cancelButtonStyle: CSSProperties = {
  background: 'transparent',
  color: C.warn,
  border: `1px solid ${C.warn}66`,
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 11,
  fontWeight: 700,
  fontFamily: 'inherit',
};
