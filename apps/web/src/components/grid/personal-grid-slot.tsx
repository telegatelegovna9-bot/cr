'use client';

import { Expand, Minimize2, Pencil, Plus, Trash2 } from 'lucide-react';
import { ChartCard } from '@/components/charts/chart-card';
import type { PersonalGridSlotConfig } from '@/lib/personal-grid/models';
import type { Timeframe } from '@crypto-screener/shared';

interface PersonalGridSlotProps {
  slot: PersonalGridSlotConfig;
  index: number;
  expanded: boolean;
  onAdd: (slotId: string) => void;
  onReplace: (slotId: string) => void;
  onRemove: (slotId: string) => void;
  onExpand: (slotId: string) => void;
  onCollapse: () => void;
  onTimeframeChange: (slotId: string, timeframe: Timeframe) => void;
}

export function PersonalGridSlot({
  slot,
  index,
  expanded,
  onAdd,
  onReplace,
  onRemove,
  onExpand,
  onCollapse,
  onTimeframeChange,
}: PersonalGridSlotProps) {
  if (!slot.symbol || !slot.exchange || !slot.marketType) {
    return (
      <button
        onClick={() => onAdd(slot.id)}
        className="glass-card border border-dashed border-border-light rounded-2xl h-full min-h-[220px] flex flex-col items-center justify-center gap-3 text-text-muted hover:text-text-secondary hover:border-accent/30 transition-all"
      >
        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
          <Plus className="w-5 h-5 text-accent-light" />
        </div>
        <div className="text-sm font-medium">Add Chart</div>
        <div className="text-xs text-text-muted">Choose symbol, exchange, and market type</div>
      </button>
    );
  }

  const symbol: string = slot.symbol;
  const exchange: string = slot.exchange;
  const marketType: 'spot' | 'futures' = slot.marketType;

  return (
    <div className="relative h-full min-h-0">
      <ChartCard
        symbol={symbol}
        exchange={exchange}
        index={index}
        initialTimeframe={slot.timeframe ?? undefined}
        initialMarketType={marketType}
        onTimeframeChange={(timeframe) => onTimeframeChange(slot.id, timeframe)}
        showHeaderPrice={false}
        headerActions={
          <div className="flex items-center gap-0.5 bg-bg-primary/40 rounded-lg p-0.5 border border-border">
            <button
              onClick={() => (expanded ? onCollapse() : onExpand(slot.id))}
              className="p-1.5 rounded-md hover:bg-surface-hover transition-colors cursor-pointer"
            >
              {expanded ? (
                <Minimize2 className="w-3.5 h-3.5 text-text-muted" />
              ) : (
                <Expand className="w-3.5 h-3.5 text-text-muted" />
              )}
            </button>
            <button
              onClick={() => onReplace(slot.id)}
              className="p-1.5 rounded-md hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5 text-text-muted" />
            </button>
            <button
              onClick={() => onRemove(slot.id)}
              className="p-1.5 rounded-md hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-text-muted" />
            </button>
          </div>
        }
      />
    </div>
  );
}
