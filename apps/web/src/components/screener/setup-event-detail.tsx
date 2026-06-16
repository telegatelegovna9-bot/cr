'use client';

import type { ReactNode } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import type {
  ScreenerEventDetailItem,
  ScreenerHealthState,
  ScreenerMode,
} from '@/lib/screener/models';
import {
  formatScreenerFreshness,
  formatScreenerMetricValue,
  screenerModeLabel,
  screenerPromotionLabel,
  screenerStrengthLabel,
} from '@/lib/screener/models';

function toneClass(tone: ScreenerHealthState['tone']): string {
  switch (tone) {
    case 'live':
      return 'border-emerald-400/20 bg-emerald-500/5 text-emerald-300';
    case 'stale':
      return 'border-amber-400/20 bg-amber-500/10 text-amber-300';
    case 'waiting':
      return 'border-border bg-bg-primary/35 text-text-secondary';
  }
}

function detailEmptyCopy(mode: ScreenerMode): string {
  switch (mode) {
    case 'best-setups':
      return 'Select a curated setup to see what changed, why it was flagged, and what would invalidate it.';
    case 'spot':
      return 'Select a spot event to see the breakout or divergence context in plain language.';
    case 'futures':
      return 'Select a futures event to inspect leverage, open-interest, and squeeze context.';
  }
}

function DetailSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-bg-primary/25 p-4">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function SetupEventDetail({
  mode,
  item,
  healthState,
  detailLoading,
  onOpenChart,
}: {
  mode: ScreenerMode;
  item: ScreenerEventDetailItem | null;
  healthState: ScreenerHealthState;
  detailLoading: boolean;
  onOpenChart: (item: ScreenerEventDetailItem) => void;
}) {
  if (!item) {
    return (
      <div className="glass-card flex min-h-[320px] items-center justify-center px-6 text-center text-sm text-text-muted">
        {detailLoading ? 'Loading setup detail...' : detailEmptyCopy(mode)}
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="border-b border-border bg-bg-primary/30 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-lg font-bold text-text-primary">{item.symbol}</div>
              <span className="rounded-full border border-border bg-bg-primary/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-muted">
                {item.primaryExchange}
              </span>
              <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-rose-300">
                Urgency: {screenerPromotionLabel(item.promotionTier)}
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
                Strength: {screenerStrengthLabel(item.strengthTier)}
              </span>
            </div>
            <div className="mt-2 text-sm font-medium text-text-primary">{item.setupLabel}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
              <span>{screenerModeLabel(mode)}</span>
              <span>{item.chartTimeframe} chart</span>
              <span>Updated {formatScreenerFreshness(item.freshnessMs)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {detailLoading && <Loader2 className="h-4 w-4 animate-spin text-text-muted" />}
            <button
              type="button"
              onClick={() => onOpenChart(item)}
              className="ghost-btn !rounded-xl !px-3 !py-2 !text-xs shrink-0 flex items-center gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Chart
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className={`rounded-2xl border px-3 py-2 text-[12px] ${toneClass(healthState.tone)}`}>
          {healthState.label}: {healthState.detail}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-border bg-bg-primary/25 p-3">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Urgency</div>
            <div className="mt-2 text-sm font-semibold text-text-primary">{screenerPromotionLabel(item.promotionTier)}</div>
          </div>
          <div className="rounded-2xl border border-border bg-bg-primary/25 p-3">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Strength</div>
            <div className="mt-2 text-sm font-semibold text-text-primary">{screenerStrengthLabel(item.strengthTier)}</div>
          </div>
          <div className="rounded-2xl border border-border bg-bg-primary/25 p-3">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Market</div>
            <div className="mt-2 text-sm font-semibold text-text-primary">{item.marketMode}</div>
          </div>
          <div className="rounded-2xl border border-border bg-bg-primary/25 p-3">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Chart</div>
            <div className="mt-2 text-sm font-semibold text-text-primary">{item.chartTimeframe}</div>
          </div>
        </div>

        <DetailSection label="What Changed">
          <p className="text-sm leading-relaxed text-text-secondary">{item.whatChanged}</p>
        </DetailSection>

        <DetailSection label="Why Flagged">
          <p className="text-sm leading-relaxed text-text-secondary">{item.whyFlagged}</p>
        </DetailSection>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DetailSection label="Confirms">
            {item.confirms.length > 0 ? (
              <ul className="space-y-2 text-sm leading-relaxed text-text-secondary">
                {item.confirms.map(entry => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">No confirm list was provided for this event.</p>
            )}
          </DetailSection>

          <DetailSection label="Invalidates">
            {item.invalidates.length > 0 ? (
              <ul className="space-y-2 text-sm leading-relaxed text-text-secondary">
                {item.invalidates.map(entry => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">No invalidation list was provided for this event.</p>
            )}
          </DetailSection>
        </div>

        <DetailSection label="Risk Note">
          <p className="text-sm leading-relaxed text-text-secondary">{item.riskNote}</p>
        </DetailSection>

        <DetailSection label="Market Context">
          {item.marketContext.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {item.marketContext.map(metric => (
                <div key={metric.key} className="rounded-2xl border border-border bg-bg-primary/20 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">{metric.label}</div>
                  <div className="mt-2 text-sm font-semibold text-text-primary">
                    {formatScreenerMetricValue(metric.key, metric.value)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">No supporting market context was attached to this event.</p>
          )}
        </DetailSection>
      </div>
    </div>
  );
}
