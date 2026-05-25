import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { MarketStatus, Side, Action, UsdCents } from '@jet/shared';
import { MIN_PRICE_CENTS, MAX_PRICE_CENTS, oddsPriceCents, shares } from '@jet/shared';
import { C, S } from '../theme.js';
import { formatUsdCents } from '../format.js';
import Panel from './Panel.js';

interface Props {
  marketId: string;
  userId: string;
  marketStatus: MarketStatus;
  apiUrl: string;
}

export default function TradeTicket({ marketId, userId, marketStatus, apiUrl }: Props) {
  const [side, setSide] = useState<Side>('YES');
  const [action, setAction] = useState<Action>('BUY');
  const [priceInput, setPriceInput] = useState('50');
  const [sizeInput, setSizeInput] = useState('10');
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const priceNum = parseInt(priceInput, 10);
  const sizeNum = parseInt(sizeInput, 10);
  const validPrice = Number.isInteger(priceNum) && priceNum >= MIN_PRICE_CENTS && priceNum <= MAX_PRICE_CENTS;
  const validSize = Number.isInteger(sizeNum) && sizeNum > 0;
  const canSubmit = validPrice && validSize && marketStatus === 'open' && !submitting;

  const estCostCents = validPrice && validSize && action === 'BUY'
    ? (priceNum * sizeNum) as UsdCents
    : validPrice && validSize && action === 'SELL'
    ? ((100 - priceNum) * sizeNum) as UsdCents
    : null;
  const maxPayoutCents = validSize ? (100 * sizeNum) as UsdCents : null;

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
          side,
          action,
          type: 'LIMIT',
          oddsPriceCents: oddsPriceCents(priceNum),
          size: shares(sizeNum),
          tif: 'GTC',
        }),
      });
      if (res.status === 404) {
        setHint('Order endpoint not live yet (T2)');
      } else if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setHint(body.message ?? `Error ${res.status}`);
      } else {
        setHint('Order placed');
      }
    } catch {
      setHint('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Panel title="Trade">
      <div style={{ display: 'flex', gap: S.xs, marginBottom: S.sm }}>
        <ToggleBtn label="YES" active={side === 'YES'} color={C.yes} onClick={() => setSide('YES')} />
        <ToggleBtn label="NO" active={side === 'NO'} color={C.no} onClick={() => setSide('NO')} />
      </div>
      <div style={{ display: 'flex', gap: S.xs, marginBottom: S.md }}>
        <ToggleBtn label="BUY" active={action === 'BUY'} color={C.accent} onClick={() => setAction('BUY')} />
        <ToggleBtn label="SELL" active={action === 'SELL'} color={C.warn} onClick={() => setAction('SELL')} />
      </div>

      <Field label={`Price (${MIN_PRICE_CENTS}–${MAX_PRICE_CENTS} ¢)`}>
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
      <Field label="Size (shares)">
        <input
          type="number"
          min={1}
          step={1}
          value={sizeInput}
          onChange={(e) => setSizeInput(e.target.value)}
          style={{ ...inputStyle, borderColor: validSize ? C.border : C.bad }}
        />
      </Field>

      {estCostCents != null && (
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: S.sm }}>
          Est. cost: <strong style={{ color: C.text }}>{formatUsdCents(estCostCents)}</strong>
          {maxPayoutCents != null && (
            <> · Max payout: <strong style={{ color: C.yes }}>{formatUsdCents(maxPayoutCents)}</strong></>
          )}
        </div>
      )}

      <button
        disabled={!canSubmit}
        onClick={() => void submit()}
        style={{
          ...submitBtn,
          opacity: canSubmit ? 1 : 0.4,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          background: action === 'BUY' ? C.accent : C.warn,
        }}
      >
        {submitting ? '…' : `${action} ${side}`}
      </button>

      {marketStatus !== 'open' && (
        <div style={{ fontSize: 11, color: C.textMute, marginTop: S.xs }}>
          Market {marketStatus} — trading disabled
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

function ToggleBtn({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '5px 0',
        border: `1px solid ${active ? color : C.border}`,
        borderRadius: 4,
        background: active ? color + '22' : 'transparent',
        color: active ? color : C.textMute,
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'inherit',
        letterSpacing: '0.06em',
      }}
    >
      {label}
    </button>
  );
}

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

const submitBtn: CSSProperties = {
  width: '100%',
  padding: '8px 0',
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  fontFamily: 'inherit',
  letterSpacing: '0.06em',
  marginTop: S.xs,
};
