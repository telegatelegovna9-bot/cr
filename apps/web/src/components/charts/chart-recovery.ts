interface ChartRecoveryRequestDescriptor {
  exchange: string;
  marketType: 'spot' | 'futures';
  symbol: string;
  timeframe: string;
  limit: number;
  endTime?: number;
}

const inFlightChartRecoveryRequests = new Map<string, Promise<unknown>>();

export function createChartRecoveryRequestKey(descriptor: ChartRecoveryRequestDescriptor): string {
  return JSON.stringify(descriptor);
}

export function requestCoalescedChartRecovery<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const existing = inFlightChartRecoveryRequests.get(key);
  if (existing) return existing as Promise<T>;

  const request = fetcher().finally(() => {
    inFlightChartRecoveryRequests.delete(key);
  });

  inFlightChartRecoveryRequests.set(key, request);
  return request;
}

export function resetChartRecoveryRequestsForTest() {
  inFlightChartRecoveryRequests.clear();
}
