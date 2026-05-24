import type { CSSProperties } from 'react';
import type {
  IndicativeSnapshot,
  RampResolution,
  DispersionState,
  VenueHealth,
} from '@jet/shared';
import { C, S } from '../theme.js';
import { formatUsdCents, formatBps } from '../format.js';
import Panel from './Panel.js';

interface Props {
  oracleSnapshot: IndicativeSnapshot | null;
  resolution: RampResolution | null;
  resolutionPnl: number | null;
}

const DISPERSION_COLOR: Record<DispersionState, string> = {
  NORMAL: C.ok,
  ELEVATED: C.warn,
  STRESSED: '#f97316',
  DISLOCATED: C.bad,
};

export default function OraclePanel({ oracleSnapshot, resolution, resolutionPnl }: Props) {
  if (resolution) {
    return <PostResolution resolution={resolution} resolutionPnl={resolutionPnl} />;
  }
  if (oracleSnapshot) {
    return <PreResolution snapshot={oracleSnapshot} />;
  }
  return (
    <Panel title="Oracle · RAMP_V1">
      <div style={{ color: C.textMute, fontSize: 13, padding: `${S.sm}px 0` }}>
        Waiting for oracle…
      </div>
    </Panel>
  );
}

function PreResolution({ snapshot }: { snapshot: IndicativeSnapshot }) {
  const dispColor = DISPERSION_COLOR[snapshot.dispersionState];

  return (
    <Panel title="Oracle · RAMP_V1">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: S.lg, marginBottom: S.md }}>
        <div>
          <div style={metaLabel}>INDICATIVE</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>
            {formatUsdCents(snapshot.priceCents)}
          </div>
        </div>
        <div>
          <div style={metaLabel}>DISPERSION</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: S.xs }}>
            <span style={{ fontSize: 14, color: C.text }}>{formatBps(snapshot.dispersionBps)}</span>
            <Pill text={snapshot.dispersionState} color={dispColor} />
          </div>
        </div>
        <div>
          <div style={metaLabel}>CONFIDENCE</div>
          <Pill
            text={snapshot.confidence}
            color={snapshot.confidence === 'HIGH' ? C.ok : snapshot.confidence === 'MEDIUM' ? C.warn : C.bad}
          />
        </div>
      </div>

      <div>
        <div style={{ ...metaLabel, marginBottom: S.xs }}>VENUES</div>
        {snapshot.venues.map((v) => (
          <VenueRow key={v.venue} venue={v} />
        ))}
      </div>
    </Panel>
  );
}

function VenueRow({ venue }: { venue: VenueHealth }) {
  return (
    <div style={venueRowStyle}>
      <span style={{ color: C.text, fontWeight: 600, minWidth: 80 }}>{venue.venue}</span>
      <span style={{ color: C.textDim, fontSize: 11 }}>{venue.quote}</span>
      <span style={{ color: C.text }}>
        {venue.midCents != null ? formatUsdCents(venue.midCents) : '—'}
      </span>
      <span style={{ color: C.textDim }}>{formatBps(venue.spreadBps)}</span>
      {venue.healthy ? (
        <Pill text="OK" color={C.ok} small />
      ) : (
        <Pill text={venue.excludedReason ?? 'EXCLUDED'} color={C.bad} small />
      )}
    </div>
  );
}

function PostResolution({
  resolution,
  resolutionPnl,
}: {
  resolution: RampResolution;
  resolutionPnl: number | null;
}) {
  const dispColor = DISPERSION_COLOR[resolution.dispersionState];
  const hash = resolution.inputHash.slice(0, 16) + '…';

  return (
    <Panel title="Oracle · RAMP_V1 · Settled">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: S.lg, marginBottom: S.md }}>
        <div>
          <div style={metaLabel}>OUTCOME</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: resolution.outcome === 'YES' ? C.yes : C.no }}>
            {resolution.outcome}
          </div>
        </div>
        <div>
          <div style={metaLabel}>RESOLUTION PRICE</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
            {formatUsdCents(resolution.resolutionPriceCents)}
          </div>
        </div>
        <div>
          <div style={metaLabel}>CONFIDENCE</div>
          <Pill
            text={resolution.confidence}
            color={resolution.confidence === 'HIGH' ? C.ok : resolution.confidence === 'MEDIUM' ? C.warn : C.bad}
          />
        </div>
        <div>
          <div style={metaLabel}>DISPERSION</div>
          <Pill text={resolution.dispersionState} color={dispColor} />
        </div>
        <div>
          <div style={metaLabel}>MY PnL</div>
          {resolutionPnl != null ? (
            <div style={{ fontSize: 16, fontWeight: 700, color: resolutionPnl >= 0 ? C.yes : C.bad }}>
              {resolutionPnl >= 0 ? '+' : ''}
              {formatUsdCents(resolutionPnl as Parameters<typeof formatUsdCents>[0])}
            </div>
          ) : (
            <span style={{ color: C.textMute }}>—</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: S.xl, marginBottom: S.md }}>
        <div>
          <div style={metaLabel}>SOURCES USED</div>
          <div style={{ fontSize: 12, color: C.yes }}>{resolution.sourcesUsed.join(', ')}</div>
        </div>
        {resolution.sourcesExcluded.length > 0 && (
          <div>
            <div style={metaLabel}>EXCLUDED</div>
            <div style={{ fontSize: 12 }}>
              {resolution.sourcesExcluded.map((s) => (
                <span key={s.venue} style={{ color: C.bad, marginRight: S.sm }}>
                  {s.venue} ({s.reason}
                  {s.deviationBps != null ? `, ${formatBps(s.deviationBps)}` : ''})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: C.textMute }}>
        {resolution.partitions.length} partitions · inputHash:{' '}
        <span style={{ fontFamily: 'monospace' }}>{hash}</span>
      </div>
    </Panel>
  );
}

function Pill({ text, color, small }: { text: string; color: string; small?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: small ? '1px 5px' : '2px 8px',
        borderRadius: 4,
        fontSize: small ? 10 : 11,
        fontWeight: 700,
        letterSpacing: '0.06em',
        background: color + '22',
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {text}
    </span>
  );
}

const metaLabel: CSSProperties = {
  fontSize: 10,
  color: C.textMute,
  letterSpacing: '0.1em',
  fontWeight: 700,
  textTransform: 'uppercase',
  marginBottom: 3,
};

const venueRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '80px 40px 1fr 80px auto',
  gap: S.sm,
  alignItems: 'center',
  fontSize: 12,
  padding: '3px 0',
  borderBottom: `1px solid ${C.border}22`,
};
