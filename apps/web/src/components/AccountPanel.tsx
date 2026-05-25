import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Balance, CanonicalOrder, Position, PriceCents, Result, UsdCents } from '@jet/shared';
import { MARKET } from '@jet/config';
import { C, S } from '../theme.js';
import { formatUsdCents, formatPriceCents } from '../format.js';
import Panel from './Panel.js';

interface Props {
  balance: Balance | null;
  position: Position | null;
  contractMidCents: PriceCents | null;
  openOrders: CanonicalOrder[];
  userId: string;
  apiUrl: string;
  onRefreshUser: () => Promise<void>;
}

export default function AccountPanel({
  balance,
  position,
  contractMidCents,
  openOrders,
  userId,
  apiUrl,
  onRefreshUser,
}: Props) {
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
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
      <OpenOrders
        orders={openOrders}
        cancellingOrderId={cancellingOrderId}
        cancelError={cancelError}
        onCancel={(order) => void cancelOrder(order)}
      />
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
            return (
              <div key={order.orderId} style={orderRowStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: order.display.side === 'YES' ? C.yes : C.no, fontSize: 12, fontWeight: 800 }}>
                    {order.display.action} {order.display.side}
                  </div>
                  <div style={{ color: C.textMute, fontSize: 11 }}>
                    {formatPriceCents(order.display.oddsPriceCents)} · {order.remaining as number} remaining
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
