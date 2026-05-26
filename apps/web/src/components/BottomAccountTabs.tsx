import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { motion } from 'framer-motion';
import type {
  Balance,
  CanonicalOrder,
  Fill,
  Position,
  PriceCents,
  Result,
  Trade,
  UsdCents,
  UserResolutionEvent,
  VenueWeightedTwapResolution,
} from '@jet/shared';
import { C, S, T, mono } from '../theme.js';
import { formatAge, formatPriceCents, formatUsdCents } from '../format.js';

type Tab = 'positions' | 'orders' | 'history' | 'fills' | 'oracle';

interface Props {
  balance: Balance | null;
  position: Position | null;
  question: string;
  contractMidCents: PriceCents | null;
  openOrders: CanonicalOrder[];
  recentFills: Fill[];
  trades: Trade[];
  resolution: VenueWeightedTwapResolution | null;
  userResolution: UserResolutionEvent | null;
  userId: string;
  apiUrl: string;
  onRefreshUser: () => Promise<void>;
  oraclePanel: ReactNode;
}

const TABS: Array<{ tab: Tab; label: string }> = [
  { tab: 'positions', label: 'Positions' },
  { tab: 'orders', label: 'Open Orders' },
  { tab: 'history', label: 'Trade History' },
  { tab: 'fills', label: 'Fills' },
  { tab: 'oracle', label: 'Oracle' },
];

