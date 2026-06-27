export function ScreenerStatusBar() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-[11px] text-text-muted">
      <div>Mode: Spot</div>
      <div>Matches: 0</div>
      <div>Last update: --</div>
      <div>Preset: Default</div>
    </div>
  );
}
