// Lightweight charts card component optimized for performance

'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, HistogramData, Time } from 'lightweight-charts';
import { useMarketStore, useUIStore, useOrderbookStore } from '@/stores';
import { useWebSocket } from '@/hooks/useWebSocket';
import { formatPrice, getChartPriceFormat } from '@/lib/format';
import { motion } from 'framer-motion';
import { Maximize2, X, Loader2 } from 'lucide-react';
import { LiquidityEngine, heatColor } from '@/lib/liquidity-engine';
import { HeatmapControls } from './heatmap-controls';

interface ChartCardProps {
  symbol: string;
  index: number;
  exchange?: string;
  onExpand?: () => void;
  isModal?: boolean;
  paused?: boolean;
  initialData?: any[];
  initialTimeframe?: string;
  initialMarketType?: 'spot' | 'futures';
  onDataLoaded?: (symbol: string, data: any[], timeframe: string) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const INITIAL_VISIBLE_CANDLES = 100;
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const;
type TF = typeof TIMEFRAMES[number];

function isValidCandle(k: any): boolean {
  const time = k.time || k.timestamp;
  return (
    time != null && time > 0 &&
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
    .sort((a, b) => (a.time || a.timestamp) - (b.time || b.timestamp))
    .filter((k) => {
      const t = k.time || k.timestamp;
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    });

  const candles: CandlestickData[] = valid.map((k) => ({
    time: ((k.time || k.timestamp) / 1000) as Time,
    open: k.open, high: k.high, low: k.low, close: k.close,
  }));
  const volumes: HistogramData[] = valid.map((k) => ({
    time: ((k.time || k.timestamp) / 1000) as Time,
    value: k.volume ?? 0,
    color: k.close >= k.open ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
  }));
  return { candles, volumes };
}

export function ChartCard({ symbol, index, exchange: exchangeProp, onExpand, isModal = false, paused = false, initialData, initialTimeframe, initialMarketType, onDataLoaded }: ChartCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const oldestTimeRef = useRef<number | null>(null);
  const allRawRef = useRef<any[]>([]);
  const loadingMoreRef = useRef(false);
  const readyRef = useRef(false);
  const resizeFrameRef = useRef<number | null>(null);
  const loadingHistoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRangeSetRef = useRef(false);
  const dataLoadedRef = useRef(false);

  const selectedExchange = useMarketStore(state => state.selectedExchange);
  const selectedTimeframe = useMarketStore(state => state.selectedTimeframe);
  const latestCandle = useMarketStore(state => state.latestCandle);
  const showHeatmap = useUIStore(state => state.showHeatmap);
  const heatmapSettings = useUIStore(state => state.heatmapSettings);
  const chartGridSize = useUIStore(state => state.chartGridSize);
  const exchange = exchangeProp || selectedExchange;
  const ticker = useMarketStore(state => state.getTicker(symbol, exchange));

  // Per-card local state
  const [timeframe, setTimeframe] = useState<TF>(selectedTimeframe as TF);
  const [marketType, setMarketType] = useState<'spot' | 'futures'>(
    initialMarketType ?? (symbol.includes(':USDT') ? 'futures' : 'spot')
  );

  // Refs that always hold the latest values so async closures don't go stale
  const timeframeRef = useRef<TF>(timeframe);
  const marketTypeRef = useRef<'spot' | 'futures'>(marketType);
  const exchangeRef = useRef<string>(exchange);
  exchangeRef.current = exchange;

  const [loading, setLoading] = useState(!initialData || initialData.length === 0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number | null>(null);

  const { subscribe, unsubscribe } = useWebSocket();
  const heatmapEngineRef = useRef<LiquidityEngine | null>(null);
  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const heatmapRafRef = useRef<number | null>(null);
  const heatmapDirtyRef = useRef(false);

  // Stable refs — RAF loop reads these instead of closure values
  // (prevents loop restart on every price tick)
  const heatmapSettingsRef = useRef(heatmapSettings);
  heatmapSettingsRef.current = heatmapSettings;
  const heatmapPriceRef = useRef(0);
  heatmapPriceRef.current = ticker?.lastPrice ?? currentPrice ?? 0;

  // ─── Heatmap: LiquidityEngine + canvas overlay ──────────────────
  const orderbook = useOrderbookStore(state =>
    showHeatmap ? state.getOrderbook(symbol, exchange) : undefined
  );

  // Feed orderbook updates into engine
  useEffect(() => {
    if (!showHeatmap || !orderbook) return;

    if (!heatmapEngineRef.current) {
      const engine = new LiquidityEngine();
      const px = heatmapPriceRef.current || 1;
      const step = px > 10000 ? 10 : px > 1000 ? 1 : px > 100 ? 0.1 : px > 1 ? 0.01 : 0.0001;
      engine.setPriceStep(step);
      heatmapEngineRef.current = engine;
    }

    heatmapEngineRef.current.addUpdate(
      orderbook.bids,
      orderbook.asks,
      heatmapPriceRef.current,
    );
    heatmapDirtyRef.current = true;
  }, [orderbook, showHeatmap]); // no ticker/currentPrice — read from ref

  // Clear engine when heatmap is toggled off; init canvas size when turned on
  useEffect(() => {
    if (!showHeatmap) {
      heatmapEngineRef.current?.clear();
      heatmapEngineRef.current = null;
      const canvas = heatmapCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      // Set correct canvas dimensions once when heatmap is enabled
      const canvas = heatmapCanvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const w = container.clientWidth || 400;
        const h = container.clientHeight || 300;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      }
    }
  }, [showHeatmap]);

  // RAF loop — only redraws when new orderbook data arrives (heatmapDirtyRef).
  // No periodic forced redraws → zero spontaneous canvas clears.
  useEffect(() => {
    if (!showHeatmap) {
      if (heatmapRafRef.current != null) {
        cancelAnimationFrame(heatmapRafRef.current);
        heatmapRafRef.current = null;
      }
      return;
    }

    let rafId: number | null = null;

    function draw() {
      const canvas = heatmapCanvasRef.current;
      const series = candleSeriesRef.current;
      const engine = heatmapEngineRef.current;
      if (!canvas || !series || !engine) return;

      // Auto-sync canvas size from container — handles any timing edge case
      // (initial mount with 0×0 canvas, sort-mode remount, etc.)
      const container = containerRef.current;
      if (container) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
          canvas.width = w;
          canvas.height = h;
        }
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const levels = engine.getVisualLevels(heatmapSettingsRef.current, heatmapPriceRef.current);

      // Nothing to draw — clear and exit (don't leave stale bands)
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!levels.length) return;

      const W = canvas.width;
      const H = canvas.height;

      // Band height: pixel gap between adjacent price levels
      const sortedPrices = [...new Set(levels.map(l => l.price))].sort((a, b) => a - b);
      let bandH = 4;
      for (let i = 1; i < sortedPrices.length && i < 6; i++) {
        const y1 = series.priceToCoordinate(sortedPrices[i - 1]);
        const y2 = series.priceToCoordinate(sortedPrices[i]);
        if (y1 != null && y2 != null && Math.abs(y2 - y1) > 0) {
          bandH = Math.max(2, Math.min(Math.abs(y2 - y1), 40));
          break;
        }
      }

      for (const lvl of levels) {
        const y = series.priceToCoordinate(lvl.price);
        if (y == null || y < 0 || y > H) continue;
        ctx.fillStyle = heatColor(lvl.intensity, lvl.side, lvl.type, lvl.opacity);
        ctx.fillRect(0, y - bandH / 2, W, bandH);
      }
    }

    const loop = () => {
      // Only redraw when new data arrived — canvas is stable otherwise
      if (heatmapDirtyRef.current) {
        draw();
        heatmapDirtyRef.current = false;
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    heatmapRafRef.current = rafId;

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      heatmapRafRef.current = null;
    };
  }, [showHeatmap]); // ONLY showHeatmap — never restarts on price ticks

  // Keep refs in sync with state so closures always read current values
  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);
  useEffect(() => { marketTypeRef.current = marketType; }, [marketType]);

