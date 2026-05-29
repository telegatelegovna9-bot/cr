// Format utilities for the frontend

export function getPricePrecision(price?: number): number {
  if (price === undefined || price === null || !Number.isFinite(price)) return 2;

  const absPrice = Math.abs(price);
  if (absPrice >= 1000) return 2;
  if (absPrice >= 1) return 4;
  if (absPrice >= 0.1) return 5;
  if (absPrice >= 0.01) return 6;
  if (absPrice >= 0.001) return 7;
  if (absPrice >= 0.0001) return 8;
  if (absPrice >= 0.000001) return 10;
  return 12;
}

export function getChartPriceFormat(price?: number) {
  const precision = getPricePrecision(price);

  return {
    type: 'price' as const,
    precision,
    minMove: 10 ** -precision,
  };
}

export function formatPrice(price?: number): string {
  if (price === undefined || price === null) return '—';
  const precision = getPricePrecision(price);
  return price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: precision,
  });
}

export function formatPercent(value?: number): string {
  if (value === undefined || value === null) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatVolume(volume?: number): string {
  if (volume === undefined || volume === null) return '—';
  if (volume >= 1e9) return `${(volume / 1e9).toFixed(2)}B`;
  if (volume >= 1e6) return `${(volume / 1e6).toFixed(2)}M`;
  if (volume >= 1e3) return `${(volume / 1e3).toFixed(1)}K`;
  return volume.toFixed(0);
}

export function formatNumber(n?: number, decimals = 2): string {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatTime(timestamp?: number): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDateTime(timestamp?: number): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getTimeAgo(timestamp?: number): string {
  if (!timestamp) return '—';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
