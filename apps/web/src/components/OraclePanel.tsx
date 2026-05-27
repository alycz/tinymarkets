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
  Side,
  TimestampMs,
  UsdCents,
  VenueHealth,
  VenueWeightedTwapResolution,
} from '@jet/shared';
import { C, S, T, mono } from '../theme.js';
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
const PANEL_TITLE = 'Oracle Audit Console';
const PANEL_TITLE_SETTLED = `${PANEL_TITLE} · Settled`;

const METHOD_PIPELINE_STEPS = [
  'Multi-Venue Quotes',
  'Mid-Price TWAP',
  'Health Filters',
  'Weight Renormalization',
  'Strict Strike Rule',
];

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
      <Panel title={PANEL_TITLE_SETTLED}>
        <PostResolution
          resolution={resolution}
          attackCostEstimate={demo.attackCostEstimate}
        />
        <ManipulationDemoControls>{demoControl}</ManipulationDemoControls>
      </Panel>
    );
  }
  if (oracleSnapshot) {
    return (
      <Panel title={PANEL_TITLE}>
        <PreResolution
          snapshot={oracleSnapshot}
          marketStatus={marketStatus}
          msRemaining={msRemaining}
          serverTs={serverTs}
          attackCostEstimate={demo.attackCostEstimate}
        />
        <ManipulationDemoControls>{demoControl}</ManipulationDemoControls>
      </Panel>
    );
  }
  return (
    <Panel title={PANEL_TITLE}>
      <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, marginBottom: S.md, flexWrap: 'wrap' }}>
        <Pill text="Oracle Forming" color={C.accent} />
        <span style={{ color: C.textMute, fontSize: 12 }}>
          Awaiting first venue snapshot.
        </span>
      </div>
      <MethodPipeline />
      <div style={{ color: C.textMute, fontSize: 13, padding: `${S.sm}px 0` }}>
        Waiting For Oracle...
      </div>
      <ManipulationDemoControls>{demoControl}</ManipulationDemoControls>
    </Panel>
  );
}

function PreResolution({
  snapshot,
  marketStatus,
  msRemaining,
  serverTs,
  attackCostEstimate,
}: {
  snapshot: IndicativeSnapshot;
  marketStatus: MarketStatus;
  msRemaining: number;
  serverTs: TimestampMs | null;
  attackCostEstimate: AttackCostEstimate | null;
}) {
  const forming = snapshot.formingResolution;
  const inFinalWindow = msRemaining <= FINAL_WINDOW_MS;

  return (
    <>
      <div style={statusRowStyle}>
        <Pill text="Oracle Forming" color={C.accent} />
        <div>
          <span style={metaInlineLabel}>Settlement Window</span>
          <span
            style={{
              ...T.numXs,
              color: inFinalWindow ? C.warn : C.text,
              fontWeight: 700,
              marginLeft: S.xs,
            }}
          >
            {formatWindowCountdown(msRemaining)}
          </span>
          {serverTs !== null && (
            <span style={{ color: C.textMute, fontSize: 10, marginLeft: S.xs }}>
              server {formatServerTs(serverTs)}
            </span>
          )}
        </div>
      </div>

      <AuditSummaryCards snapshot={snapshot} resolution={null} />
      <MethodPipeline />

      {forming && (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <div style={metaLabel}>Current Final-Window TWAP</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: mono, fontVariantNumeric: 'tabular-nums' }}>
                {formatUsdCents(forming.formingPriceCents)}
              </div>
            </div>
            <FormingWindowStatus
              forming={forming}
              marketStatus={marketStatus}
              msRemaining={msRemaining}
            />
          </div>
          <VenueAuditTable rows={forming.venues} />
          <VenueAuditHelpers />
        </div>
      )}

      <div style={sectionStyle}>
        <div style={{ ...metaLabel, marginBottom: S.xs }}>Venue Health</div>
        <div style={venueScrollStyle}>
          <div style={venueHealthGridStyle}>
            <div style={venueHealthHeaderStyle}>
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
        </div>
      </div>

      {attackCostEstimate && <AttackCost estimate={attackCostEstimate} />}
    </>
  );
}