  const showMarketToggle = isModal || chartGridSize === 1;

  // ─── Shared WebSocket Subscription ──────────────────────────
  useEffect(() => {
    if (paused) return;

    subscribe(exchange, marketType, symbol, timeframe);

    if (showHeatmap) {
      console.log('[Chart] Subscribing to orderbook:', exchange, marketType, symbol);
      subscribe(exchange, marketType, symbol, undefined, 'orderbook');
    }

    return () => {
      unsubscribe(exchange, marketType, symbol, timeframe);
      if (showHeatmap) {
        console.log('[Chart] Unsubscribing from orderbook:', exchange, marketType, symbol);
        unsubscribe(exchange, marketType, symbol, undefined, 'orderbook');
      }
    };
  }, [symbol, exchange, timeframe, marketType, paused, showHeatmap, subscribe, unsubscribe]);

  // ─── Handle Incoming Candle Updates from Global Store ───────
  useEffect(() => {
    if (!latestCandle || paused) return;
    if (latestCandle.symbol !== symbol) return;
    if (latestCandle.timeframe !== timeframe) return;
    if (latestCandle.exchange && latestCandle.exchange !== exchange) return;
    if (latestCandle.marketType && latestCandle.marketType !== marketType) return;
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    if (!dataLoadedRef.current) return; // ignore WS updates until REST data is loaded

    const { open, high, low, close, volume, time: timestamp } = latestCandle;
    if (!isFinite(open) || !isFinite(high) || !isFinite(low) || !isFinite(close)) return;

    const time = (timestamp / 1000) as Time;
    try {
      candleSeriesRef.current.applyOptions({ priceFormat: getChartPriceFormat(close) });
      candleSeriesRef.current.update({ time, open, high, low, close });
      volumeSeriesRef.current.update({
        time,
        value: volume ?? 0,
        color: close >= open ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
      });
      setCurrentPrice(close);
    } catch { /* chart transitioning */ }
  }, [latestCandle, symbol, exchange, timeframe, paused]);

