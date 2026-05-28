'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, HistogramData, Time } from 'lightweight-charts';
import { useMarketStore } from '@/stores';
import { motion } from 'framer-motion';
import { Maximize2, X, Loader2 } from 'lucide-react';

interface ChartCardProps {
  symbol: string;
  index: number;
  onExpand?: () => void;
  isModal?: boolean;
}

// Convert unified symbol to Binance stream symbol: "BTC/USDT" → "btcusdt"
function toBinanceSymbol(symbol: string): string {
  return symbol.split('/')[0].toLowerCase() + symbol.split('/')[1]?.split(':')[0]?.toLowerCase();
}

// Is this a futures symbol? "BTC/USDT:USDT" → true
function isFutures(symbol: string): boolean {
  return symbol.includes(':');
}

// Binance WS URL for kline stream
function binanceWsUrl(symbol: string, timeframe: string): string {
  const s = toBinanceSymbol(symbol);
  const base = isFutures(symbol)
    ? 'wss://fstream.binance.com/ws'
    : 'wss://stream.binance.com:9443/ws';
  return `${base}/${s}@kline_${timeframe}`;
}

function isValidCandle(k: any): boolean {
  return (
    k.timestamp != null && k.timestamp > 0 &&
    k.open != null && k.high != null && k.low != null && k.close != null &&
    isFinite(k.open) && isFinite(k.high) && isFinite(k.low) && isFinite(k.close) &&
    k.open > 0 && k.high > 0 && k.low > 0 && k.close > 0 &&
    k.high >= k.low
  );
}

function buildCandles(raw: any[]): { candles: CandlestickData[]; volumes: HistogramData[] } {
  const seen = new Set<number>();
  const valid = raw
    .filter(isValidCandle)
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter((k) => {
      if (seen.has(k.timestamp)) return false;
      seen.add(k.timestamp);
      return true;
    });

  const candles: CandlestickData[] = valid.map((k) => ({
    time: (k.timestamp / 1000) as Time,
    open: k.open, high: k.high, low: k.low, close: k.close,
  }));
  const volumes: HistogramData[] = valid.map((k) => ({
    time: (k.timestamp / 1000) as Time,
    value: k.volume ?? 0,
    color: k.close >= k.open ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
  }));
  return { candles, volumes };
}

