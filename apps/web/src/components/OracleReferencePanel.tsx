import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { createChart, LineSeries, LineStyle } from 'lightweight-charts';
import type { UTCTimestamp } from 'lightweight-charts';
import type { UsdCents } from '@jet/shared';
import { C, S, panel } from '../theme.js';
import { formatUsdCents } from '../format.js';
import type { PricePoint } from '../hooks/usePriceHistory.js';

interface Props {
  priceHistory: PricePoint[];
  thresholdCents: UsdCents;
  currentPriceCents: UsdCents | null;
}

export default function OracleReferencePanel({ priceHistory, thresholdCents, currentPriceCents }: Props) {
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
      layout: { background: { color: C.panel }, textColor: C.textDim },
      grid: { vertLines: { color: C.border }, horzLines: { color: C.border } },
      rightPriceScale: { borderColor: C.border },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: true },
      crosshair: { mode: 1 },
      width: el.clientWidth,
      height: 130,
    });
    chartRef.current = chart;
    const series = chart.addSeries(LineSeries, { color: C.accent, lineWidth: 2 });
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
      chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLineRef.current = null;
    };
  }, [thresholdCents]);

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

  return (
    <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
      <div style={headerStyle}>
        <div>
          <div style={labelStyle}>BTC / USD ORACLE INPUT</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: S.xs, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: C.text }}>
              {currentPriceCents != null ? formatUsdCents(currentPriceCents) : '--'}
            </span>
            {deltaVsStrikeBps != null && (
              <span style={{ fontSize: 11, color: deltaVsStrikeBps >= 0 ? C.yes : C.no }}>
                {deltaVsStrikeBps >= 0 ? '+' : ''}
                {deltaVsStrikeBps} bps
              </span>
            )}
          </div>
        </div>
      </div>
      <div ref={containerRef} />
    </div>
  );
}

const headerStyle: CSSProperties = {
  padding: `${S.sm}px ${S.md}px`,
  borderBottom: `1px solid ${C.border}`,
};

const labelStyle: CSSProperties = {
  fontSize: 10,
  color: C.textMute,
  letterSpacing: '0.1em',
  fontWeight: 800,
  textTransform: 'uppercase',
  marginBottom: S.xs,
};
