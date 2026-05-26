import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { createChart, AreaSeries, LineStyle } from 'lightweight-charts';
import type { UTCTimestamp } from 'lightweight-charts';
import type { UsdCents } from '@jet/shared';
import { C, S, T, mono, panelHeader } from '../theme.js';
import { formatUsdCents } from '../format.js';
import type { PricePoint } from '../hooks/usePriceHistory.js';

interface Props {
  priceHistory: PricePoint[];
  thresholdCents: UsdCents;
  currentPriceCents: UsdCents | null;
  height?: number;
}

export default function OracleReferencePanel({ priceHistory, thresholdCents, currentPriceCents, height = 220 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceLineRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const chart = createChart(el, {
      layout: { background: { color: C.panel }, textColor: C.textMute, fontFamily: mono, fontSize: 11 },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: { borderColor: 'transparent' },
      timeScale: { borderColor: 'transparent', timeVisible: true, secondsVisible: true },
      crosshair: {
        mode: 1,
        vertLine: { color: C.borderSoft, width: 1, style: LineStyle.Dotted, labelBackgroundColor: C.elevated },
        horzLine: { color: C.borderSoft, width: 1, style: LineStyle.Dotted, labelBackgroundColor: C.elevated },
      },
      width: el.clientWidth,
      height,
    });
    chartRef.current = chart;
    const series = chart.addSeries(AreaSeries, {
      lineColor: C.oracle,
      topColor: 'rgba(34,211,238,0.24)',
      bottomColor: 'rgba(34,211,238,0)',
      lineWidth: 2,
    });
    seriesRef.current = series;
    priceLineRef.current = series.createPriceLine({
      price: thresholdCents / 100,
      color: C.warn,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'STRIKE',
    });

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLineRef.current = null;
    };
  }, [thresholdCents, height]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const seen = new Map<number, number>();
    for (const p of priceHistory) {
      seen.set(Math.floor(p.ts / 1000), p.btcPriceCents / 100);
    }
    const data = Array.from(seen.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time: time as UTCTimestamp, value }));
    series.setData(data);
  }, [priceHistory]);

  const deltaVsStrikeBps =
    currentPriceCents != null
      ? Math.round(((currentPriceCents - thresholdCents) / thresholdCents) * 10000)
      : null;
  const deltaCents = currentPriceCents != null ? currentPriceCents - thresholdCents : null;

  return (
    <div style={containerStyle}>
      <div style={{ ...panelHeader, background: C.panel, borderBottom: `1px solid ${C.border}`, height: 64 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={T.h3}>BTC/USD Oracle</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: S.sm, flexWrap: 'wrap' }}>
            <span style={{ ...T.numLg, color: C.text, lineHeight: 1 }}>
              {currentPriceCents != null ? formatUsdCents(currentPriceCents) : '--'}
            </span>
            {deltaVsStrikeBps != null && deltaCents != null && (
              <span
                style={{
                  fontSize: 13,
                  color: deltaVsStrikeBps >= 0 ? C.yes : C.no,
                  fontFamily: mono,
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 700,
                }}
              >
                {deltaCents >= 0 ? '+' : ''}
                {formatUsdCents(deltaCents as UsdCents)} / {formatPct(deltaVsStrikeBps)}
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ ...T.eyebrow, fontSize: 10 }}>Resolution Strike</div>
          <div style={{ ...T.numMd, fontSize: 16 }}>{formatUsdCents(thresholdCents)}</div>
        </div>
      </div>
      <div style={chartWrapStyle}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {priceHistory.length === 0 && <div style={emptyOverlayStyle}>Waiting for oracle ticks</div>}
      </div>
    </div>
  );
}

function formatPct(bps: number): string {
  const pct = bps / 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

const containerStyle: CSSProperties = {
  background: C.panel,
  borderBottom: `1px solid ${C.border}`,
  overflow: 'hidden',
  minWidth: 0,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
};

const chartWrapStyle: CSSProperties = {
  position: 'relative',
  background: C.panel,
  minHeight: 0,
  flex: 1,
};

const emptyOverlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: C.textMute,
  fontSize: 12,
  pointerEvents: 'none',
};
