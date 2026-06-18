import type { ViewMode } from '@crypto-screener/shared';

export function isChartRealtimeActive(params: {
  paused: boolean;
  isViewActive: boolean;
}): boolean {
  return !params.paused && params.isViewActive;
}

export function isTerminalChartGridActive(params: {
  viewMode: ViewMode;
  coinChartModalOpen: boolean;
}): boolean {
  return params.viewMode === 'terminal' && !params.coinChartModalOpen;
}
