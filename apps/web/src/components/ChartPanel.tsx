import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { createChart, LineSeries, LineStyle } from 'lightweight-charts';
import type { UTCTimestamp } from 'lightweight-charts';
import type { PriceCents, SharePricePoint } from '@jet/shared';
import { C, S, panel } from '../theme.js';
import { formatPriceCents } from '../format.js';

interface Props {
  sharePriceHistory: SharePricePoint[];
  currentPoint: SharePricePoint | null;
  bestBid: PriceCents | null;
  bestAsk: PriceCents | null;
  spread: PriceCents | null;
}

export default function ChartPanel({ sharePriceHistory, currentPoint, bestBid, bestAsk, spread }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fiftyLineRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const chart = createChart(el, {
      layout: { background: { color: C.panel }, textColor: C.textDim },
      grid: { vertLines: { color: C.border }, horzLines: { color: C.border } },
      rightPriceScale: {
        borderColor: C.border,
        minimumWidth: 54,
      },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: true },
      crosshair: { mode: 1 },
      width: el.clientWidth,
      height: 260,
    });
    chart.priceScale('right').applyOptions({ autoScale: false, scaleMargins: { top: 0.12, bottom: 0.12 } });
    chartRef.current = chart;
    const series = chart.addSeries(LineSeries, {
      color: C.yes,
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    });
    seriesRef.current = series;
    fiftyLineRef.current = series.createPriceLine({
      price: 50,
      color: C.textMute,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '50%',
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
      fiftyLineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const seen = new Map<number, { value: number; priority: number }>();
    for (const p of sharePriceHistory) {
      const value = p.yesPriceCents as number;
      if (!Number.isFinite(value) || value < 1 || value > 99) continue;
      const time = Math.floor(p.ts / 1000);
      const priority = sourcePriority(p.source);
      const existing = seen.get(time);
      if (!existing || priority >= existing.priority) {
        seen.set(time, { value, priority });
      }
    }
    const data = Array.from(seen.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, point]) => ({ time: time as UTCTimestamp, value: point.value }));
    series.setData(data);
  }, [sharePriceHistory]);

  const yes = currentPoint?.yesPriceCents ?? null;
  const no = currentPoint?.noPriceCents ?? null;
  const source = currentPoint?.source ?? 'mark';

  return (
    <div style={{ ...panel, padding: 0, overflow: 'hidden' }}>
      <div style={headerStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={labelStyle}>YES SHARE MARKET PRICE</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: S.sm, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 32, lineHeight: 1, fontWeight: 900, color: C.yes }}>
              {yes != null ? formatPriceCents(yes) : '--'}
            </span>
            <span style={{ fontSize: 13, color: C.textDim }}>
              NO {no != null ? formatPriceCents(no) : '--'}
            </span>
            <span style={{ fontSize: 11, color: C.textMute, textTransform: 'uppercase' }}>{source}</span>
          </div>
        </div>
        <div style={quoteBoxStyle}>
          <Quote label="Bid" value={bestBid} color={C.yes} />
          <Quote label="Ask" value={bestAsk} color={C.no} />
          <Quote label="Spread" value={spread} color={C.textDim} />
        </div>
      </div>
      <div ref={containerRef} />
    </div>
  );
}

function sourcePriority(source: SharePricePoint['source']): number {
  if (source === 'trade') return 3;
  if (source === 'mid') return 2;
  return 1;
}

function Quote({ label, value, color }: { label: string; value: PriceCents | null; color: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ color: C.textMute, fontSize: 10, fontWeight: 800 }}>{label}</div>
      <div style={{ color, fontSize: 15, fontWeight: 800 }}>
        {value != null ? formatPriceCents(value) : '--'}
      </div>
    </div>
  );
}

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: S.md,
  padding: `${S.md}px ${S.md}px`,
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

const quoteBoxStyle: CSSProperties = {
  display: 'flex',
  gap: S.lg,
  flexShrink: 0,
};
