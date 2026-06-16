'use client';

import { ExternalLink } from 'lucide-react';
import type {
  ScreenerEventListItem,
  ScreenerHealthState,
  ScreenerMode,
} from '@/lib/screener/models';
import {
  formatScreenerFreshness,
  screenerModeLabel,
  screenerPromotionLabel,
  screenerStrengthLabel,
} from '@/lib/screener/models';

function promotionToneClass(tier: ScreenerEventListItem['promotionTier']): string {
  switch (tier) {
    case 'rare':
      return 'border-rose-400/20 bg-rose-500/10 text-rose-300';
    case 'actionable':
      return 'border-amber-400/20 bg-amber-500/10 text-amber-300';
    case 'watch':
      return 'border-sky-400/20 bg-sky-500/10 text-sky-300';
    case 'ignore':
      return 'border-border bg-bg-primary/35 text-text-muted';
  }
}

function strengthToneClass(tier: ScreenerEventListItem['strengthTier']): string {
  switch (tier) {
    case 'event-live':
      return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300';
    case 'high-risk':
      return 'border-amber-400/20 bg-amber-500/10 text-amber-300';
    case 'actionable':
      return 'border-sky-400/20 bg-sky-500/10 text-sky-300';
    case 'watching':
      return 'border-border bg-bg-primary/35 text-text-muted';
  }
}

function modeEmptyCopy(mode: ScreenerMode, healthState: ScreenerHealthState): string {
  if (healthState.tone === 'waiting') {
    return 'Waiting for the shared screener backend to publish its first event snapshot.';
  }

  if (healthState.tone === 'stale') {
    return `No ${screenerModeLabel(mode).toLowerCase()} are safe to show because the latest snapshot is stale.`;
  }

  switch (mode) {
    case 'best-setups':
      return 'No curated setups made the best-setups bar in the latest shared snapshot.';
    case 'spot':
      return 'No spot setup events are active in the latest shared snapshot.';
    case 'futures':
      return 'No futures setup events are active in the latest shared snapshot.';
  }
}

export function SetupEventList({
  mode,
  items,
  selectedId,
  loading,
  healthState,
  onSelect,
  onOpenChart,
}: {
  mode: ScreenerMode;
  items: ScreenerEventListItem[];
  selectedId: string;
  loading: boolean;
  healthState: ScreenerHealthState;
  onSelect: (id: string) => void;
  onOpenChart: (item: ScreenerEventListItem) => void;
}) {
  return (
    <div className="glass-card min-h-0 overflow-hidden">
      <div className="border-b border-border bg-bg-primary/30 px-4 py-3">
        <div className="text-sm font-semibold text-text-primary">{screenerModeLabel(mode)} Feed</div>
        <div className="mt-1 text-[11px] text-text-muted">
          Ranked event list from the shared detector read model. Pick one for guided detail.
        </div>
      </div>

      <div className="min-h-0 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full min-h-[280px] items-center justify-center px-6 text-center text-sm text-text-muted">
            {loading ? 'Loading screener events...' : modeEmptyCopy(mode, healthState)}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map(item => {
              const active = item.id === selectedId;
              const promotionClass = promotionToneClass(item.promotionTier);
              const strengthClass = strengthToneClass(item.strengthTier);

              return (
                <div
                  key={item.id}
                  className={`w-full cursor-pointer px-4 py-3 text-left transition-colors ${
                    active ? 'bg-accent/8' : 'hover:bg-bg-primary/35'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onSelect(item.id)}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-text-primary">{item.symbol}</div>
                        <span className="rounded-full border border-border bg-bg-primary/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-muted">
                          {item.primaryExchange}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${promotionClass}`}>
                          Urgency: {screenerPromotionLabel(item.promotionTier)}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${strengthClass}`}>
                          Strength: {screenerStrengthLabel(item.strengthTier)}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
                        <span>{item.setupLabel}</span>
                        <span>{item.marketMode}</span>
                        <span>Updated {formatScreenerFreshness(item.freshnessMs)}</span>
                      </div>

                      <div className="mt-2 text-sm font-medium text-text-primary">{item.headline}</div>
                      <div className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-text-secondary">
                        {item.reason}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        onOpenChart(item);
                      }}
                      className="ghost-btn !rounded-xl !px-3 !py-2 !text-xs shrink-0 flex items-center gap-1.5"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open Chart
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
