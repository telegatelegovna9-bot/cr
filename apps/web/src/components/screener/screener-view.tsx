'use client';

import { Radar } from 'lucide-react';

export function ScreenerView() {
  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-hidden p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-aurora shadow-glow-sm">
          <Radar className="h-4.5 w-4.5 text-white" />
        </div>
        <div>
          <h1 className="gradient-text text-lg font-bold">Market Screener</h1>
          <p className="text-xs text-text-muted">This tab has been cleared and is ready for a new implementation.</p>
        </div>
      </div>

      <div className="glass-card flex min-h-0 flex-1 items-center justify-center p-8">
        <div className="max-w-xl text-center">
          <div className="text-base font-semibold text-text-primary">Screener is intentionally empty</div>
          <div className="mt-2 text-sm leading-relaxed text-text-muted">
            Previous screener logic, feeds, and supporting UI were removed to free the product surface for a new build.
          </div>
        </div>
      </div>
    </div>
  );
}
