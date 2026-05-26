import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { createChart, AreaSeries, LineStyle } from 'lightweight-charts';
import type { UTCTimestamp } from 'lightweight-charts';
import type { PriceCents, SharePricePoint } from '@jet/shared';
import { C, S, T, mono, panelHeader } from '../theme.js';
import { formatPriceCents } from '../format.js';

interface Props {
  sharePriceHistory: SharePricePoint[];
  currentPoint: SharePricePoint | null;
  bestBid: PriceCents | null;
  bestAsk: PriceCents | null;
  spread: PriceCents | null;
  height?: number;
}

export default function ChartPanel({ sharePriceHistory, currentPoint, bestBid, bestAsk, spread, height = 260 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fiftyLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bidLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const askLineRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const chart = createChart(el, {
      layout: { background: { color: C.panel }, textColor: C.textMute, fontFamily: mono, fontSize: 11 },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: {
        borderColor: 'transparent',
        minimumWidth: 56,
      },
      timeScale: { borderColor: 'transparent', timeVisible: true, secondsVisible: true },
      crosshair: {
        mode: 1,
        vertLine: { color: C.borderSoft, width: 1, style: LineStyle.Dotted, labelBackgroundColor: C.elevated },
        horzLine: { color: C.borderSoft, width: 1, style: LineStyle.Dotted, labelBackgroundColor: C.elevated },
      },
      width: el.clientWidth,
      height,
    });
    chart.priceScale('right').applyOptions({ autoScale: true, scaleMargins: { top: 0.1, bottom: 0.1 } });
    chartRef.current = chart;
    const series = chart.addSeries(AreaSeries, {
      lineColor: C.yes,
      topColor: 'rgba(26,166,74,0.28)',
      bottomColor: 'rgba(26,166,74,0)',
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      autoscaleInfoProvider: (original: any) => {
        const res = original();
        if (!res || !res.priceRange) return res;
        const buffer = 2;
        const min = Math.max(0, res.priceRange.minValue - buffer);
        const max = Math.min(100, res.priceRange.maxValue + buffer);
        if (max - min < 4) {
          const mid = (min + max) / 2;
          return { priceRange: { minValue: Math.max(0, mid - 2), maxValue: Math.min(100, mid + 2) } };
        }
        return { priceRange: { minValue: min, maxValue: max } };
      },
    });
    seriesRef.current = series;
    fiftyLineRef.current = series.createPriceLine({
      price: 50,
      color: C.borderSoft,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '50%',
    });
    bidLineRef.current = series.createPriceLine({
      price: 0,
      color: C.yes,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: 'BID',
    });
    askLineRef.current = series.createPriceLine({
      price: 100,
      color: C.no,
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: 'ASK',
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
      fiftyLineRef.current = null;
      bidLineRef.current = null;
      askLineRef.current = null;
    };
  }, [height]);

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

  useEffect(() => {
    bidLineRef.current?.applyOptions({
      price: bestBid ?? 0,
      axisLabelVisible: bestBid != null,
      title: bestBid != null ? 'BID' : '',
    });
    askLineRef.current?.applyOptions({
      price: bestAsk ?? 100,
      axisLabelVisible: bestAsk != null,
      title: bestAsk != null ? 'ASK' : '',
    });
  }, [bestBid, bestAsk]);

  const yes = currentPoint?.yesPriceCents ?? null;
  const yesDeltaCents = yes != null ? yes - 50 : null;
  const yesDeltaPct = yes != null ? ((yes - 50) / 50) * 100 : null;
  const yesDeltaColor =
    yesDeltaCents == null ? C.textDim : yesDeltaCents > 0 ? C.yes : yesDeltaCents < 0 ? C.no : C.textDim;
  return (
    <div style={containerStyle}>
      <div style={{ ...panelHeader, background: C.panel, borderBottom: `1px solid ${C.border}`, height: 64 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: S.md, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={T.h3}>BTC-2M Above</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: S.sm, flexWrap: 'wrap' }}>
              <span style={{ ...T.numLg, color: C.text, lineHeight: 1 }}>
                {yes != null ? formatPriceCents(yes) : '--'}
              </span>
              {yes != null && yesDeltaCents != null && yesDeltaPct != null && (
                <span
                  style={{
                    fontSize: 13,
                    color: yesDeltaColor,
                    fontFamily: mono,
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 700,
                  }}
                >
                  {yesDeltaCents >= 0 ? '+' : ''}
                  {yesDeltaCents}¢ / {yesDeltaPct >= 0 ? '+' : ''}
                  {yesDeltaPct.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={chipRowStyle}>
          <QuoteStat label="Bid" value={bestBid} color={C.yes} />
          <QuoteStat label="Ask" value={bestAsk} color={C.no} />
          <QuoteStat label="Spread" value={spread} color={C.textDim} />
        </div>
      </div>
      <div style={chartWrapStyle}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {sharePriceHistory.length === 0 && <div style={emptyOverlayStyle}>Waiting for prediction prints</div>}
      </div>
    </div>
  );
}

function sourcePriority(source: SharePricePoint['source']): number {
  if (source === 'trade') return 3;
  if (source === 'mid') return 2;
  return 1;
}

function QuoteStat({ label, value, color }: { label: string; value: PriceCents | null; color: string }) {
  return (
    <div style={quoteStatStyle}>
      <div style={{ ...T.eyebrow, fontSize: 10 }}>{label}</div>
      <div
        style={{
          color,
          fontSize: 16,
          fontWeight: 700,
          fontFamily: mono,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        {value != null ? formatPriceCents(value) : '--'}
      </div>
    </div>
  );
}

const containerStyle: CSSProperties = {
  background: C.panel,
  borderRight: `1px solid ${C.border}`,
  borderBottom: `1px solid ${C.border}`,
  overflow: 'hidden',
  minWidth: 0,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
};

const chipRowStyle: CSSProperties = {
  display: 'flex',
  gap: S.md,
  flexShrink: 0,
  justifyContent: 'flex-end',
  alignItems: 'center',
};

const quoteStatStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  textAlign: 'right',
  minWidth: 56,
  gap: 4,
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