function PostResolution({
  resolution,
  attackCostEstimate,
}: {
  resolution: VenueWeightedTwapResolution;
  attackCostEstimate: AttackCostEstimate | null;
}) {
  return (
    <>
      <div style={statusRowStyle}>
        <Pill text="Settled · Audited" color={C.ok} />
        <span style={{ color: C.textMute, fontSize: 11, fontFamily: mono }}>
          {ORACLE_METHOD_LABEL} · Rule {resolution.ruleVersion}
        </span>
      </div>

      <AuditSummaryCards snapshot={null} resolution={resolution} />
      <MethodPipeline />

      <div style={twoSectionGridStyle}>
        <div style={sectionStyle}>
          <div style={metaLabel}>Sources Used</div>
          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>
            {resolution.sourcesUsed.length > 0
              ? resolution.sourcesUsed.map(formatVenueName).join(', ')
              : '--'}
          </div>
        </div>
        <div style={sectionStyle}>
          <div style={metaLabel}>Sources Excluded</div>
          {resolution.sourcesExcluded.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.xs }}>
              {resolution.sourcesExcluded.map((s) => (
                <div key={s.venue} style={excludedSourceStyle}>
                  <strong>{formatVenueName(s.venue)}</strong>
                  <Pill
                    text={s.reason}
                    color={s.reason === 'OUTLIER' ? C.bad : C.warn}
                    small
                  />
                  {s.deviationBps != null && (
                    <span style={{ fontFamily: mono, fontVariantNumeric: 'tabular-nums' }}>
                      {formatBps(s.deviationBps)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <span style={{ color: C.textDim, fontSize: 12, lineHeight: 1.4 }}>
              None — all eligible venues passed health checks.
            </span>
          )}
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ ...metaLabel, marginBottom: S.xs }}>Venue TWAPs &amp; Weights</div>
        <VenueAuditTable rows={resolution.venueTwaps} />
        <VenueAuditHelpers />
      </div>

      <StrikeRuleBox
        thresholdCents={resolution.thresholdCents}
        resolutionPriceCents={resolution.resolutionPriceCents}
        outcome={resolution.outcome}
      />

      {attackCostEstimate && <AttackCost estimate={attackCostEstimate} />}
    </>
  );
}

function AuditSummaryCards({
  snapshot,
  resolution,
}: {
  snapshot: IndicativeSnapshot | null;
  resolution: VenueWeightedTwapResolution | null;
}) {
  const isResolved = resolution !== null;
  const priceCents = resolution?.resolutionPriceCents ?? snapshot?.btcPriceCents ?? null;
  const dispersionState =
    resolution?.dispersionState ?? snapshot?.dispersionState ?? null;
  const confidence = resolution?.confidence ?? snapshot?.confidence ?? null;
  const confidenceBps =
    resolution?.confidenceBps ?? snapshot?.confidenceBps ?? null;
  const dispColor = dispersionState ? DISPERSION_COLOR[dispersionState] : C.textMute;
  const confidenceColor =
    confidence === 'HIGH' ? C.ok : confidence === 'MEDIUM' ? C.warn : confidence === 'LOW' ? C.bad : C.textMute;

  const outcomeColor = resolution
    ? resolution.outcome === 'YES' ? C.yes : C.no
    : C.textMute;
  const outcomeTint = resolution
    ? resolution.outcome === 'YES' ? C.yesSoft : C.noSoft
    : 'transparent';

  return (
    <div style={cardsGridStyle}>
      <div style={cardStyle}>
        <div style={metaLabel}>{isResolved ? 'Final Oracle Price' : 'Live Oracle Estimate'}</div>
        <div style={{ ...T.numLg, color: C.text }}>
          {priceCents != null ? formatUsdCents(priceCents) : 'Pending'}
        </div>
        {!isResolved && (
          <div style={subNoteStyle}>Indicative · Final result uses 15s TWAP</div>
        )}
      </div>

      <div
        style={{
          ...cardStyle,
          background: outcomeTint,
          borderColor: resolution ? outcomeColor + '66' : C.border,
          borderWidth: 2,
        }}
      >
        <div style={metaLabel}>Outcome</div>
        {resolution ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, color: outcomeColor, letterSpacing: '0.02em' }}>
              {resolution.outcome === 'YES' ? 'Above · YES' : 'Below · NO'}
            </div>
            <div style={{ ...subNoteStyle, color: C.textDim }}>
              {resolution.outcome === 'YES' ? 'Final price strictly above strike' : 'Final price at or below strike'}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 16, fontWeight: 700, color: C.textMute }}>Pending</div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={metaLabel}>Method · Rule</div>
        <div style={{ ...T.numSm, color: C.text }}>VENUE_WEIGHTED_TWAP_V1</div>
        <div style={subNoteStyle}>
          {resolution ? `Rule ${resolution.ruleVersion}` : 'Rule V1'} · Mid-price TWAP · Weighted mean
        </div>
      </div>

      <div style={cardStyle}>
        <div style={metaLabel}>Confidence</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: S.xs, flexWrap: 'wrap' }}>
          <span style={{ ...T.numMd, color: confidenceColor }}>
            {confidence ?? '—'}
          </span>
          <span style={{ color: C.textDim, fontSize: 12, fontFamily: mono, fontVariantNumeric: 'tabular-nums' }}>
            ±{confidenceBps != null ? formatBps(confidenceBps) : '--'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: S.xs, marginTop: S.xs, flexWrap: 'wrap' }}>
          {dispersionState && (
            <Pill text={`Disp · ${prettyEnum(dispersionState)}`} color={dispColor} small />
          )}
          {resolution?.qualityFlags.map((flag) => (
            <Pill
              key={flag}
              text={prettyEnum(flag)}
              color={flag === 'NEAR_THRESHOLD' ? C.warn : C.bad}
              small
            />
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, minWidth: 220 }}>
        <div style={metaLabel}>Replay Hash</div>
        {resolution ? (
          <>
            <div style={hashTruncStyle} title={resolution.inputHash}>
              {truncateHash(resolution.inputHash)}
            </div>
            <div style={{ display: 'flex', gap: S.xs, marginTop: S.xs, flexWrap: 'wrap' }}>
              <CopyButton value={resolution.inputHash} label="Copy Hash" />
              <CopyButton
                value={JSON.stringify(resolution, null, 2)}
                label="Copy JSON"
              />
            </div>
          </>
        ) : (
          <div style={{ color: C.textMute, fontSize: 12, lineHeight: 1.4 }}>
            Pending — finalized at settlement.
          </div>
        )}
      </div>
    </div>
  );
}