export default function BottomAccountTabs({
  balance,
  position,
  question,
  contractMidCents,
  openOrders,
  recentFills,
  trades,
  resolution,
  userResolution,
  userId,
  apiUrl,
  onRefreshUser,
  oraclePanel,
}: Props) {
  const [tab, setTab] = useState<Tab>('positions');
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

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
    <Tabs.Root value={tab} onValueChange={(value) => setTab(value as Tab)} style={rootStyle}>
      <Tabs.List style={tabsStyle}>
        {TABS.map((item) => {
          const active = tab === item.tab;
          return (
            <Tabs.Trigger
              key={item.tab}
              value={item.tab}
              style={{
                ...tabStyle,
                color: active ? C.text : C.textMute,
                borderBottomColor: active ? C.accent : 'transparent',
              }}
            >
              {item.label}
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>
      <Tabs.Content value="positions" asChild>
        <motion.div style={contentStyle} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
          <PositionsTab
            balance={balance}
            position={position}
            question={question}
            contractMidCents={contractMidCents}
            resolution={resolution}
            userResolution={userResolution}
          />
        </motion.div>
      </Tabs.Content>
      <Tabs.Content value="orders" asChild>
        <motion.div style={contentStyle} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
          <OpenOrdersTab
            orders={openOrders}
            cancellingOrderId={cancellingOrderId}
            cancelError={cancelError}
            onCancel={(order) => void cancelOrder(order)}
          />
        </motion.div>
      </Tabs.Content>
      <Tabs.Content value="history" asChild>
        <motion.div style={contentStyle} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
          <PublicTradesTab trades={trades} />
        </motion.div>
      </Tabs.Content>
      <Tabs.Content value="fills" asChild>
        <motion.div style={contentStyle} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
          <FillsTab fills={recentFills} />
        </motion.div>
      </Tabs.Content>
      <Tabs.Content value="oracle" asChild>
        <motion.div style={contentStyle} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
          <div style={oracleWrapStyle}>{oraclePanel}</div>
        </motion.div>
      </Tabs.Content>
    </Tabs.Root>
  );
}

function PositionsTab({
  balance,
  position,
  question,
  contractMidCents,
  resolution,
  userResolution,
}: {
  balance: Balance | null;
  position: Position | null;
  question: string;
  contractMidCents: PriceCents | null;
  resolution: VenueWeightedTwapResolution | null;
  userResolution: UserResolutionEvent | null;
}) {
  const liveNet = position?.net ?? 0;
  const net = resolution && userResolution ? userResolution.netAtResolution : liveNet;
  const avgEntry = position?.avgEntryPriceCents ?? null;
  const absNet = Math.abs(net);
  const sideColor = net > 0 ? C.yes : net < 0 ? C.no : C.textMute;
  const markValueCents =
    contractMidCents !== null && liveNet !== 0
      ? liveNet > 0
        ? (liveNet * contractMidCents as UsdCents)
        : (Math.abs(liveNet) * (100 - contractMidCents) as UsdCents)
      : null;
  const yesPayoutCents = (net > 0 ? absNet * 100 : 0) as UsdCents;
  const noPayoutCents = (net < 0 ? absNet * 100 : 0) as UsdCents;
  const unrealizedPnl =
    !resolution && liveNet !== 0 && avgEntry !== null && contractMidCents !== null
      ? liveNet * (contractMidCents - avgEntry)
      : null;
  const userWon =
    resolution && userResolution && userResolution.netAtResolution !== 0
      ? (resolution.outcome === 'YES' && userResolution.netAtResolution > 0) ||
        (resolution.outcome === 'NO' && userResolution.netAtResolution < 0)
      : null;

  return (
    <>
      {resolution && userResolution && (
        <div style={accountStripStyle}>
          <Metric
            label="Result"
            value={userWon === null ? 'N/A' : `${userWon ? 'Won' : 'Lost'} ${resolution.outcome}`}
            color={userWon === null ? C.textMute : userWon ? C.yes : C.no}
            strong
          />
          <Metric label="Payout" value={formatUsdCents(userResolution.payoutCents)} strong />
          <Metric
            label="Final PnL"
            value={`${userResolution.pnlCents >= 0 ? '+' : ''}${formatUsdCents(userResolution.pnlCents as UsdCents)}`}
            color={userResolution.pnlCents >= 0 ? C.yes : C.no}
            strong
          />
        </div>
      )}
      <div style={positionsHeaderStyle}>
        <span>Market</span>
        <span>Position</span>
        <span>Avg Entry</span>
        <span>Mark</span>
        <span>PnL</span>
        <span>Payout YES</span>
        <span>Payout NO</span>
      </div>
      <div style={positionsRowStyle}>
        <span style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>{question}</span>
        <span style={{ color: sideColor, fontWeight: 700 }}>{formatPosition(net)}</span>
        <span>{avgEntry !== null && liveNet !== 0 && !resolution ? formatPriceCents(avgEntry) : '--'}</span>
        <span>{markValueCents !== null && !resolution ? formatUsdCents(markValueCents) : '--'}</span>
        <span style={{ color: unrealizedPnl === null ? C.textMute : unrealizedPnl >= 0 ? C.yes : C.no }}>
          {unrealizedPnl !== null ? `${unrealizedPnl >= 0 ? '+' : ''}${formatUsdCents(unrealizedPnl as UsdCents)}` : '--'}
        </span>
        <span>{formatUsdCents(yesPayoutCents)}</span>
        <span>{formatUsdCents(noPayoutCents)}</span>
      </div>
    </>
  );
}

function OpenOrdersTab({
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
  if (orders.length === 0) return <Empty label="No resting orders" />;
  return (
    <>
      <div style={orderHeaderStyle}>
        <span>Side</span>
        <span>Price</span>
        <span>Filled</span>
        <span>Remaining</span>
        <span>Status</span>
        <span />
      </div>
      {orders.map((order) => {
        const cancelling = cancellingOrderId === order.orderId;
        const filled = (order.size as number) - (order.remaining as number);
        return (
          <div key={order.orderId} style={orderRowStyle}>
            <span style={{ color: order.display.side === 'YES' ? C.yes : C.no, fontWeight: 600 }}>
              {order.display.action} {order.display.side}
            </span>
            <span>{formatPriceCents(order.display.oddsPriceCents)}</span>
            <span>{filled}</span>
            <span>{order.remaining as number}</span>
            <span style={{ color: C.textDim }}>{order.status}</span>
            <button
              type="button"
              disabled={cancelling}
              onClick={() => onCancel(order)}
              style={{ ...cancelButtonStyle, opacity: cancelling ? 0.5 : 1 }}
            >
              {cancelling ? 'Canceling' : 'Cancel'}
            </button>
          </div>
        );
      })}
      {cancelError && <div style={errorStyle}>{cancelError}</div>}
    </>
  );
}

function PublicTradesTab({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return <Empty label="No public trades yet" />;
  return (
    <>
      <div style={tradeHeaderStyle}>
        <span>Age</span>
        <span>Aggressor</span>
        <span>Price</span>
        <span>Size</span>
      </div>
      {trades.slice(0, 18).map((trade) => {
        const displayPrice =
          trade.takerSide === 'YES'
            ? trade.yesPriceCents
            : ((100 - trade.yesPriceCents) as typeof trade.yesPriceCents);
        return (
          <div key={trade.tradeId} style={tradeRowStyle}>
            <span style={{ color: C.textMute }}>{formatAge(Date.now() - trade.ts)}</span>
            <span style={{ color: trade.takerSide === 'YES' ? C.yes : C.no, fontWeight: 600 }}>
              Bought {trade.takerSide === 'YES' ? 'Above' : 'Below'}
            </span>
            <span>{formatPriceCents(displayPrice)}</span>
            <span>{trade.size as number}</span>
          </div>
        );
      })}
    </>
  );
}

function FillsTab({ fills }: { fills: Fill[] }) {
  if (fills.length === 0) return <Empty label="No fills yet" />;
  return (
    <>
      <div style={fillHeaderStyle}>
        <span>Age</span>
        <span>Action</span>
        <span>Price</span>
        <span>Size</span>
        <span>Position After</span>
      </div>
      {fills.slice(0, 18).map((fill) => {
        const label = userActionLabel(fill.yesAction, fill.positionAfter);
        const color = label.endsWith('Above') ? C.yes : C.no;
        return (
          <div key={`${fill.tradeId}:${fill.orderId}:${fill.userId}`} style={fillRowStyle}>
            <span style={{ color: C.textMute }}>{formatAge(Date.now() - fill.ts)}</span>
            <span style={{ color, fontWeight: 600 }}>{label}</span>
            <span>{formatPriceCents(fill.yesPriceCents)}</span>
            <span>{fill.size as number}</span>
            <span style={{ color: fill.positionAfter > 0 ? C.yes : fill.positionAfter < 0 ? C.no : C.textDim }}>
              {formatPosition(fill.positionAfter)}
            </span>
          </div>
        );
      })}
    </>
  );
}

function userActionLabel(yesAction: 'BUY' | 'SELL', positionAfter: number): string {
  if (yesAction === 'BUY') {
    return positionAfter > 0 ? 'Bought Above' : 'Sold Below';
  }
  return positionAfter < 0 ? 'Bought Below' : 'Sold Above';
}

function Metric({
  label,
  value,
  color,
  dim,
  strong,
}: {
  label: string;
  value: ReactNode;
  color?: string;
  dim?: boolean;
  strong?: boolean;
}) {
  return (
    <div style={metricStyle}>
      <div style={T.eyebrow}>{label}</div>
      <div
        style={{
          color: color ?? (dim ? C.textDim : C.text),
          fontWeight: strong ? 700 : 600,
          fontSize: 13,
          fontFamily: mono,
          fontVariantNumeric: 'tabular-nums',
          marginTop: 3,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div style={emptyStyle}>{label}</div>;
}

function formatPosition(net: number): string {
  if (net > 0) return `Long Above ${net}`;
  if (net < 0) return `Long Below ${Math.abs(net)}`;
  return 'No position';
}

const rootStyle: CSSProperties = {
  background: C.panel,
  borderTop: `1px solid ${C.border}`,
  borderBottom: `1px solid ${C.border}`,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
};

const tabsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: S.lg,
  padding: `0 ${S.md}px`,
  background: C.panelSoft,
  borderBottom: `1px solid ${C.border}`,
  flexWrap: 'wrap',
};

const tabStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: `${S.sm}px 2px`,
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.02em',
  cursor: 'pointer',
  borderBottom: '2px solid transparent',
  marginBottom: -1,
  transition: 'color 120ms ease, border-color 120ms ease',
};

const contentStyle: CSSProperties = {
  padding: S.md,
  flex: 1,
  minHeight: 0,
  overflowX: 'auto',
  overflowY: 'auto',
  outline: 'none',
};

const accountStripStyle: CSSProperties = {
  display: 'flex',
  gap: S.sm,
  flexWrap: 'wrap',
  marginBottom: S.md,
};

const metricStyle: CSSProperties = {
  background: C.panelSoft,
  border: `1px solid ${C.border}`,
  borderRadius: 0,
  padding: `${S.sm}px ${S.md}px`,
  minWidth: 132,
};

const positionsHeaderStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 1.8fr) 1fr 0.8fr 0.9fr 0.8fr 0.9fr 0.9fr',
  gap: S.md,
  ...T.eyebrow,
  color: C.textMute,
  minWidth: 860,
  paddingBottom: S.sm,
  borderBottom: `1px solid ${C.border}`,
};

const positionsRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 1.8fr) 1fr 0.8fr 0.9fr 0.8fr 0.9fr 0.9fr',
  gap: S.md,
  alignItems: 'center',
  padding: `${S.sm}px 0`,
  color: C.text,
  fontSize: 12,
  fontFamily: mono,
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 500,
  minWidth: 860,
};

const orderHeaderStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.4fr 0.8fr 0.7fr 0.8fr 0.9fr 86px',
  gap: S.md,
  ...T.eyebrow,
  color: C.textMute,
  marginBottom: S.xs,
  paddingBottom: S.xs,
  borderBottom: `1px solid ${C.border}`,
  minWidth: 720,
};

const orderRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.4fr 0.8fr 0.7fr 0.8fr 0.9fr 86px',
  gap: S.md,
  alignItems: 'center',
  padding: `6px 0`,
  color: C.text,
  fontSize: 12,
  fontFamily: mono,
  fontVariantNumeric: 'tabular-nums',
  minWidth: 720,
  borderBottom: `1px solid ${C.borderHair}`,
};

