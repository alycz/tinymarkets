import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type {
  AttackCostEstimate,
  DemoScenarioResponse,
  DispersionState,
  IndicativeSnapshot,
  MarketId,
  MarketStatus,
  OracleDemoScenario,
  Result,
  TimestampMs,
  VenueHealth,
  VenueWeightedTwapResolution,
} from '@jet/shared';
import { C, S } from '../theme.js';
import { formatUsdCents, formatBps } from '../format.js';
import Panel from './Panel.js';

interface Props {
  oracleSnapshot: IndicativeSnapshot | null;
  resolution: VenueWeightedTwapResolution | null;
  marketId: MarketId;
  marketStatus: MarketStatus;
  msRemaining: number;
  serverTs: TimestampMs | null;
  apiUrl: string;
}

const FINAL_WINDOW_MS = 15_000;

const DISPERSION_COLOR: Record<DispersionState, string> = {
  NORMAL: C.ok,
  ELEVATED: C.warn,
  STRESSED: '#f97316',
  DISLOCATED: C.bad,
};

type DemoState =
  | { status: 'idle'; scenario: OracleDemoScenario | null; attackCostEstimate: AttackCostEstimate | null; error: string | null }
  | { status: 'arming'; scenario: OracleDemoScenario | null; attackCostEstimate: AttackCostEstimate | null; error: string | null }
  | { status: 'armed'; scenario: OracleDemoScenario; attackCostEstimate: AttackCostEstimate | null; error: string | null };

