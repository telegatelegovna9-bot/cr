import type { ScreenerMarketType } from '@crypto-screener/shared';
import { formatTime } from '../../lib/format';

interface ScreenerStatusBarProps {
  marketType: ScreenerMarketType;
  matchCount: number;
  updatedAt: number;
  presetName: string;
  soundEnabled: boolean;
}

export function ScreenerStatusBar({
  marketType,
  matchCount,
  updatedAt,
  presetName,
  soundEnabled,
}: ScreenerStatusBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-[11px] text-text-muted">
      <div>Mode: {marketType === 'spot' ? 'Spot' : 'Futures'}</div>
      <div>Matches: {matchCount}</div>
      <div>Last update: {formatTime(updatedAt)}</div>
      <div>Preset: {presetName || 'Unsaved'}</div>
      <div>Sound: {soundEnabled ? 'On' : 'Off'}</div>
    </div>
  );
}
