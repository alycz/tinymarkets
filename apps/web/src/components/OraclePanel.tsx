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
const ORACLE_METHOD_LABEL = 'Venue-Weighted 15s TWAP';
const PANEL_TITLE = `Oracle · ${ORACLE_METHOD_LABEL}`;
const PANEL_TITLE_SETTLED = `${PANEL_TITLE} · Settled`;

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
        marketStatus={marketStatus}
        msRemaining={msRemaining}
        serverTs={serverTs}
        demoControl={demoControl}
        attackCostEstimate={demo.attackCostEstimate}
      />
    );
  }
  return (
    <Panel title={PANEL_TITLE}>
      <div style={topLineStyle}>
        {demoControl}
      </div>
      <div style={{ color: C.textMute, fontSize: 13, padding: `${S.sm}px 0` }}>
        Waiting For Oracle...
      </div>
    </Panel>
  );
}

function PreResolution({
  snapshot,
  marketStatus,
  msRemaining,
  serverTs,
  demoControl,
  attackCostEstimate,
}: {
  snapshot: IndicativeSnapshot;
  marketStatus: MarketStatus;
  msRemaining: number;
  serverTs: TimestampMs | null;
  demoControl: ReactNode;
  attackCostEstimate: AttackCostEstimate | null;
}) {
  const dispColor = DISPERSION_COLOR[snapshot.dispersionState];
  const forming = snapshot.formingResolution;
  const inFinalWindow = msRemaining <= FINAL_WINDOW_MS;

  return (
    <Panel title={PANEL_TITLE}>
      <div style={topLineStyle}>
        <div>
          <div style={metaLabel}>Oracle Method</div>
          <Pill text={ORACLE_METHOD_LABEL} color={C.accent} />
        </div>
        <div>
          <div style={metaLabel}>Settlement Window</div>
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
          label="Live Oracle Estimate"
          value={formatUsdCents(snapshot.btcPriceCents)}
          note="Indicative Only — Final Result Uses 15s TWAP"
        />
        <div>
          <div style={metaLabel}>Venue Disagreement</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: S.xs }}>
            <span style={{ fontSize: 14, color: C.text }}>{formatBps(snapshot.dispersionBps)}</span>
            <Pill text={prettyEnum(snapshot.dispersionState)} color={dispColor} />
          </div>
        </div>
        <div>
          <div style={metaLabel}>Confidence Band</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: S.xs }}>
            <span style={{ fontSize: 14, color: C.text }}>±{formatBps(snapshot.confidenceBps)}</span>
            <Pill
              text={prettyEnum(snapshot.confidence)}
              color={snapshot.confidence === 'HIGH' ? C.ok : snapshot.confidence === 'MEDIUM' ? C.warn : C.bad}
            />
          </div>
        </div>
      </div>

      {forming && (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <div style={metaLabel}>Current Final-Window TWAP</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>
                {formatUsdCents(forming.formingPriceCents)}
              </div>
            </div>
            <FormingWindowStatus
              forming={forming}
              marketStatus={marketStatus}
              msRemaining={msRemaining}
            />
          </div>
          <WeightHelper />
          <VenueTwapHeader />
          <VenueTwapRows venues={forming.venues} />
        </div>
      )}

      <div style={sectionStyle}>
        <div style={{ ...metaLabel, marginBottom: S.xs }}>Venue Health</div>
        <div style={venueHeaderStyle}>
          <span>Venue</span>
          <span>Pair</span>
          <span>Latest Midpoint</span>
          <span>Bid/Ask Spread</span>
          <span>Feed Status</span>
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
    <Panel title={PANEL_TITLE_SETTLED}>
      <div style={topLineStyle}>
        <div>
          <div style={metaLabel}>Oracle Method</div>
          <Pill text={`${ORACLE_METHOD_LABEL} · ${resolution.ruleVersion}`} color={C.accent} />
        </div>
        <div>
          <div style={metaLabel}>Replayable Hash</div>
          <div style={hashStyle}>{resolution.inputHash}</div>
        </div>
        {demoControl}
      </div>

      <div style={metricGridStyle}>
        <Metric
          label="Final Resolution Price"
          value={formatUsdCents(resolution.resolutionPriceCents)}
        />
        <div>
          <div style={metaLabel}>Outcome</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: resolution.outcome === 'YES' ? C.yes : C.no }}>
            {resolution.outcome === 'YES' ? 'Above' : 'Below'}
          </div>
        </div>
        <div>
          <div style={metaLabel}>Confidence Band</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: S.xs }}>
            <span style={{ fontSize: 14, color: C.text }}>±{formatBps(resolution.confidenceBps)}</span>
            <Pill
              text={prettyEnum(resolution.confidence)}
              color={resolution.confidence === 'HIGH' ? C.ok : resolution.confidence === 'MEDIUM' ? C.warn : C.bad}
            />
          </div>
        </div>
        <div>
          <div style={metaLabel}>Venue Disagreement</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: S.xs, flexWrap: 'wrap' }}>
            <Pill text={prettyEnum(resolution.dispersionState)} color={dispColor} />
            {resolution.qualityFlags.map(flag => (
              <Pill key={flag} text={prettyEnum(flag)} color={flag === 'NEAR_THRESHOLD' ? C.warn : C.bad} small />
            ))}
          </div>
        </div>
      </div>

      <div style={twoSectionGridStyle}>
        <div style={sectionStyle}>
          <div style={metaLabel}>Sources Used</div>
          <div style={{ fontSize: 12, color: C.text }}>
            {resolution.sourcesUsed.length > 0 ? resolution.sourcesUsed.join(', ') : '--'}
          </div>
        </div>
        <div style={sectionStyle}>
          <div style={metaLabel}>Sources Excluded</div>
          {resolution.sourcesExcluded.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.xs }}>
              {resolution.sourcesExcluded.map((s) => (
                <div key={s.venue} style={excludedSourceStyle}>
                  <strong>{s.venue}</strong>
                  <Pill text={prettyEnum(s.reason)} color={s.reason === 'OUTLIER' ? C.bad : C.warn} small />
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
        <div style={{ ...metaLabel, marginBottom: S.xs }}>Venue TWAPs And Weights</div>
        <WeightHelper />
        <VenueTwapHeader />
        <VenueTwapRows venues={resolution.venueTwaps} />
      </div>

      <div style={sectionStyle}>
        <div style={metaLabel}>Exact Strike Rule</div>
        <div style={{ color: C.text, fontSize: 12 }}>Exact Tie = Below Wins</div>
        <div style={{ color: C.textMute, fontSize: 11, marginTop: S.xs, lineHeight: 1.4 }}>
          Above Wins Only If The Final Oracle Price Is Higher Than The Strike.
        </div>
      </div>

      {attackCostEstimate && <AttackCost estimate={attackCostEstimate} />}
    </Panel>
  );
}

function FormingWindowStatus({
  forming,
  marketStatus,
  msRemaining,
}: {
  forming: NonNullable<IndicativeSnapshot['formingResolution']>;
  marketStatus: MarketStatus;
  msRemaining: number;
}) {
  const pctRaw = Math.round((forming.elapsedMs / forming.window.windowMs) * 100);
  const pct = Math.max(0, Math.min(100, pctRaw));
  if (marketStatus === 'resolving' || msRemaining <= 0) {
    return (
      <span style={{ color: C.textDim, fontSize: 12, fontStyle: 'italic' }}>
        Settlement Window Closed — Calculating Final Result
      </span>
    );
  }
  if (msRemaining > FINAL_WINDOW_MS) return null;
  return (
    <Pill
      text={`${pct}% Of Settlement Window Collected`}
      color={forming.complete ? C.ok : C.warn}
    />
  );
}

function WeightHelper() {
  return (
    <div style={{ color: C.textMute, fontSize: 11, marginBottom: S.xs, lineHeight: 1.4 }}>
      Config Weight = The Static Weight Set Per Venue. Active Weight = The Same Weight Renormalized
      After Unhealthy Or Outlier Venues Are Excluded.
    </div>
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
    <div style={{ marginLeft: 'auto', minWidth: 260 }}>
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
        <strong style={{ color: C.text }}>Spike:</strong> Injects A Large One-Venue Price Spike
        Near Expiry. The Oracle Should Exclude It As An Outlier.
      </div>
      <div style={demoCopyStyle}>
        <strong style={{ color: C.text }}>Subtle:</strong> Injects A Smaller One-Venue Dislocation
        During The Final Window. The Oracle Should Lower Confidence Or Exclude It If Thresholds Are
        Crossed.
      </div>
      {demo.status === 'armed' && (
        <div style={{ ...demoCopyStyle, color: C.warn, fontWeight: 700 }}>
          {demo.scenario === 'NEAR_EXPIRY_SPIKE'
            ? 'Spike Armed — Binance Will Spike Near Expiry.'
            : 'Subtle Dislocation Armed — Binance Will Drift During The Final Window.'}
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
      <Pill
        text={venue.healthy ? 'Feed Healthy' : prettyEnum(venue.excludedReason ?? 'Excluded')}
        color={stateColor}
        small
      />
    </div>
  );
}

function VenueTwapHeader() {
  return (
    <div style={venueTwapHeaderStyle}>
      <span>Venue</span>
      <span>Final-Window TWAP</span>
      <span>Config Weight</span>
      <span>Active Weight</span>
      <span>Status</span>
      <span>Deviation</span>
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
            text={v.included ? 'Used In Settlement' : prettyEnum(v.excludedReason ?? 'Excluded')}
            color={v.included ? C.ok : v.excludedReason === 'OUTLIER' ? C.bad : C.warn}
            small
          />
          <span style={{ color: v.deviationBps != null ? C.warn : C.textMute }}>
            {v.deviationBps != null ? formatBps(v.deviationBps) : '--'}
          </span>
        </div>
      ))}
    </div>
  );
}

