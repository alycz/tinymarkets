import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Balance, Fill, MarketStatus, OrderIntent, PlaceOrderResponse, Position, PriceCents, UsdCents } from '@jet/shared';
import { MAX_PRICE_CENTS, MIN_PRICE_CENTS, oddsPriceCents, shares } from '@jet/shared';
import { MARKET } from '@jet/config';
import { C, S, T, mono } from '../theme.js';
import { formatPriceCents, formatUsdCents } from '../format.js';

interface Props {
  marketId: string;
  userId: string;
  marketStatus: MarketStatus;
  apiUrl: string;
  balance: Balance | null;
  position: Position | null;
  bestBid: PriceCents | null;
  bestAsk: PriceCents | null;
  selectedOrder: { intent: OrderIntent; price: PriceCents; nonce: number } | null;
  onOrderAccepted: () => Promise<void>;
  onFillsAccepted: (fills: Fill[]) => void;
}

type Side = 'buy' | 'sell';
type Outcome = 'above' | 'below';
type Mode = 'instant' | 'limit';

const SLIPPAGE_CENTS = 1;

function deriveIntent(side: Side, outcome: Outcome): OrderIntent {
  if (side === 'buy' && outcome === 'above') return 'BUY_YES';
  if (side === 'buy' && outcome === 'below') return 'BUY_NO';
  if (side === 'sell' && outcome === 'above') return 'SELL_YES';
  return 'SELL_NO';
}

function fromIntent(intent: OrderIntent): { side: Side; outcome: Outcome } {
  switch (intent) {
    case 'BUY_YES':
      return { side: 'buy', outcome: 'above' };
    case 'BUY_NO':
      return { side: 'buy', outcome: 'below' };
    case 'SELL_YES':
      return { side: 'sell', outcome: 'above' };
    case 'SELL_NO':
      return { side: 'sell', outcome: 'below' };
  }
}

function labelFor(side: Side, outcome: Outcome): string {
  const s = side === 'buy' ? 'Buy' : 'Sell';
  const o = outcome === 'above' ? 'Above' : 'Below';
  return `${s} ${o}`;
}

function submitLabel(mode: Mode, side: Side, outcome: Outcome): string {
  const action = labelFor(side, outcome);
  return mode === 'instant' ? `${action} Now` : `Place ${action} Limit`;
}

function priceForButton(
  side: Side,
  outcome: Outcome,
  bestBid: PriceCents | null,
  bestAsk: PriceCents | null,
): number | null {
  if (side === 'buy' && outcome === 'above') return bestAsk ?? null;
  if (side === 'buy' && outcome === 'below') return bestBid != null ? 100 - bestBid : null;
  if (side === 'sell' && outcome === 'above') return bestBid ?? null;
  return bestAsk != null ? 100 - bestAsk : null;
}

function instantPrice(
  side: Side,
  outcome: Outcome,
  bestBid: PriceCents | null,
  bestAsk: PriceCents | null,
): number | null {
  if (side === 'buy' && outcome === 'above') return bestAsk != null ? bestAsk + SLIPPAGE_CENTS : null;
  if (side === 'sell' && outcome === 'above') return bestBid != null ? bestBid - SLIPPAGE_CENTS : null;
  if (side === 'buy' && outcome === 'below') return bestBid != null ? (100 - bestBid) + SLIPPAGE_CENTS : null;
  return bestAsk != null ? (100 - bestAsk) - SLIPPAGE_CENTS : null;
}

function clampToTradable(price: number | null): number | null {
  if (price == null) return null;
  return Math.max(MIN_PRICE_CENTS, Math.min(MAX_PRICE_CENTS, Math.round(price)));
}

function validateSell(
  side: Side,
  outcome: Outcome,
  sizeNum: number,
  aboveOwned: number,
  belowOwned: number,
): string | null {
  if (side !== 'sell') return null;
  if (outcome === 'above') {
    if (aboveOwned <= 0) return 'You do not have Above shares to sell.';
    if (sizeNum > aboveOwned) return `Sell size exceeds your current position (${aboveOwned} Above).`;
    return null;
  }
  if (belowOwned <= 0) return 'You do not have Below shares to sell.';
  if (sizeNum > belowOwned) return `Sell size exceeds your current position (${belowOwned} Below).`;
  return null;
}

function validateBalance(
  side: Side,
  executablePrice: number | null,
  sizeNum: number,
  available: number,
): string | null {
  if (side !== 'buy' || executablePrice == null || !sizeNum) return null;
  const requiredCents = executablePrice * sizeNum;
  if (requiredCents > available) {
    return `Insufficient balance: order needs ${formatUsdCents(requiredCents as UsdCents)}, available ${formatUsdCents(available as UsdCents)}.`;
  }
  return null;
}

