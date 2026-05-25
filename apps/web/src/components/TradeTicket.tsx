import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Fill, MarketStatus, OrderIntent, PlaceOrderResponse, PriceCents, UsdCents } from '@jet/shared';
import { MAX_PRICE_CENTS, MIN_PRICE_CENTS, oddsPriceCents, shares } from '@jet/shared';
import { C, S } from '../theme.js';
import { formatPriceCents, formatUsdCents } from '../format.js';
import Panel from './Panel.js';

interface Props {
  marketId: string;
  userId: string;
  marketStatus: MarketStatus;
  apiUrl: string;
  selectedOrder: { intent: OrderIntent; price: PriceCents; nonce: number } | null;
  onOrderAccepted: () => Promise<void>;
  onFillsAccepted: (fills: Fill[]) => void;
}

const INTENTS: Array<{
  intent: OrderIntent;
  label: string;
  color: string;
  caption: string;
}> = [
  { intent: 'BUY_YES', label: 'Buy YES', color: C.yes, caption: 'Bid YES' },
  { intent: 'BUY_NO', label: 'Buy NO', color: C.no, caption: 'Ask YES complement' },
  { intent: 'SELL_YES', label: 'Sell YES', color: C.warn, caption: 'Ask YES' },
  { intent: 'SELL_NO', label: 'Sell NO', color: C.accent, caption: 'Bid YES complement' },
];