function AttackCost({ estimate }: { estimate: AttackCostEstimate }) {
  return (
    <div style={sectionStyle}>
      <div style={metaLabel}>Attack Cost</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: S.lg, marginTop: S.xs }}>
        <span style={costStyle}>Single Venue {formatUsdCents(estimate.singleVenueCents)}</span>
        <span style={costStyle}>Median Basket {formatUsdCents(estimate.medianBasketCents)}</span>
      </div>
      <div style={{ color: C.textMute, fontSize: 11, marginTop: S.xs }}>
        Illustrative, From Simulated Depth
      </div>
    </div>
  );
}

function Pill({ text, color, small }: { text: string; color: string; small?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: small ? '1px 6px' : '3px 9px',
        borderRadius: 0,
        fontSize: small ? 10 : 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
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

function prettyEnum(s: string): string {
  return s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

const metaLabel: CSSProperties = {
  fontSize: 11,
  color: C.textMute,
  letterSpacing: '0.02em',
  fontWeight: 700,
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
  gridTemplateColumns: 'minmax(82px, 1fr) 56px minmax(120px, 1.2fr) minmax(96px, 1fr) minmax(120px, auto)',
  gap: S.sm,
  color: C.textMute,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.02em',
  paddingBottom: S.xs,
};

const venueRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(82px, 1fr) 56px minmax(120px, 1.2fr) minmax(96px, 1fr) minmax(120px, auto)',
  gap: S.sm,
  alignItems: 'center',
  fontSize: 12,
  padding: '4px 0',
  borderBottom: `1px solid ${C.border}55`,
};

const venueTwapRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(72px, 0.9fr) minmax(120px, 1.2fr) minmax(80px, 0.8fr) minmax(80px, 0.8fr) minmax(140px, auto) minmax(64px, 0.7fr)',
  gap: S.sm,
  alignItems: 'center',
  fontSize: 12,
  padding: '4px 0',
  borderBottom: `1px solid ${C.border}44`,
};

const venueTwapHeaderStyle: CSSProperties = {
  ...venueTwapRowStyle,
  color: C.textMute,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.04em',
  borderBottom: `1px solid ${C.border}`,
  marginBottom: 2,
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
  borderRadius: 0,
  padding: '5px 8px',
};

const demoCopyStyle: CSSProperties = {
  color: C.textMute,
  fontSize: 11,
  lineHeight: 1.4,
  marginTop: S.xs,
  textAlign: 'right',
};

const demoButtonStyle: CSSProperties = {
  background: C.accent,
  color: '#ffffff',
  border: 'none',
  borderRadius: 0,
  padding: '0.6rem 0.9rem',
  fontSize: 12,
  fontFamily: 'inherit',
  fontWeight: 700,
  letterSpacing: '0.02em',
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