  // ─── Chart Initialization ───────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    readyRef.current = false;
    oldestTimeRef.current = null;
    allRawRef.current = [];
    loadingMoreRef.current = false;
    initialRangeSetRef.current = false;
    dataLoadedRef.current = false;
    setLoadingHistory(false);

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    }

    let cancelled = false;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;

    const initChart = async () => {
      const hasInitialData = initialData && initialData.length > 0;
      if (!hasInitialData) setLoading(true);

      const container = containerRef.current!;
      const chart = createChart(container, {
        width: container.clientWidth || container.offsetWidth || 400,
        height: container.clientHeight || container.offsetHeight || 300,
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
        timeScale: { borderColor: 'rgba(255,255,255,0.06)', timeVisible: true, secondsVisible: false, rightOffset: 3, fixLeftEdge: false, fixRightEdge: false, lockVisibleTimeRangeOnResize: true },
        handleScroll: { vertTouchDrag: false, mouseWheel: true, pressedMouseMove: true },
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true } },
        kineticScroll: { touch: true, mouse: false },
      });

      if (cancelled) { chart.remove(); return; }
      chartRef.current = chart;

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#22c55e', downColor: '#ef4444',
        borderUpColor: '#22c55e', borderDownColor: '#ef4444',
        wickUpColor: '#22c55e88', wickDownColor: '#ef444488',
        priceFormat: getChartPriceFormat(ticker?.lastPrice ?? currentPrice ?? undefined),
      });
      candleSeriesRef.current = candleSeries;

      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      volumeSeriesRef.current = volumeSeries;

      try {
        let raw: any[] = [];
        // Use initialData only if it matches the current timeframe
        if (initialData && initialData.length > 0 && (!initialTimeframe || initialTimeframe === timeframe)) {
          raw = initialData;
        } else {
          const resp = await fetch(
            `${API_BASE}/api/history?exchange=${exchange}&marketType=${marketType}&symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=300`
          );
          if (!cancelled && resp.ok) {
            const data = await resp.json();
            raw = data.data || [];
          }
        }
        if (raw.length && !cancelled) {
          allRawRef.current = raw;
          onDataLoaded?.(symbol, raw, timeframe);
          const { candles, volumes } = buildCandles(raw);
          console.log(`[Chart] ${symbol} raw=${raw.length} candles=${candles.length}`);
          if (candles.length > 0) {
            candleSeries.setData(candles);
            volumeSeries.setData(volumes);
            dataLoadedRef.current = true;
            const firstCandleTime = raw[0].time || raw[0].timestamp;
            oldestTimeRef.current = firstCandleTime / 1000;

            // Force chart to know its real size before setting range
            const w = container.clientWidth || container.offsetWidth;
            const h = container.clientHeight || container.offsetHeight;
            console.log(`[Chart] ${symbol} container=${w}x${h}`);
            if (w > 0 && h > 0) chart.applyOptions({ width: w, height: h });

            const from = Math.max(0, candles.length - INITIAL_VISIBLE_CANDLES);
            const to = candles.length + 3;
            console.log(`[Chart] ${symbol} setVisibleLogicalRange from=${from} to=${to}`);
            chart.timeScale().setVisibleLogicalRange({ from, to });
            initialRangeSetRef.current = true;

            const lastRaw = raw[raw.length - 1];
            candleSeries.applyOptions({ priceFormat: getChartPriceFormat(lastRaw.close) });
            setCurrentPrice(lastRaw.close);
            if (raw.length > 1) {
              setPriceChange(((lastRaw.close - raw[0].open) / raw[0].open) * 100);
            }
          }
        }
      } catch (err) {
        console.error('[Chart] Failed to fetch candles:', err);
      }

      if (cancelled) return;
      setLoading(false);
      readyTimer = setTimeout(() => { readyRef.current = true; }, 200);

      const handleRangeChange = (range: any) => {
        if (!range || !readyRef.current || loadingMoreRef.current || !oldestTimeRef.current) return;
        if (range.from > 30) return;

        if (loadingHistoryTimerRef.current) clearTimeout(loadingHistoryTimerRef.current);
        loadingHistoryTimerRef.current = setTimeout(async () => {
        if (!oldestTimeRef.current) return;
        loadingMoreRef.current = true;
        setLoadingHistory(true);
        try {
          const endTime = Math.floor(oldestTimeRef.current * 1000) - 1;
          const resp = await fetch(
            `${API_BASE}/api/history?exchange=${exchangeRef.current}&marketType=${marketTypeRef.current}&symbol=${encodeURIComponent(symbol)}&timeframe=${timeframeRef.current}&limit=300&endTime=${endTime}`
          );
          if (!resp.ok) { loadingMoreRef.current = false; setLoadingHistory(false); return; }

          const data = await resp.json();
          const older: any[] = data.data || [];
          if (!older.length) { loadingMoreRef.current = false; setLoadingHistory(false); return; }

          const previousRange = chart.timeScale().getVisibleLogicalRange();
          const previousLength = buildCandles(allRawRef.current).candles.length;
          allRawRef.current = [...older, ...allRawRef.current];
          const { candles, volumes } = buildCandles(allRawRef.current);
          if (candleSeriesRef.current && volumeSeriesRef.current && candles.length > 0) {
            candleSeriesRef.current.setData(candles);
            volumeSeriesRef.current.setData(volumes);
            const firstOlderTime = older[0].time || older[0].timestamp;
            oldestTimeRef.current = firstOlderTime / 1000;
            if (previousRange) {
              const addedBars = candles.length - previousLength;
              chart.timeScale().setVisibleLogicalRange({
                from: previousRange.from + addedBars,
                to: previousRange.to + addedBars,
              });
            }
          }
        } catch { /* silent */ }
        loadingMoreRef.current = false;
        setLoadingHistory(false);
        }, 150);
      };

      chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);
    };

    rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      if (isModal) {
        readyTimer = setTimeout(() => {
          if (!cancelled) initChart();
        }, 300);
      } else {
        initChart();
      }
    });

    return () => {
      cancelled = true;
      readyRef.current = false;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      if (readyTimer) { clearTimeout(readyTimer); readyTimer = null; }
      if (loadingHistoryTimerRef.current) { clearTimeout(loadingHistoryTimerRef.current); loadingHistoryTimerRef.current = null; }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        volumeSeriesRef.current = null;
      }
    };
  }, [symbol, exchange, timeframe, marketType, isModal]);

  // ─── Optimized Resize Observer ──────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width === 0 || height === 0) return;

      if (resizeFrameRef.current != null) return;

      resizeFrameRef.current = requestAnimationFrame(() => {
        if (chartRef.current) {
          chartRef.current.applyOptions({ width, height });
        }
        // Sync canvas size — independent of whether chart is initialized
        const canvas = heatmapCanvasRef.current;
        if (canvas && (canvas.width !== width || canvas.height !== height)) {
          canvas.width = width;
          canvas.height = height;
          heatmapDirtyRef.current = true;
        }
        resizeFrameRef.current = null;
      });
    });
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      if (resizeFrameRef.current != null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, []);

  const livePrice = ticker?.lastPrice ?? currentPrice;
  const liveChange = ticker?.priceChangePercent24h ?? priceChange;
  const isPositive = (liveChange ?? 0) >= 0;
  const base = symbol.split('/')[0];

  return (
    <motion.div
      initial={isModal ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className="glass-card overflow-hidden flex flex-col relative ambient-glow h-full"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 gap-2">
        {/* Left: badge + symbol */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0"
            style={{
              background: isPositive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: isPositive ? '#22c55e' : '#ef4444',
            }}
          >
            {base.charAt(0)}
          </div>
          <div className="leading-tight">
            <div className="text-xs font-bold text-text-primary">{symbol}</div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider">{exchange}</div>
          </div>
        </div>

        {/* Center: TF pills */}
        <div className="flex items-center gap-0.5 flex-1 min-w-0">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-1.5 py-0.5 text-[10px] rounded font-mono transition-colors cursor-pointer shrink-0
                ${timeframe === tf
                  ? 'bg-accent/20 text-accent-light'
                  : 'text-text-muted hover:text-text-secondary'
                }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Spot/Futures toggle — only in modal or single mode */}
        {showMarketToggle && (
          <div className="flex items-center gap-0.5 bg-bg-primary/40 rounded-lg p-0.5 border border-border shrink-0">
            {(['spot', 'futures'] as const).map(mt => (
              <button
                key={mt}
                onClick={() => setMarketType(mt)}
                className={`px-2 py-0.5 text-[10px] rounded font-medium capitalize transition-colors cursor-pointer
                  ${marketType === mt
                    ? 'bg-accent/15 text-accent-light'
                    : 'text-text-muted hover:text-text-secondary'
                  }`}
              >
                {mt}
              </button>
            ))}
          </div>
        )}

        {/* Right: price + expand */}
        <div className="flex items-center gap-1.5 shrink-0">
          {livePrice != null && (
            <div className="text-right">
              <div className="text-xs font-bold font-mono text-text-primary leading-tight">
                ${formatPrice(livePrice)}
              </div>
              {liveChange != null && (
                <div className={`text-[10px] font-bold font-mono leading-tight ${isPositive ? 'text-positive' : 'text-negative'}`}>
                  {isPositive ? '+' : ''}{(liveChange ?? 0).toFixed(2)}%
                </div>
              )}
            </div>
          )}
          <button onClick={onExpand} className="p-1 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer">
            {isModal ? <X className="w-3.5 h-3.5 text-text-muted" /> : <Maximize2 className="w-3.5 h-3.5 text-text-muted" />}
          </button>
        </div>
      </div>

      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/50 z-10">
            <Loader2 className="w-6 h-6 text-accent animate-spin" />
          </div>
        )}
        {loadingHistory && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-bg-primary/80 border border-border rounded-full px-3 py-1 text-[10px] text-text-muted">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading history...
          </div>
        )}
        {/* Heatmap canvas — always mounted, hidden when off, never re-created */}
        <canvas
          ref={heatmapCanvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 1,
            display: showHeatmap ? 'block' : 'none',
            filter: 'blur(3px)',
          }}
        />
        <div ref={containerRef} className="w-full h-full" style={{ contain: 'strict', position: 'relative', zIndex: 2 }} />
        {/* Heatmap controls overlay */}
        {showHeatmap && <HeatmapControls />}
      </div>
    </motion.div>
  );
}
