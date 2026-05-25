import { useEffect, useRef, useState } from 'react';
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

export default function ChartPanel({ priceHistory, thresholdCents, currentPriceCents }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceLineRef = useRef<any>(null);
  const [showStrike, setShowStrike] = useState(true);

  // Init chart
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
      height: 200,
    });
    chartRef.current = chart;
    seriesRef.current = chart.addSeries(LineSeries, { color: C.accent, lineWidth: 2 });

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
  }, []);

  // Update series data
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || priceHistory.length === 0) return;
    const seen = new Map<number, number>();
    for (const p of priceHistory) {
      seen.set(Math.floor(p.ts / 1000), p.btcPriceCents / 100);
    }
    const data = Array.from(seen.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time: time as UTCTimestamp, value }));
    series.setData(data);
  }, [priceHistory]);

  // Strike price line
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (priceLineRef.current) {
      series.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }
    if (showStrike) {
      priceLineRef.current = series.createPriceLine({
        price: thresholdCents / 100,
        color: C.warn,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'STRIKE',
      });
    }
  }, [showStrike, thresholdCents]);

  const deltaVsStrikeBps =
    currentPriceCents != null
      ? Math.round(((currentPriceCents - thresholdCents) / thresholdCents) * 10000)
      : null;

  return (
    <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: S.sm }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: C.text }}>
            {currentPriceCents != null ? formatUsdCents(currentPriceCents) : '—'}
          </span>
          {deltaVsStrikeBps != null && (
            <span style={{ fontSize: 12, color: deltaVsStrikeBps >= 0 ? C.yes : C.no }}>
              {deltaVsStrikeBps >= 0 ? '+' : ''}
              {deltaVsStrikeBps} bps vs strike
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: C.textMute, letterSpacing: '0.1em', fontWeight: 700, textTransform: 'uppercase', alignSelf: 'center' }}>
          BTC / USD · INDICATIVE
        </div>
        <button onClick={() => setShowStrike((s) => !s)} style={toggleBtn}>
          {showStrike ? 'Hide' : 'Show'} strike
        </button>
      </div>
      <div ref={containerRef} />
    </div>
  );
}

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: `${S.sm}px ${S.md}px`,
  borderBottom: `1px solid ${C.border}`,
};

const toggleBtn: CSSProperties = {
  background: 'transparent',
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  color: C.textDim,
  fontSize: 11,
  padding: '3px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