const tradeHeaderStyle: CSSProperties = {
  ...orderHeaderStyle,
  gridTemplateColumns: '0.8fr 1.3fr 1fr 0.8fr',
};

const tradeRowStyle: CSSProperties = {
  ...orderRowStyle,
  gridTemplateColumns: '0.8fr 1.3fr 1fr 0.8fr',
};

const fillHeaderStyle: CSSProperties = {
  ...orderHeaderStyle,
  gridTemplateColumns: '0.8fr 1.2fr 0.8fr 0.7fr 1.3fr',
};

const fillRowStyle: CSSProperties = {
  ...orderRowStyle,
  gridTemplateColumns: '0.8fr 1.2fr 0.8fr 0.7fr 1.3fr',
};

const cancelButtonStyle: CSSProperties = {
  background: 'transparent',
  color: C.no,
  border: `1px solid ${C.no}55`,
  borderRadius: 0,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.02em',
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: 'background 120ms ease',
};

const emptyStyle: CSSProperties = {
  color: C.textMute,
  fontSize: 12,
  padding: `${S.xl}px 0`,
  textAlign: 'center',
};

const errorStyle: CSSProperties = {
  color: C.bad,
  fontSize: 11,
  marginTop: S.sm,
};

const oracleWrapStyle: CSSProperties = {
  margin: -S.md,
};