export default function OraclePanel({
  oracleSnapshot,
  resolution,
  marketId,
  marketStatus,
  msRemaining,
  serverTs,
  apiUrl,
}: Props) {
  const [demo, setDemo] = useState<DemoState>({
    status: 'idle',
    scenario: null,
    attackCostEstimate: null,
    error: null,
  });

  useEffect(() => {
    setDemo({ status: 'idle', scenario: null, attackCostEstimate: null, error: null });
  }, [marketId]);

  async function armDemoScenario(scenario: OracleDemoScenario) {
    setDemo((prev) => ({ ...prev, status: 'arming', scenario, error: null }));
    try {
      const res = await fetch(`${apiUrl}/markets/${marketId}/oracle/demo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      const data = await res.json() as Result<DemoScenarioResponse>;
      if (!data.ok) {
        setDemo((prev) => ({ ...prev, status: 'idle', error: data.error.message }));
        return;
      }
      setDemo({
        status: 'armed',
        scenario: data.scenario,
        attackCostEstimate: data.attackCostEstimate ?? null,
        error: null,
      });
    } catch {
      setDemo((prev) => ({ ...prev, status: 'idle', error: 'Unable to arm demo scenario' }));
    }
  }

  const demoControl = (
    <DemoControl
      demo={demo}
      marketStatus={marketStatus}
      onArm={(scenario) => void armDemoScenario(scenario)}
    />
  );

  if (resolution) {
    return (
      <PostResolution
        resolution={resolution}
        demoControl={demoControl}
        attackCostEstimate={demo.attackCostEstimate}
      />
    );
  }
  if (oracleSnapshot) {
    return (
      <PreResolution
        snapshot={oracleSnapshot}
        msRemaining={msRemaining}
        serverTs={serverTs}
        demoControl={demoControl}
        attackCostEstimate={demo.attackCostEstimate}
      />
    );
  }
  return (
    <Panel title="Oracle · VENUE_WEIGHTED_TWAP_V1">
      <div style={topLineStyle}>
        {demoControl}
      </div>
      <div style={{ color: C.textMute, fontSize: 13, padding: `${S.sm}px 0` }}>
        Waiting for oracle...
      </div>
    </Panel>
  );
}

function PreResolution({
  snapshot,
  msRemaining,
  serverTs,
  demoControl,
  attackCostEstimate,
}: {
  snapshot: IndicativeSnapshot;
  msRemaining: number;
  serverTs: TimestampMs | null;
  demoControl: ReactNode;
  attackCostEstimate: AttackCostEstimate | null;
}) {
  const dispColor = DISPERSION_COLOR[snapshot.dispersionState];
  const forming = snapshot.formingResolution;
  const inFinalWindow = msRemaining <= FINAL_WINDOW_MS;

  return (
    <Panel title="Oracle · VENUE_WEIGHTED_TWAP_V1">
      <div style={topLineStyle}>
        <div>
          <div style={metaLabel}>METHOD</div>
          <Pill text="VENUE_WEIGHTED_TWAP_V1" color={C.accent} />
        </div>
        <div>
          <div style={metaLabel}>FINAL WINDOW</div>
          <div style={{ color: inFinalWindow ? C.warn : C.text, fontSize: 13, fontWeight: 700 }}>
            {formatWindowCountdown(msRemaining)}
          </div>
          {serverTs !== null && (
            <div style={{ color: C.textMute, fontSize: 10 }}>server {formatServerTs(serverTs)}</div>
          )}
        </div>
        {demoControl}
      </div>

      <div style={metricGridStyle}>
        <Metric
          label="LIVE INDICATIVE"
          value={formatUsdCents(snapshot.btcPriceCents)}
          note="not settlement"
        />
        <div>
          <div style={metaLabel}>DISPERSION</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: S.xs }}>
            <span style={{ fontSize: 14, color: C.text }}>{formatBps(snapshot.dispersionBps)}</span>
            <Pill text={snapshot.dispersionState} color={dispColor} />
          </div>
        </div>
        <div>
          <div style={metaLabel}>OUTPUT BAND</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: S.xs }}>
            <span style={{ fontSize: 14, color: C.text }}>±{formatBps(snapshot.confidenceBps)}</span>
            <Pill
              text={snapshot.confidence}
              color={snapshot.confidence === 'HIGH' ? C.ok : snapshot.confidence === 'MEDIUM' ? C.warn : C.bad}
            />
          </div>
        </div>
      </div>

      {forming && (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <div style={metaLabel}>FORMING RESOLUTION</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>
                {formatUsdCents(forming.formingPriceCents)}
              </div>
            </div>
            <Pill
              text={`${Math.min(100, Math.round((forming.elapsedMs / forming.window.windowMs) * 100))}% window`}
              color={forming.complete ? C.ok : C.warn}
            />
          </div>
          <VenueTwapRows venues={forming.venues} />
        </div>
      )}

      <div style={sectionStyle}>
        <div style={{ ...metaLabel, marginBottom: S.xs }}>VENUE HEALTH</div>
        <div style={venueHeaderStyle}>
          <span>venue</span>
          <span>quote</span>
          <span>mid</span>
          <span>spread</span>
          <span>state</span>
        </div>
        {snapshot.venues.map((v) => (
          <VenueRow key={v.venue} venue={v} />
        ))}
      </div>

      {attackCostEstimate && <AttackCost estimate={attackCostEstimate} />}
    </Panel>
  );
}

function PostResolution({
  resolution,
  demoControl,
  attackCostEstimate,
}: {
  resolution: VenueWeightedTwapResolution;
  demoControl: ReactNode;
  attackCostEstimate: AttackCostEstimate | null;
}) {
  const dispColor = DISPERSION_COLOR[resolution.dispersionState];

  return (
    <Panel title="Oracle · VENUE_WEIGHTED_TWAP_V1 · Settled">
      <div style={topLineStyle}>
        <div>
          <div style={metaLabel}>METHOD</div>
          <Pill text={`${resolution.method} ${resolution.ruleVersion}`} color={C.accent} />
        </div>
        <div>
          <div style={metaLabel}>REPLAYABLE HASH</div>
          <div style={hashStyle}>{resolution.inputHash}</div>
        </div>
        {demoControl}
      </div>

      <div style={metricGridStyle}>
        <Metric
          label="FINAL RESOLUTION PRICE"
          value={formatUsdCents(resolution.resolutionPriceCents)}
        />
        <div>
          <div style={metaLabel}>OUTCOME</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: resolution.outcome === 'YES' ? C.yes : C.no }}>
            {resolution.outcome}
          </div>
        </div>
        <div>
          <div style={metaLabel}>CONFIDENCE</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: S.xs }}>
            <span style={{ fontSize: 14, color: C.text }}>±{formatBps(resolution.confidenceBps)}</span>
            <Pill
              text={resolution.confidence}
              color={resolution.confidence === 'HIGH' ? C.ok : resolution.confidence === 'MEDIUM' ? C.warn : C.bad}
            />
          </div>
        </div>
        <div>
          <div style={metaLabel}>DISPERSION</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: S.xs, flexWrap: 'wrap' }}>
            <Pill text={resolution.dispersionState} color={dispColor} />
            {resolution.qualityFlags.map(flag => (
              <Pill key={flag} text={flag.replaceAll('_', ' ')} color={flag === 'NEAR_THRESHOLD' ? C.warn : C.bad} small />
            ))}
          </div>
        </div>
      </div>

      <div style={twoSectionGridStyle}>
        <div style={sectionStyle}>
          <div style={metaLabel}>SOURCES USED</div>
          <div style={{ fontSize: 12, color: C.text }}>
            {resolution.sourcesUsed.length > 0 ? resolution.sourcesUsed.join(', ') : '--'}
          </div>
        </div>
        <div style={sectionStyle}>
          <div style={metaLabel}>SOURCES EXCLUDED</div>
          {resolution.sourcesExcluded.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.xs }}>
              {resolution.sourcesExcluded.map((s) => (
                <div key={s.venue} style={excludedSourceStyle}>
                  <strong>{s.venue}</strong>
                  <Pill text={s.reason} color={s.reason === 'OUTLIER' ? C.bad : C.warn} small />
                  {s.deviationBps != null && <span>{formatBps(s.deviationBps)}</span>}
                </div>
              ))}
            </div>
          ) : (
            <span style={{ color: C.textMute, fontSize: 12 }}>--</span>
          )}
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ ...metaLabel, marginBottom: S.xs }}>VENUE TWAPS AND WEIGHTS</div>
        <VenueTwapRows venues={resolution.venueTwaps} />
      </div>

      <div style={sectionStyle}>
        <div style={metaLabel}>TIE RULE</div>
        <div style={{ color: C.text, fontSize: 12 }}>{resolution.tieRule}</div>
      </div>

      {attackCostEstimate && <AttackCost estimate={attackCostEstimate} />}
    </Panel>
  );
}

function DemoControl({
  demo,
  marketStatus,
  onArm,
}: {
  demo: DemoState;
  marketStatus: MarketStatus;
  onArm: (scenario: OracleDemoScenario) => void;
}) {
  const disabled = demo.status === 'arming' || marketStatus === 'resolved';
  return (
    <div style={{ marginLeft: 'auto', minWidth: 250 }}>
      <div style={{ display: 'flex', gap: S.xs, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <DemoButton
          label={buttonLabel(demo, 'NEAR_EXPIRY_SPIKE')}
          disabled={disabled}
          onClick={() => onArm('NEAR_EXPIRY_SPIKE')}
        />
        <DemoButton
          label={buttonLabel(demo, 'SUBTLE_DISLOCATION')}
          disabled={disabled}
          onClick={() => onArm('SUBTLE_DISLOCATION')}
        />
      </div>
      <div style={demoCopyStyle}>
        Injects a reproducible single-venue near-expiry manipulation into the simulated oracle feed.
      </div>
      {demo.status === 'armed' && (
        <div style={{ ...demoCopyStyle, color: C.warn, fontWeight: 700 }}>
          {demo.scenario === 'NEAR_EXPIRY_SPIKE' ? 'Spike' : 'Subtle dislocation'} armed. At resolution, the manipulated venue should be excluded or confidence lowered.
        </div>
      )}
      {demo.error && <div style={{ color: C.bad, fontSize: 11, marginTop: S.xs, textAlign: 'right' }}>{demo.error}</div>}
    </div>
  );
}

function DemoButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...demoButtonStyle,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function buttonLabel(demo: DemoState, scenario: OracleDemoScenario): string {
  const name = scenario === 'NEAR_EXPIRY_SPIKE' ? 'Spike' : 'Subtle';
  if (demo.status === 'arming' && demo.scenario === scenario) return `Arming ${name}...`;
  if (demo.status === 'armed' && demo.scenario === scenario) return `${name} Armed`;
  return `Arm ${name}`;
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div style={metaLabel}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{value}</div>
      {note && <div style={{ color: C.warn, fontSize: 11, fontWeight: 700 }}>{note}</div>}
    </div>
  );
}

function VenueRow({ venue }: { venue: VenueHealth }) {
  const stateColor = venue.healthy ? C.ok : C.bad;
  return (
    <div style={venueRowStyle}>
      <span style={{ color: C.text, fontWeight: 700 }}>{venue.venue}</span>
      <span style={{ color: C.textDim, fontSize: 11 }}>{venue.quote}</span>
      <span style={{ color: venue.healthy ? C.text : C.warn, fontVariantNumeric: 'tabular-nums' }}>
        {venue.midCents != null ? formatUsdCents(venue.midCents) : '--'}
      </span>
      <span style={{ color: C.textDim }}>{formatBps(venue.spreadBps)}</span>
      <Pill text={venue.healthy ? 'HEALTHY' : venue.excludedReason ?? 'EXCLUDED'} color={stateColor} small />
    </div>
  );
}

function VenueTwapRows({
  venues,
}: {
  venues: VenueWeightedTwapResolution['venueTwaps'];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {venues.map((v) => (
        <div key={v.venue} style={venueTwapRowStyle}>
          <span style={{ color: C.text, fontWeight: 700 }}>{v.venue}</span>
          <span style={{ color: C.text, fontWeight: 700 }}>
            {v.twapCents != null ? formatUsdCents(v.twapCents) : '--'}
          </span>
          <span style={{ color: C.textDim }}>{formatWeight(v.weight)}</span>
          <span style={{ color: C.textDim }}>{v.normalizedWeight != null ? formatWeight(v.normalizedWeight) : '--'}</span>
          <Pill
            text={v.included ? 'USED' : v.excludedReason ?? 'EXCLUDED'}
            color={v.included ? C.ok : v.excludedReason === 'OUTLIER' ? C.bad : C.warn}
            small
          />
          {v.deviationBps != null && <span style={{ color: C.warn }}>{formatBps(v.deviationBps)}</span>}
        </div>
      ))}
    </div>
  );
}

function AttackCost({ estimate }: { estimate: AttackCostEstimate }) {
  return (
    <div style={sectionStyle}>
      <div style={metaLabel}>ATTACK COST</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: S.lg, marginTop: S.xs }}>
        <span style={costStyle}>single venue {formatUsdCents(estimate.singleVenueCents)}</span>
        <span style={costStyle}>median basket {formatUsdCents(estimate.medianBasketCents)}</span>
      </div>
      <div style={{ color: C.textMute, fontSize: 11, marginTop: S.xs }}>
        illustrative, from simulated depth
      </div>
    </div>
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
        fontWeight: 800,
        letterSpacing: '0.06em',
        background: color + '22',
        color,
        border: `1px solid ${color}44`,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

function formatWindowCountdown(msRemaining: number): string {
  if (msRemaining > FINAL_WINDOW_MS) {
    return `opens in ${formatDuration(msRemaining - FINAL_WINDOW_MS)}`;
  }
  if (msRemaining > 0) {
    return `closes in ${formatDuration(msRemaining)}`;
  }
  return 'closed';
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatServerTs(ts: TimestampMs): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

function formatWeight(weight: number): string {
  return `${Math.round(weight * 100)}%`;
}

const metaLabel: CSSProperties = {
  fontSize: 10,
  color: C.textMute,
  letterSpacing: '0.1em',
  fontWeight: 800,
  textTransform: 'uppercase',
  marginBottom: 3,
};

const topLineStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  gap: S.lg,
  marginBottom: S.md,
};

const metricGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: S.lg,
  marginBottom: S.md,
};

const twoSectionGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: S.md,
  marginBottom: S.md,
};

const sectionStyle: CSSProperties = {
  borderTop: `1px solid ${C.border}`,
  paddingTop: S.sm,
  marginTop: S.sm,
};

const sectionHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: S.md,
  marginBottom: S.sm,
};

const venueHeaderStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(72px, 1fr) 44px minmax(110px, 1.2fr) 72px minmax(92px, auto)',
  gap: S.sm,
  color: C.textMute,
  fontSize: 10,
  fontWeight: 800,
  textTransform: 'uppercase',
  paddingBottom: S.xs,
};

const venueRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(72px, 1fr) 44px minmax(110px, 1.2fr) 72px minmax(92px, auto)',
  gap: S.sm,
  alignItems: 'center',
  fontSize: 12,
  padding: '4px 0',
  borderBottom: `1px solid ${C.border}55`,
};

const venueTwapRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(72px, 1fr) minmax(116px, 1.2fr) 56px 56px minmax(88px, auto) 56px',
  gap: S.sm,
  alignItems: 'center',
  fontSize: 12,
  padding: '4px 0',
  borderBottom: `1px solid ${C.border}44`,
};

const excludedSourceStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: S.xs,
  color: C.text,
  fontSize: 12,
  background: C.bad + '12',
  border: `1px solid ${C.bad}33`,
  borderRadius: 4,
  padding: '5px 6px',
};

const demoCopyStyle: CSSProperties = {
  color: C.textMute,
  fontSize: 11,
  lineHeight: 1.35,
  marginTop: S.xs,
  textAlign: 'right',
};

const demoButtonStyle: CSSProperties = {
  background: C.accent,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '0.55rem 0.8rem',
  fontSize: 12,
  fontFamily: 'inherit',
  fontWeight: 800,
};

const hashStyle: CSSProperties = {
  color: C.textDim,
  fontFamily: 'monospace',
  fontSize: 10,
  overflowWrap: 'anywhere',
  maxWidth: 340,
};

const costStyle: CSSProperties = {
  color: C.text,
  fontSize: 12,
  fontWeight: 700,
};