export function ChartCard({ symbol, index, onExpand, isModal = false }: ChartCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const oldestTimeRef = useRef<number | null>(null);
  const allRawRef = useRef<any[]>([]);
  const loadingMoreRef = useRef(false);
  const readyRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);

  const { selectedExchange, selectedTimeframe, getTicker } = useMarketStore();
  const [loading, setLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number | null>(null);

  const ticker = getTicker(symbol, selectedExchange);

  // ── Init chart + load history via REST ────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    readyRef.current = false;
    oldestTimeRef.current = null;
    allRawRef.current = [];
    loadingMoreRef.current = false;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    }

    let cancelled = false;

    const initChart = async () => {
      setLoading(true);

      const chart = createChart(containerRef.current!, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#6B6B8A',
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.03)' },
          horzLines: { color: 'rgba(255,255,255,0.03)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: 'rgba(99,102,241,0.3)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#6366f1' },
          horzLine: { color: 'rgba(99,102,241,0.3)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#6366f1' },
        },
        rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)', scaleMargins: { top: 0.1, bottom: 0.25 } },
        timeScale: { borderColor: 'rgba(255,255,255,0.06)', timeVisible: true, secondsVisible: false },
        handleScroll: { vertTouchDrag: false },
      });

      if (cancelled) { chart.remove(); return; }
      chartRef.current = chart;

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#22c55e', downColor: '#ef4444',
        borderUpColor: '#22c55e', borderDownColor: '#ef4444',
        wickUpColor: '#22c55e88', wickDownColor: '#ef444488',
      });
      candleSeriesRef.current = candleSeries;

      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      volumeSeriesRef.current = volumeSeries;

      // Load initial history via REST
      try {
        const resp = await fetch(
          `/api/market/candles/${symbol.replace('/', '-')}?timeframe=${selectedTimeframe}&exchange=${selectedExchange}&limit=300`
        );
        if (!cancelled && resp.ok) {
          const data = await resp.json();
          const raw: any[] = data.data || [];
          if (raw.length && !cancelled) {
            allRawRef.current = raw;
            const { candles, volumes } = buildCandles(raw);
            if (candles.length > 0) {
              candleSeries.setData(candles);
              volumeSeries.setData(volumes);
              oldestTimeRef.current = raw[0].timestamp / 1000;

              const lastRaw = raw[raw.length - 1];
              setCurrentPrice(lastRaw.close);
              if (raw.length > 1) {
                setPriceChange(((lastRaw.close - raw[0].open) / raw[0].open) * 100);
              }
            }
          }
        }
      } catch (err) {
        console.error('[Chart] Failed to fetch candles:', err);
      }

      if (cancelled) return;

      chart.timeScale().fitContent();
      setLoading(false);

      // Enable historical scroll after a short delay
      setTimeout(() => { readyRef.current = true; }, 600);

      // Historical scroll: load older candles when user scrolls to left edge
      const handleRangeChange = async (range: any) => {
        if (!range || !readyRef.current || loadingMoreRef.current || !oldestTimeRef.current) return;
        if (range.from > 5) return;

        loadingMoreRef.current = true;
        try {
          const endTime = Math.floor(oldestTimeRef.current * 1000) - 1;
          const resp = await fetch(
            `/api/market/candles/${symbol.replace('/', '-')}?timeframe=${selectedTimeframe}&exchange=${selectedExchange}&limit=300&endTime=${endTime}`
          );
          if (!resp.ok) { loadingMoreRef.current = false; return; }

          const data = await resp.json();
          const older: any[] = data.data || [];
          if (!older.length) { loadingMoreRef.current = false; return; }

          allRawRef.current = [...older, ...allRawRef.current];
          const { candles, volumes } = buildCandles(allRawRef.current);
          if (candleSeriesRef.current && volumeSeriesRef.current && candles.length > 0) {
            candleSeriesRef.current.setData(candles);
            volumeSeriesRef.current.setData(volumes);
            oldestTimeRef.current = older[0].timestamp / 1000;
          }
        } catch {
          // silent
        }
        loadingMoreRef.current = false;
      };

      chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);
    };

    initChart();

    return () => {
      cancelled = true;
      readyRef.current = false;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        volumeSeriesRef.current = null;
      }
    };
  }, [symbol, selectedExchange, selectedTimeframe]);

  // ── Resize observer ────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chartRef.current?.applyOptions({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Direct Binance WebSocket kline stream ──────────────────
  // Industry-standard approach: connect directly to Binance WS from browser.
  // Binance kline stream sends updates every 2s with current candle OHLCV.
  // k.x === true means the candle is closed (finalized).
  useEffect(() => {
    // Only connect to Binance for binance exchange
    if (selectedExchange !== 'binance') return;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      const url = binanceWsUrl(symbol, selectedTimeframe);
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[WS] Binance kline connected: ${symbol} ${selectedTimeframe}`);
      };

      ws.onmessage = (event) => {
        if (destroyed) return;
        try {
          const data = JSON.parse(event.data);
          const k = data.k;
          if (!k) return;

          const open = parseFloat(k.o);
          const high = parseFloat(k.h);
          const low = parseFloat(k.l);
          const close = parseFloat(k.c);
          const volume = parseFloat(k.v);
          const time = (k.t / 1000) as Time;

          if (!isFinite(open) || !isFinite(high) || !isFinite(low) || !isFinite(close)) return;
          if (open <= 0 || high <= 0 || low <= 0 || close <= 0) return;

          // Update candlestick series — lightweight-charts handles new vs existing candle
          if (candleSeriesRef.current) {
            candleSeriesRef.current.update({ time, open, high, low, close });
          }
          if (volumeSeriesRef.current) {
            volumeSeriesRef.current.update({
              time,
              value: volume,
              color: close >= open ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
            });
          }

          setCurrentPrice(close);
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = (event) => {
        if (destroyed) return;
        console.log(`[WS] Binance kline closed (${event.code}), reconnecting in 3s...`);
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null; // prevent reconnect on intentional close
        ws.close();
      }
      wsRef.current = null;
    };
  }, [symbol, selectedExchange, selectedTimeframe]);

  const livePrice = ticker?.price ?? currentPrice;
  const liveChange = ticker?.priceChangePercent24h ?? priceChange;
  const isPositive = (liveChange ?? 0) >= 0;
  const base = symbol.split('/')[0];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="glass-card overflow-hidden flex flex-col relative ambient-glow h-full"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold"
            style={{
              background: isPositive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: isPositive ? '#22c55e' : '#ef4444',
            }}
          >
            {base.charAt(0)}
          </div>
          <div>
            <div className="text-xs font-bold text-text-primary">{symbol}</div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider">
              {selectedExchange} · {selectedTimeframe}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {livePrice != null && (
            <div className="text-right mr-2">
              <div className="text-sm font-bold font-mono text-text-primary">
                ${livePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </div>
              {liveChange != null && (
                <div className={`text-[10px] font-bold font-mono ${isPositive ? 'text-positive' : 'text-negative'}`}>
                  {isPositive ? '+' : ''}{(liveChange ?? 0).toFixed(2)}%
                </div>
              )}
            </div>
          )}
          <button onClick={onExpand} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer">
            {isModal ? <X className="w-4 h-4 text-text-muted" /> : <Maximize2 className="w-4 h-4 text-text-muted" />}
          </button>
        </div>
      </div>

      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/50 z-10">
            <Loader2 className="w-6 h-6 text-accent animate-spin" />
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </motion.div>
  );
}
