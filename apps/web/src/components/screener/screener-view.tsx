'use client';

import { Radar } from 'lucide-react';
import { ScreenerFilterGrid } from './screener-filter-grid';
import { ScreenerResultsTable } from './screener-results-table';
import { ScreenerStatusBar } from './screener-status-bar';
import { ScreenerToolbar } from './screener-toolbar';

export function ScreenerView() {
  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-hidden p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-aurora shadow-glow-sm">
          <Radar className="h-4.5 w-4.5 text-white" />
        </div>
        <div>
          <h1 className="gradient-text text-lg font-bold">Market Screener</h1>
          <p className="text-xs text-text-muted">Shared live scanner with local presets and sound notifications.</p>
        </div>
      </div>

      <ScreenerToolbar />
      <ScreenerFilterGrid />
      <ScreenerStatusBar />
      <ScreenerResultsTable />
    </div>
  );
}
