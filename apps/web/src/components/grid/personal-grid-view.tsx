'use client';

import { useMemo, useState } from 'react';
import { Grid2x2, Grid3x3, Square } from 'lucide-react';
import { useUIStore } from '@/stores';
import { ChartPickerModal } from './chart-picker-modal';
import { PersonalGridSlot } from './personal-grid-slot';

const GRID_OPTIONS = [
  { size: 1 as const, label: '1', icon: Square },
  { size: 4 as const, label: '4', icon: Grid2x2 },
  { size: 6 as const, label: '6', icon: Grid3x3 },
];

export function PersonalGridView() {
  const {
    personalGrid,
    setPersonalGridLayout,
    setPersonalGridSlot,
    clearPersonalGridSlot,
    expandPersonalGridSlot,
    collapsePersonalGridSlot,
  } = useUIStore();
  const [pickerSlotId, setPickerSlotId] = useState<string | null>(null);

  const visibleSlots = useMemo(
    () => personalGrid.slots.slice(0, personalGrid.layout),
    [personalGrid],
  );

  const expandedSlot = personalGrid.expandedSlotId
    ? personalGrid.slots.find(slot => slot.id === personalGrid.expandedSlotId) ?? null
    : null;

  const pickerSlot = pickerSlotId
    ? personalGrid.slots.find(slot => slot.id === pickerSlotId) ?? null
    : null;

  const pickerInitialSelection = useMemo(
    () =>
      pickerSlot
        ? {
            symbol: pickerSlot.symbol,
            exchange: pickerSlot.exchange,
            marketType: pickerSlot.marketType,
          }
        : undefined,
    [pickerSlot],
  );

  const gridClass =
    personalGrid.layout === 1
      ? 'grid-cols-1 grid-rows-1'
      : personalGrid.layout === 4
        ? 'grid-cols-2 grid-rows-2'
        : 'grid-cols-2 grid-rows-3 xl:grid-cols-3 xl:grid-rows-2';

  return (
    <div className="h-full flex flex-col p-3 gap-3">
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-1 bg-bg-primary/40 rounded-xl p-1 border border-border">
          {GRID_OPTIONS.map(({ size, label, icon: Icon }) => (
            <button
              key={size}
              onClick={() => setPersonalGridLayout(size)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all duration-200 cursor-pointer font-medium ${
                personalGrid.layout === size
                  ? 'bg-accent/15 text-accent-light shadow-glow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {expandedSlot ? (
          <div className="h-full">
            <PersonalGridSlot
              slot={expandedSlot}
              index={0}
              expanded
              onAdd={setPickerSlotId}
              onReplace={setPickerSlotId}
              onRemove={clearPersonalGridSlot}
              onExpand={expandPersonalGridSlot}
              onCollapse={collapsePersonalGridSlot}
            />
          </div>
        ) : (
          <div className={`h-full grid ${gridClass} gap-3 min-h-0`}>
            {visibleSlots.map((slot, index) => (
              <PersonalGridSlot
                key={slot.id}
                slot={slot}
                index={index}
                expanded={false}
                onAdd={setPickerSlotId}
                onReplace={setPickerSlotId}
                onRemove={clearPersonalGridSlot}
                onExpand={expandPersonalGridSlot}
                onCollapse={collapsePersonalGridSlot}
              />
            ))}
          </div>
        )}
      </div>

      <ChartPickerModal
        key={pickerSlotId ?? 'closed'}
        open={pickerSlotId !== null}
        onClose={() => setPickerSlotId(null)}
        onConfirm={(selection) => {
          if (!pickerSlotId) return;
          setPersonalGridSlot(pickerSlotId, selection);
          setPickerSlotId(null);
        }}
        initialSelection={pickerInitialSelection}
      />
    </div>
  );
}
