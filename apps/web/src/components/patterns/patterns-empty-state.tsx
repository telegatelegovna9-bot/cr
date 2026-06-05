'use client';

export function PatternsEmptyState() {
  return (
    <div className="glass-card border border-border rounded-2xl h-full min-h-[320px] flex flex-col items-center justify-center text-center px-6">
      <div className="text-base font-semibold text-text-primary">
        Scanning market...
      </div>
      <div className="mt-2 text-sm text-text-muted max-w-sm">
        The backend scanner is checking Binance futures for active structures.
        New forming and confirmed patterns will appear here automatically.
      </div>
    </div>
  );
}
