export function ScreenerToolbar() {
  return (
    <div className="glass-card flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2">
        <button className="rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent-light shadow-glow-sm">
          Spot
        </button>
        <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:text-text-primary">
          Futures
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input className="input-premium w-40 !py-2 !text-xs" placeholder="Preset name" />
        <button className="ghost-btn px-3 py-1.5 text-xs">Save</button>
        <button className="ghost-btn px-3 py-1.5 text-xs">Sound On</button>
      </div>
    </div>
  );
}
