'use client';

import type {
  ScreenerCompatibleSummary,
  ScreenerHealth,
  ScreenerHealthState,
  ScreenerMode,
} from '@/lib/screener/models';
import { screenerModeLabel } from '@/lib/screener/models';

function getModeCount(summary: ScreenerCompatibleSummary | null, mode: ScreenerMode): string {
  if (!summary) return '--';

  switch (mode) {
    case 'best-setups':
      return String(summary.eventCounts.bestSetupsCount);
    case 'spot':
      return String(summary.eventCounts.spotCount);
    case 'futures':
      return String(summary.eventCounts.futuresCount);
  }
}

function statusToneClass(tone: ScreenerHealthState['tone']): string {
  switch (tone) {
    case 'live':
      return 'text-emerald-300 border-emerald-400/20 bg-emerald-500/5';
    case 'stale':
      return 'text-amber-300 border-amber-400/20 bg-amber-500/5';
    case 'waiting':
      return 'text-text-secondary border-border bg-bg-primary/35';
  }
}

function SummaryTile({
  label,
  value,
  helper,
  tone = 'default',
}: {
  label: string;
  value: string;
  helper: string;
  tone?: 'default' | ScreenerHealthState['tone'];
}) {
  return (
    <div className={`rounded-2xl border p-3 ${tone === 'default' ? 'border-border bg-bg-primary/25' : statusToneClass(tone)}`}>
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-2 text-xl font-semibold text-text-primary">{value}</div>
      <div className="mt-2 text-[11px] leading-relaxed text-text-muted">{helper}</div>
    </div>
  );
}

export function SetupSummaryStrip({
  mode,
  summary,
  health,
  healthState,
}: {
  mode: ScreenerMode;
  summary: ScreenerCompatibleSummary | null;
  health: ScreenerHealth | null;
  healthState: ScreenerHealthState;
}) {
  const liveSources = health
    ? Object.values(health.sources).filter(source => source.status === 'live').length
    : 0;
  const totalSources = health ? Object.keys(health.sources).length : 0;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <SummaryTile
        label={`${screenerModeLabel(mode)} Feed`}
        value={getModeCount(summary, mode)}
        helper={summary ? `Shared snapshot for ${screenerModeLabel(mode).toLowerCase()}.` : 'Waiting for summary data.'}
      />
      <SummaryTile
        label="Rare Setups"
        value={summary ? String(summary.eventCounts.rareCount) : '--'}
        helper="Curated events with the strongest detector promotion."
      />
      <SummaryTile
        label="Coverage"
        value={totalSources > 0 ? `${liveSources}/${totalSources}` : '--'}
        helper={health ? 'Live venue sources contributing to this snapshot.' : 'Venue health has not arrived yet.'}
      />
      <SummaryTile
        label="Engine Status"
        value={healthState.label}
        helper={healthState.detail}
        tone={healthState.tone}
      />
    </div>
  );
}