export default function TradeTicket({
  marketId,
  userId,
  marketStatus,
  apiUrl,
  selectedOrder,
  onOrderAccepted,
  onFillsAccepted,
}: Props) {
  const [intent, setIntent] = useState<OrderIntent>('BUY_YES');
  const [priceInput, setPriceInput] = useState('50');
  const [sizeInput, setSizeInput] = useState('10');
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOrder) return;
    setIntent(selectedOrder.intent);
    setPriceInput(String(selectedOrder.price));
    setHint(`Loaded ${intentLabel(selectedOrder.intent)} from order book`);
  }, [selectedOrder]);

  const priceNum = parseInt(priceInput, 10);
  const sizeNum = parseInt(sizeInput, 10);
  const validPrice = Number.isInteger(priceNum) && priceNum >= MIN_PRICE_CENTS && priceNum <= MAX_PRICE_CENTS;
  const validSize = Number.isInteger(sizeNum) && sizeNum > 0;
  const canSubmit = validPrice && validSize && marketStatus === 'open' && !submitting;
  const currentIntent = INTENTS.find((item) => item.intent === intent) ?? INTENTS[0]!;

  const estimates = useMemo(() => {
    if (!validPrice || !validSize) return null;
    const isBuy = intent === 'BUY_YES' || intent === 'BUY_NO';
    const chosenCostPerShare = isBuy ? priceNum : 100 - priceNum;
    const maxCostCents = chosenCostPerShare * sizeNum;
    const maxPayoutCents = 100 * sizeNum;
    return {
      isBuy,
      maxCostCents: maxCostCents as UsdCents,
      maxPayoutCents: maxPayoutCents as UsdCents,
      maxProfitCents: (maxPayoutCents - maxCostCents) as UsdCents,
    };
  }, [intent, priceNum, sizeNum, validPrice, validSize]);

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setHint(null);
    try {
      const res = await fetch(`${apiUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          marketId,
          intent,
          price: oddsPriceCents(priceNum),
          type: 'LIMIT',
          size: shares(sizeNum),
          tif: 'GTC',
        }),
      });
      const body = (await res.json().catch(() => null)) as PlaceOrderResponse | null;
      if (res.status === 404) {
        setHint('Order rejected: market not found or inactive.');
      } else if (!res.ok || !body?.ok) {
        setHint(body && !body.ok ? body.error.message : `Order rejected (${res.status})`);
      } else {
        onFillsAccepted(body.fills);
        const fillCopy = body.fills.length === 1 ? '1 fill' : `${body.fills.length} fills`;
        setHint(body.fills.length > 0 ? `Order accepted · ${fillCopy}` : 'Order resting in the book');
        await onOrderAccepted();
      }
    } catch {
      setHint('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Panel title="Trade">
      <div style={intentGridStyle}>
        {INTENTS.map((item) => (
          <IntentButton
            key={item.intent}
            label={item.label}
            caption={item.caption}
            active={intent === item.intent}
            color={item.color}
            onClick={() => {
              setIntent(item.intent);
              setHint(null);
            }}
          />
        ))}
      </div>

      <Field label={`${priceSideLabel(intent)} limit price (${MIN_PRICE_CENTS}-${MAX_PRICE_CENTS} cents)`}>
        <input
          type="number"
          min={MIN_PRICE_CENTS}
          max={MAX_PRICE_CENTS}
          step={1}
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          style={{ ...inputStyle, borderColor: validPrice ? C.border : C.bad }}
        />
      </Field>
      <Field label="Shares">
        <input
          type="number"
          min={1}
          step={1}
          value={sizeInput}
          onChange={(e) => setSizeInput(e.target.value)}
          style={{ ...inputStyle, borderColor: validSize ? C.border : C.bad }}
        />
      </Field>

      {estimates && (
        <div style={estimateBoxStyle}>
          <TicketRow
            label={estimates.isBuy ? 'Max cost' : 'Reserve required'}
            value={formatUsdCents(estimates.maxCostCents)}
          />
          <TicketRow label="Max payout" value={formatUsdCents(estimates.maxPayoutCents)} color={C.yes} />
          <TicketRow label="Max profit" value={formatUsdCents(estimates.maxProfitCents)} color={C.yes} />
          <TicketRow label="Break-even" value={`${formatPriceCents(priceNum as PriceCents)} implied`} />
          <div style={normalizationStyle}>{normalizationCopy(intent, priceNum as PriceCents)}</div>
        </div>
      )}

      <button
        disabled={!canSubmit}
        onClick={() => void submit()}
        style={{
          ...submitBtn,
          opacity: canSubmit ? 1 : 0.4,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          background: currentIntent.color,
        }}
      >
        {submitting ? 'Submitting...' : currentIntent.label}
      </button>

      {marketStatus !== 'open' && (
        <div style={{ fontSize: 11, color: C.textMute, marginTop: S.xs }}>
          {marketStatus === 'resolving'
            ? 'Resolving from oracle TWAP... trading disabled.'
            : marketStatus === 'resolved'
            ? 'Market resolved. Trading disabled.'
            : `Market ${marketStatus}; trading disabled.`}
        </div>
      )}
      {hint && (
        <div style={{ fontSize: 11, color: C.textDim, marginTop: S.xs }}>{hint}</div>
      )}
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: S.sm }}>
      <div style={{ fontSize: 11, color: C.textMute, marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

function IntentButton({
  label,
  caption,
  active,
  color,
  onClick,
}: {
  label: string;
  caption: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 56,
        padding: `${S.sm}px`,
        border: `1px solid ${active ? color : C.border}`,
        borderRadius: 6,
        background: active ? color + '22' : C.panelAlt,
        color: active ? color : C.text,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 10, color: active ? color : C.textMute, marginTop: 2 }}>{caption}</div>
    </button>
  );
}

function TicketRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: S.sm, fontSize: 12 }}>
      <span style={{ color: C.textDim }}>{label}</span>
      <span style={{ color: color ?? C.text, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function intentLabel(intent: OrderIntent): string {
  return intent.replace('_', ' ');
}

function priceSideLabel(intent: OrderIntent): string {
  return intent.endsWith('NO') ? 'NO' : 'YES';
}

function canonicalYesPrice(intent: OrderIntent, price: PriceCents): PriceCents {
  if (intent === 'BUY_NO' || intent === 'SELL_NO') {
    return oddsPriceCents(100 - price);
  }
  return price;
}

function normalizationCopy(intent: OrderIntent, price: PriceCents): string {
  const yesPrice = canonicalYesPrice(intent, price);
  if (intent === 'BUY_YES') return `Routes to canonical YES bid at ${formatPriceCents(yesPrice)}.`;
  if (intent === 'SELL_YES') return `Routes to canonical YES ask at ${formatPriceCents(yesPrice)}.`;
  if (intent === 'BUY_NO') {
    return `Buy NO at ${formatPriceCents(price)} = sell YES at ${formatPriceCents(yesPrice)}.`;
  }
  return `Sell NO at ${formatPriceCents(price)} = buy YES at ${formatPriceCents(yesPrice)}.`;
}

const intentGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: S.xs,
  marginBottom: S.md,
};

const inputStyle: CSSProperties = {
  width: '100%',
  background: C.panelAlt,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  color: C.text,
  fontSize: 13,
  padding: '6px 8px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const estimateBoxStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: S.xs,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  background: C.panelAlt,
  padding: S.sm,
  marginBottom: S.sm,
};

const normalizationStyle: CSSProperties = {
  borderTop: `1px solid ${C.border}`,
  paddingTop: S.xs,
  marginTop: S.xs,
  color: C.textMute,
  fontSize: 11,
  lineHeight: 1.35,
};

const submitBtn: CSSProperties = {
  width: '100%',
  padding: '9px 0',
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  fontSize: 13,
  fontWeight: 800,
  fontFamily: 'inherit',
  marginTop: S.xs,
};