function MethodPipeline() {
  return (
    <div style={pipelineWrapStyle}>
      <div style={{ ...metaLabel, marginBottom: S.xs }}>Methodology</div>
      <div style={pipelineRowStyle}>
        {METHOD_PIPELINE_STEPS.map((step, idx) => (
          <span key={step} style={{ display: 'inline-flex', alignItems: 'center', gap: S.xs }}>
            <span style={pipelineChipStyle}>{step}</span>
            {idx < METHOD_PIPELINE_STEPS.length - 1 && (
              <span style={pipelineArrowStyle} aria-hidden>→</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function StrikeRuleBox({
  thresholdCents,
  resolutionPriceCents,
  outcome,
}: {
  thresholdCents: UsdCents;
  resolutionPriceCents?: UsdCents;
  outcome?: Side;
}) {
  const cmpOperator =
    resolutionPriceCents == null
      ? null
      : (resolutionPriceCents as number) > (thresholdCents as number)
        ? '>'
        : (resolutionPriceCents as number) === (thresholdCents as number)
          ? '='
          : '<';
  const operatorColor = outcome === 'YES' ? C.yes : C.no;

  return (
    <div style={strikeRuleBoxStyle}>
      <div style={{ ...metaLabel, color: C.warn, marginBottom: S.xs }}>Exact Strike Rule</div>
      <div style={{ color: C.text, fontSize: 13, lineHeight: 1.5 }}>
        <strong>Above / YES</strong> wins only if the final oracle price is{' '}
        <strong>strictly greater</strong> than the strike. If the final price equals the strike,{' '}
        <strong>Below / NO</strong> wins.
      </div>
      {resolutionPriceCents != null && cmpOperator && (
        <div style={strikeCompareStyle}>
          <span style={{ ...T.numMd, color: C.text }}>{formatUsdCents(resolutionPriceCents)}</span>
          <span style={{ ...T.numMd, color: operatorColor, fontSize: 18 }}>{cmpOperator}</span>
          <span style={{ ...T.numMd, color: C.text }}>{formatUsdCents(thresholdCents)}</span>
          <span style={{ color: C.textDim, fontSize: 11 }}>
            (final price vs strike)
          </span>
        </div>
      )}
    </div>
  );
}

function VenueAuditTable({
  rows,
}: {
  rows: VenueWeightedTwapResolution['venueTwaps'];
}) {
  return (
    <div style={venueScrollStyle}>
      <div style={venueAuditGridStyle}>
        <div style={venueAuditHeaderStyle}>
          <span>Venue</span>
          <span>Final-Window TWAP</span>
          <span>Config Weight</span>
          <span>Active Weight</span>
          <span>Status</span>
          <span>Exclusion Reason</span>
          <span>Deviation</span>
        </div>
        {rows.map((v) => (
          <div key={v.venue} style={venueAuditRowStyle}>
            <span style={{ color: C.text, fontWeight: 700 }}>{formatVenueName(v.venue)}</span>
            <span style={{ ...T.numXs, color: C.text, fontWeight: 700 }}>
              {v.twapCents != null ? formatUsdCents(v.twapCents) : '--'}
            </span>
            <span style={{ ...T.numXs, color: C.textDim }}>{formatWeight(v.weight)}</span>
            <span style={{ ...T.numXs, color: C.textDim }}>
              {v.normalizedWeight != null ? formatWeight(v.normalizedWeight) : '--'}
            </span>
            <Pill
              text={v.included ? 'Used' : 'Excluded'}
              color={v.included ? C.ok : C.warn}
              small
            />
            <span style={{ color: v.included ? C.textMute : C.text, fontSize: 11, fontFamily: mono }}>
              {v.included ? '—' : (v.excludedReason ?? 'EXCLUDED')}
            </span>
            <span
              style={{
                ...T.numXs,
                color: v.deviationBps != null ? C.warn : C.textMute,
              }}
            >
              {v.deviationBps != null ? formatBps(v.deviationBps) : '--'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VenueAuditHelpers() {
  return (
    <div style={{ marginTop: S.xs, color: C.textMute, fontSize: 11, lineHeight: 1.5 }}>
      <div>· Config weight is the static venue weight.</div>
      <div>
        · Active weight is renormalized after stale, missing, wide-spread, crossed-book, or outlier
        venues are removed.
      </div>
      <div>· The final price is computed from included venue TWAPs only.</div>
    </div>
  );
}

function ManipulationDemoControls({ children }: { children: ReactNode }) {
  return (
    <div style={demoSectionStyle}>
      <div style={demoSectionHeaderStyle}>
        <div style={{ ...metaLabel, color: C.textDim, margin: 0 }}>Manipulation Demo Controls</div>
        <span style={{ color: C.textMute, fontSize: 10 }}>For reviewers · arms a one-venue attack near expiry</span>
      </div>
      {children}
    </div>
  );
}

function CopyButton({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const [errored, setErrored] = useState(false);

  async function handleCopy() {
    setErrored(false);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        throw new Error('clipboard unavailable');
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setErrored(true);
      window.setTimeout(() => setErrored(false), 2000);
    }
  }

  const text = errored ? 'Copy failed' : copied ? 'Copied' : label;
  const color = errored ? C.bad : copied ? C.ok : C.textDim;

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      title={errored ? 'Clipboard unavailable' : label}
      style={{
        background: C.panelAlt,
        color,
        border: `1px solid ${C.border}`,
        borderRadius: 0,
        padding: '3px 8px',
        fontSize: 11,
        fontFamily: mono,
        fontWeight: 700,
        letterSpacing: '0.02em',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </button>
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
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', gap: S.xs, flexWrap: 'wrap' }}>
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
        <strong style={{ color: C.text }}>Spike:</strong> Injects a large one-venue price spike near
        expiry. The oracle should exclude it as an outlier.
      </div>
      <div style={demoCopyStyle}>
        <strong style={{ color: C.text }}>Subtle:</strong> Injects a smaller one-venue dislocation
        during the final window. The oracle should lower confidence or exclude it if thresholds are
        crossed.
      </div>
      {demo.status === 'armed' && (
        <div style={{ ...demoCopyStyle, color: C.warn, fontWeight: 700 }}>
          {demo.scenario === 'NEAR_EXPIRY_SPIKE'
            ? 'Spike armed — Binance will spike near expiry.'
            : 'Subtle dislocation armed — Binance will drift during the final window.'}
        </div>
      )}
      {demo.error && (
        <div style={{ color: C.bad, fontSize: 11, marginTop: S.xs }}>{demo.error}</div>
      )}
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

function VenueRow({ venue }: { venue: VenueHealth }) {
  const stateColor = venue.healthy ? C.ok : C.bad;
  return (
    <div style={venueHealthRowStyle}>
      <span style={{ color: C.text, fontWeight: 700 }}>{formatVenueName(venue.venue)}</span>
      <span style={{ color: C.textDim, fontSize: 11 }}>{venue.quote}</span>
      <span style={{ ...T.numXs, color: venue.healthy ? C.text : C.warn }}>
        {venue.midCents != null ? formatUsdCents(venue.midCents) : '--'}
      </span>
      <span style={{ ...T.numXs, color: C.textDim }}>{formatBps(venue.spreadBps)}</span>
      <Pill
        text={venue.healthy ? 'Feed Healthy' : (venue.excludedReason ?? 'Excluded')}
        color={stateColor}
        small
      />
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
        Illustrative, from simulated depth.
      </div>
    </div>
  );
}

function Pill({ text, color, small }: { text: string; color: string; small?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 'fit-content',
        justifySelf: 'start',
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
  return 'Closed';
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

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function formatVenueName(venue: string): string {
  const known: Record<string, string> = {
    binance: 'Binance',
    bitstamp: 'Bitstamp',
    coinbase: 'Coinbase',
    gemini: 'Gemini',
    itbit: 'itBit',
    kraken: 'Kraken',
    lmax: 'LMAX',
    okx: 'OKX',
  };
  const normalized = venue.trim().toLowerCase();
  return known[normalized] ?? venue
    .split(/([\s-]+)/)
    .map((part) => (/^[\s-]+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join('');
}

const metaLabel: CSSProperties = {
  fontSize: 11,
  color: C.textMute,
  letterSpacing: '0.02em',
  fontWeight: 700,
  marginBottom: 3,
};

const metaInlineLabel: CSSProperties = {
  fontSize: 11,
  color: C.textMute,
  letterSpacing: '0.02em',
  fontWeight: 700,
};

const subNoteStyle: CSSProperties = {
  color: C.textMute,
  fontSize: 10,
  marginTop: 2,
  lineHeight: 1.3,
};

const statusRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: S.sm,
  marginBottom: S.sm,
};

const cardsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  gap: S.sm,
  marginBottom: S.md,
};

const cardStyle: CSSProperties = {
  background: C.panelSoft,
  border: `1px solid ${C.border}`,
  borderRadius: 0,
  padding: S.sm,
  minWidth: 0,
};

const pipelineWrapStyle: CSSProperties = {
  marginBottom: S.md,
  paddingBottom: S.sm,
  borderBottom: `1px solid ${C.border}`,
};

const pipelineRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: S.xs,
  rowGap: S.xs,
};

const pipelineChipStyle: CSSProperties = {
  display: 'inline-block',
  background: C.panelAlt,
  border: `1px solid ${C.border}`,
  borderRadius: 0,
  padding: '3px 8px',
  fontSize: 11,
  fontWeight: 700,
  color: C.textDim,
  fontFamily: mono,
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
};

const pipelineArrowStyle: CSSProperties = {
  color: C.textMute,
  fontSize: 12,
  fontWeight: 700,
};

const strikeRuleBoxStyle: CSSProperties = {
  marginTop: S.md,
  padding: S.sm,
  background: C.warn + '14',
  border: `1px solid ${C.warn}44`,
  borderLeft: `3px solid ${C.warn}`,
  borderRadius: 0,
};

const strikeCompareStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: S.sm,
  marginTop: S.sm,
  paddingTop: S.xs,
  borderTop: `1px solid ${C.warn}22`,
  flexWrap: 'wrap',
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

const venueScrollStyle: CSSProperties = {
  overflowX: 'auto',
};

const venueHealthGridStyle: CSSProperties = {
  minWidth: 520,
};

const venueHealthHeaderStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(82px, 1fr) 56px minmax(120px, 1.2fr) minmax(96px, 1fr) minmax(120px, auto)',
  gap: S.sm,
  color: C.textMute,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.02em',
  paddingBottom: S.xs,
};

const venueHealthRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(82px, 1fr) 56px minmax(120px, 1.2fr) minmax(96px, 1fr) minmax(120px, auto)',
  gap: S.sm,
  alignItems: 'center',
  fontSize: 12,
  padding: '4px 0',
  borderBottom: `1px solid ${C.border}55`,
};

const venueAuditGridStyle: CSSProperties = {
  minWidth: 640,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const venueAuditRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns:
    'minmax(72px, 0.9fr) minmax(112px, 1.1fr) minmax(72px, 0.7fr) minmax(72px, 0.7fr) minmax(80px, auto) minmax(96px, 0.9fr) minmax(64px, 0.7fr)',
  gap: S.sm,
  alignItems: 'center',
  fontSize: 12,
  padding: '4px 0',
  borderBottom: `1px solid ${C.border}44`,
};

const venueAuditHeaderStyle: CSSProperties = {
  ...venueAuditRowStyle,
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

const hashTruncStyle: CSSProperties = {
  color: C.textDim,
  fontFamily: mono,
  fontVariantNumeric: 'tabular-nums',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const demoSectionStyle: CSSProperties = {
  marginTop: S.lg,
  paddingTop: S.md,
  borderTop: `2px solid ${C.border}`,
};

const demoSectionHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: S.sm,
  marginBottom: S.sm,
  flexWrap: 'wrap',
};

const demoCopyStyle: CSSProperties = {
  color: C.textMute,
  fontSize: 11,
  lineHeight: 1.4,
  marginTop: S.xs,
};

const demoButtonStyle: CSSProperties = {
  background: C.accent,
  color: '#ffffff',
  border: 'none',
  borderRadius: 0,
  padding: '0.55rem 0.9rem',
  fontSize: 12,
  fontFamily: 'inherit',
  fontWeight: 700,
  letterSpacing: '0.02em',
};

const costStyle: CSSProperties = {
  color: C.text,
  fontSize: 12,
  fontWeight: 700,
  fontFamily: mono,
  fontVariantNumeric: 'tabular-nums',
};