export default function TradeTicket({
  marketId,
  userId,
  marketStatus,
  apiUrl,
  balance,
  position,
  bestBid,
  bestAsk,
  selectedOrder,
  onOrderAccepted,
  onFillsAccepted,
}: Props) {
  const [mode, setMode] = useState<Mode>('instant');
  const [side, setSide] = useState<Side>('buy');
  const [outcome, setOutcome] = useState<Outcome>('above');
  const [priceInput, setPriceInput] = useState('50');
  const [sizeInput, setSizeInput] = useState('10');
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOrder) return;
    const { side: s, outcome: o } = fromIntent(selectedOrder.intent);
    setSide(s);
    setOutcome(o);
    setMode('limit');
    setPriceInput(String(selectedOrder.price));
    setHint(`Loaded ${labelFor(s, o)} limit from order book`);
  }, [selectedOrder]);

  const intent = useMemo(() => deriveIntent(side, outcome), [side, outcome]);
  const priceNum = parseInt(priceInput, 10);
  const sizeNum = parseInt(sizeInput, 10);
  const validPrice = Number.isInteger(priceNum) && priceNum >= MIN_PRICE_CENTS && priceNum <= MAX_PRICE_CENTS;
  const validSize = Number.isInteger(sizeNum) && sizeNum > 0;

  const instantClamped = useMemo(
    () => clampToTradable(instantPrice(side, outcome, bestBid, bestAsk)),
    [side, outcome, bestBid, bestAsk],
  );

  const executablePrice = mode === 'instant' ? instantClamped : (validPrice ? priceNum : null);

  const available = balance?.availableBalanceCents ?? (MARKET.startingBalanceCents as UsdCents);
  const reserved = balance?.reservedForOrdersCents ?? (0 as UsdCents);
  const locked = balance?.lockedSettlementCollateralCents ?? (0 as UsdCents);

  const net = position?.net ?? 0;
  const aboveOwned = Math.max(0, net);
  const belowOwned = Math.max(0, -net);

  const sellError = validSize ? validateSell(side, outcome, sizeNum, aboveOwned, belowOwned) : null;
  const balanceError = validateBalance(side, executablePrice, sizeNum, available);
  const blockingError = sellError ?? balanceError;

  const canSubmit =
    executablePrice != null &&
    validSize &&
    marketStatus === 'open' &&
    !submitting &&
    blockingError == null;

  const abovePrice = priceForButton(side, 'above', bestBid, bestAsk);
  const belowPrice = priceForButton(side, 'below', bestBid, bestAsk);

  const sellAboveBlocked = side === 'sell' && aboveOwned <= 0;
  const sellBelowBlocked = side === 'sell' && belowOwned <= 0;

  const aboveAvailable =
    !sellAboveBlocked && (mode === 'limit' || (side === 'buy' ? bestAsk != null : bestBid != null));
  const belowAvailable =
    !sellBelowBlocked && (mode === 'limit' || (side === 'buy' ? bestBid != null : bestAsk != null));

  const estimates = useMemo(() => {
    if (executablePrice == null || !validSize) return null;
    const isBuy = side === 'buy';
    const chosenCostPerShare = isBuy ? executablePrice : 100 - executablePrice;
    const maxCostCents = chosenCostPerShare * sizeNum;
    const maxPayoutCents = 100 * sizeNum;
    return {
      isBuy,
      maxCostCents: maxCostCents as UsdCents,
      maxPayoutCents: maxPayoutCents as UsdCents,
      maxProfitCents: (maxPayoutCents - maxCostCents) as UsdCents,
    };
  }, [executablePrice, side, sizeNum, validSize]);

  async function submit() {
    if (!canSubmit || executablePrice == null) return;
    setSubmitting(true);
    setHint(null);
    const tif: 'GTC' | 'IOC' = mode === 'limit' ? 'GTC' : 'IOC';
    // Submitted payload — intentionally minimal. Backend has no MARKET type;
    // Instant = LIMIT + IOC, Limit = LIMIT + GTC. Do not add legacy fields.
    const payload = {
      userId,
      marketId,
      intent,
      price: oddsPriceCents(executablePrice),
      type: 'LIMIT' as const,
      size: shares(sizeNum),
      tif,
    };
    try {
      const res = await fetch(`${apiUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as PlaceOrderResponse | null;
      if (!res.ok || !body?.ok) {
        const message =
          body && !body.ok
            ? body.error.message
            : res.status === 404
            ? 'Market not found or inactive.'
            : `Order rejected (${res.status})`;
        console.error('[order rejected]', { payload, status: res.status, body });
        setHint(message);
        return;
      }
      console.debug('[order accepted]', { payload, body });
      onFillsAccepted(body.fills);
      const fillCopy = body.fills.length === 1 ? '1 fill' : `${body.fills.length} fills`;
      const restingCopy = mode === 'instant' ? 'Order completed' : 'Order resting in the book';
      setHint(body.fills.length > 0 ? `Order accepted · ${fillCopy}` : restingCopy);
      await onOrderAccepted();
    } catch (err) {
      console.error('[order network error]', { payload, err });
      setHint('Network error — see console.');
    } finally {
      setSubmitting(false);
    }
  }

  const costLabel =
    estimates == null
      ? ''
      : mode === 'instant'
      ? estimates.isBuy
        ? 'Estimated cost'
        : 'Estimated proceeds'
      : estimates.isBuy
      ? 'Max cost'
      : 'Reserve required';

  return (
    <div style={containerStyle}>
      <div style={sideTabsStyle}>
        <SideTab
          active={side === 'buy'}
          onClick={() => {
            setSide('buy');
            setHint(null);
          }}
        >
          Buy
        </SideTab>
        <SideTab
          active={side === 'sell'}
          onClick={() => {
            setSide('sell');
            setHint(null);
            if (aboveOwned > 0 && belowOwned === 0) setOutcome('above');
            else if (belowOwned > 0 && aboveOwned === 0) setOutcome('below');
          }}
        >
          Sell
        </SideTab>
      </div>

      <div style={ticketBodyStyle}>
        <div style={outcomeRowStyle}>
          <OutcomeButton
            label="Above"
            color={C.yes}
            price={abovePrice}
            selected={outcome === 'above'}
            disabled={!aboveAvailable}
            onClick={() => {
              setOutcome('above');
              setHint(null);
            }}
          />
          <OutcomeButton
            label="Below"
            color={C.no}
            price={belowPrice}
            selected={outcome === 'below'}
            disabled={!belowAvailable}
            onClick={() => {
              setOutcome('below');
              setHint(null);
            }}
          />
        </div>

        <div style={modeTabsStyle}>
          <ModeTab
            active={mode === 'instant'}
            onClick={() => {
              setMode('instant');
              setHint(null);
            }}
          >
            Instant
          </ModeTab>
          <ModeTab
            active={mode === 'limit'}
            onClick={() => {
              setMode('limit');
              setHint(null);
            }}
          >
            Limit
          </ModeTab>
        </div>

        <div style={metricsStripStyle}>
          <MetricCell label="Available" value={formatUsdCents(available)} />
          <MetricCell label="Reserved" value={formatUsdCents(reserved)} dim />
          <MetricCell label="Collateral" value={formatUsdCents(locked)} dim isLast />
        </div>

        {mode === 'limit' ? (
          <Field
            label={`${side === 'buy' ? 'Max price' : 'Minimum price'} (${MIN_PRICE_CENTS}-${MAX_PRICE_CENTS}¢)`}
          >
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
        ) : (
          <div style={estimatedPriceBoxStyle}>
            <div style={T.eyebrow}>Estimated Price</div>
            <div style={estimatedPriceRowStyle}>
              <span style={estimatedPriceValueStyle}>
                {instantClamped != null ? `${instantClamped}¢` : 'Waiting for book…'}
              </span>
              {instantClamped != null && (
                <span style={estimatedPriceHelperStyle}>
                  Marketable Limit · ±{SLIPPAGE_CENTS}¢ Slippage
                </span>
              )}
            </div>
          </div>
        )}

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
            <TicketRow label={costLabel} value={formatUsdCents(estimates.maxCostCents)} />
            <TicketRow label="Max payout" value={formatUsdCents(estimates.maxPayoutCents)} color={C.yes} />
            <TicketRow label="Max profit" value={formatUsdCents(estimates.maxProfitCents)} color={C.yes} />
            <TicketRow
              label="Break-even"
              value={`${formatPriceCents(executablePrice as PriceCents)} Implied`}
            />
          </div>
        )}

        <button
          disabled={!canSubmit}
          onClick={() => void submit()}
          style={{
            ...submitBtn,
            opacity: canSubmit ? 1 : 0.45,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            background: C.accent,
            color: '#ffffff',
          }}
        >
          {submitting ? 'Submitting…' : submitLabel(mode, side, outcome)}
        </button>

        {marketStatus !== 'open' && (
          <div style={{ ...T.bodyDim, fontSize: 11, marginTop: S.sm, color: C.warn, textAlign: 'center' }}>
            {marketStatus === 'resolving'
              ? 'Resolving from oracle TWAP — trading disabled.'
              : marketStatus === 'resolved'
              ? 'Market Resolved — Trading Disabled'
              : `Market ${marketStatus} — trading disabled.`}
          </div>
        )}
        {marketStatus === 'open' && (blockingError ?? hint) && (
          <div
            style={{
              ...T.bodyDim,
              fontSize: 11,
              marginTop: S.sm,
              color: blockingError ? C.bad : C.textDim,
            }}
          >
            {blockingError ?? hint}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  dim,
  isLast,
}: {
  label: string;
  value: string;
  dim?: boolean;
  isLast?: boolean;
}) {
  return (
    <div style={{ ...metricCellStyle, borderRight: isLast ? 'none' : `1px solid ${C.border}` }}>
      <div style={T.eyebrow}>{label}</div>
      <div
        style={{
          color: dim ? C.textDim : C.text,
          fontSize: 13,
          fontWeight: 700,
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: S.sm }}>
      <div style={{ ...T.eyebrow, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function SideTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...sideTabButtonStyle,
        color: active ? C.text : C.textMute,
        borderBottomColor: active ? C.accent : 'transparent',
      }}
    >
      {children}
    </button>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...modeTabButtonStyle,
        color: active ? C.text : C.textMute,
        borderBottomColor: active ? C.accent : 'transparent',
      }}
    >
      {children}
    </button>
  );
}

function OutcomeButton({
  label,
  color,
  price,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  color: string;
  price: number | null;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        flex: 1,
        height: 40,
        border: 'none',
        borderRadius: 0,
        background: selected ? color : C.panelAlt,
        color: selected ? '#ffffff' : C.textDim,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        fontFamily: 'inherit',
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.02em',
        transition: 'background 120ms ease, color 120ms ease, opacity 120ms ease',
      }}
    >
      {label}
      {price != null ? ` · ${price}¢` : ''}
    </button>
  );
}

function TicketRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: S.sm, fontSize: 12, alignItems: 'baseline' }}>
      <span style={{ color: C.textDim }}>{label}</span>
      <span
        style={{
          color: color ?? C.text,
          fontWeight: 600,
          fontFamily: mono,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}

const containerStyle: CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  borderLeft: `1px solid ${C.border}`,
  borderBottom: `1px solid ${C.border}`,
  background: C.panel,
};

const sideTabsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  background: C.panelSoft,
  borderBottom: `1px solid ${C.border}`,
  height: 64,
};

const sideTabButtonStyle: CSSProperties = {
  flex: 1,
  border: 'none',
  background: 'transparent',
  padding: 0,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: '0.02em',
  cursor: 'pointer',
  borderBottom: '2px solid transparent',
  marginBottom: -1,
  transition: 'color 120ms ease, border-color 120ms ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const outcomeRowStyle: CSSProperties = {
  display: 'flex',
  gap: S.xs,
  marginBottom: S.md,
};

const modeTabsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  background: C.panelSoft,
  border: `1px solid ${C.border}`,
  height: 36,
  marginBottom: S.md,
};

const modeTabButtonStyle: CSSProperties = {
  flex: 1,
  border: 'none',
  background: 'transparent',
  padding: 0,
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.02em',
  cursor: 'pointer',
  borderBottom: '2px solid transparent',
  marginBottom: -1,
  transition: 'color 120ms ease, border-color 120ms ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const metricsStripStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  border: `1px solid ${C.border}`,
  background: C.panelSoft,
  marginBottom: S.md,
};

const metricCellStyle: CSSProperties = {
  padding: `${S.sm}px ${S.md}px`,
};

const ticketBodyStyle: CSSProperties = {
  padding: S.md,
  minHeight: 0,
  overflow: 'auto',
  flex: 1,
};

const inputStyle: CSSProperties = {
  width: '100%',
  background: C.panelSoft,
  border: `1px solid ${C.border}`,
  borderRadius: 0,
  color: C.text,
  fontSize: 13,
  fontFamily: mono,
  fontVariantNumeric: 'tabular-nums',
  padding: '8px 10px',
  boxSizing: 'border-box',
  outline: 'none',
  fontWeight: 600,
  transition: 'border-color 120ms ease',
};

const estimatedPriceBoxStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  border: `1px solid ${C.border}`,
  borderRadius: 0,
  background: C.panelSoft,
  padding: `${S.sm}px ${S.md}px`,
  marginBottom: S.sm,
};

const estimatedPriceRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: S.md,
  marginTop: 2,
};

const estimatedPriceValueStyle: CSSProperties = {
  color: C.text,
  fontSize: 18,
  fontWeight: 800,
  fontFamily: mono,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1.1,
};

const estimatedPriceHelperStyle: CSSProperties = {
  fontSize: 11,
  color: C.textMute,
  fontWeight: 500,
  textAlign: 'right',
};

const estimateBoxStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: S.xs,
  border: `1px solid ${C.border}`,
  borderRadius: 0,
  background: C.panelSoft,
  padding: S.md,
  marginBottom: S.md,
};

const submitBtn: CSSProperties = {
  width: '100%',
  padding: '13px 0',
  border: 'none',
  borderRadius: 0,
  fontSize: 14,
  fontWeight: 700,
  fontFamily: 'inherit',
  letterSpacing: '0.02em',
  marginTop: S.xs,
  transition: 'opacity 120ms ease, filter 120ms ease',
};
