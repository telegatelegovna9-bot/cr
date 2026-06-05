'use client';

import type { PatternFilters, PatternListItem } from '@/lib/patterns/models';
import { PatternsFilters } from './patterns-filters';
import { PatternsList } from './patterns-list';

interface PatternsSidebarProps {
  search: string;
  filters: PatternFilters;
  items: PatternListItem[];
  selectedPatternId: string | null;
  hasMore: boolean;
  onSearchChange: (value: string) => void;
  onFiltersChange: (filters: PatternFilters) => void;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
}

export function PatternsSidebar({
  search,
  filters,
  items,
  selectedPatternId,
  hasMore,
  onSearchChange,
  onFiltersChange,
  onSelect,
  onLoadMore,
  onRefresh,
}: PatternsSidebarProps) {
  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="glass-card border border-border rounded-2xl p-3 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-text-primary">
              Patterns
            </div>
            <div className="text-xs text-text-muted">{items.length} results</div>
          </div>
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-muted hover:text-text-secondary"
          >
            Refresh
          </button>
        </div>

        <PatternsFilters
          search={search}
          filters={filters}
          onSearchChange={onSearchChange}
          onFiltersChange={onFiltersChange}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-auto pr-1">
        <PatternsList
          items={items}
          selectedPatternId={selectedPatternId}
          onSelect={onSelect}
          hasMore={hasMore}
          onLoadMore={onLoadMore}
        />
      </div>
    </div>
  );
}
