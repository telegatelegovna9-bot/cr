// Custom hooks for data fetching

'use client';

import { useQuery } from '@tanstack/react-query';
import { marketApi, screenerApi, alertsApi, patternsApi } from '@/lib/api';

export function useTickers(exchange?: string) {
  return useQuery({
    queryKey: ['tickers', exchange],
    queryFn: () => marketApi.getTickers(exchange),
    refetchInterval: 5000,
    select: (data) => data.data,
  });
}

export function useTopGainers(limit = 50) {
  return useQuery({
    queryKey: ['top-gainers', limit],
    queryFn: () => marketApi.getTopGainers(limit),
    refetchInterval: 10000,
    select: (data) => data.data,
  });
}

export function useTopLosers(limit = 50) {
  return useQuery({
    queryKey: ['top-losers', limit],
    queryFn: () => marketApi.getTopLosers(limit),
    refetchInterval: 10000,
    select: (data) => data.data,
  });
}

export function useTopVolume(limit = 50) {
  return useQuery({
    queryKey: ['top-volume', limit],
    queryFn: () => marketApi.getTopVolume(limit),
    refetchInterval: 10000,
    select: (data) => data.data,
  });
}

export function useCandles(symbol: string, timeframe: string, exchange?: string) {
  return useQuery({
    queryKey: ['candles', symbol, timeframe, exchange],
    queryFn: () => marketApi.getCandles(symbol, timeframe, exchange),
    enabled: !!symbol,
    select: (data) => data.data,
  });
}

export function useOrderBook(symbol: string, exchange?: string) {
  return useQuery({
    queryKey: ['orderbook', symbol, exchange],
    queryFn: () => marketApi.getOrderBook(symbol, exchange),
    enabled: !!symbol,
    refetchInterval: 2000,
    select: (data) => data.data,
  });
}

export function useExchanges() {
  return useQuery({
    queryKey: ['exchanges'],
    queryFn: () => marketApi.getExchanges(),
    refetchInterval: 30000,
    select: (data) => data.data,
  });
}

export function useScreener(filters: unknown) {
  return useQuery({
    queryKey: ['screener', filters],
    queryFn: () => screenerApi.scan(filters),
    select: (data) => ({ results: data.results, total: data.total }),
  });
}

export function useAlerts(params?: { type?: string; symbol?: string }) {
  return useQuery({
    queryKey: ['alerts', params],
    queryFn: () => alertsApi.getAlerts(params),
    refetchInterval: 5000,
    select: (data) => ({ alerts: data.alerts, total: data.total }),
  });
}

export function useRecentAlerts(limit = 50) {
  return useQuery({
    queryKey: ['recent-alerts', limit],
    queryFn: () => alertsApi.getRecent(limit),
    refetchInterval: 3000,
    select: (data) => data.data,
  });
}

export function usePatterns(params?: { symbol?: string; type?: string }) {
  return useQuery({
    queryKey: ['patterns', params],
    queryFn: () => patternsApi.getPatterns(params),
    refetchInterval: 30000,
    select: (data) => data.data,
  });
}
