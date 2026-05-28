'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, HistogramData, Time } from 'lightweight-charts';
import { io, Socket } from 'socket.io-client';
import { useMarketStore } from '@/stores';
import { motion } from 'framer-motion';
import { Maximize2, X, Loader2 } from 'lucide-react';

interface ChartCardProps {
  symbol: string;
  index: number;
  onExpand?: () => void;
  isModal?: boolean;
}

interface CandleState {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function buildCandles(raw: any[]): { candles: CandlestickData[]; volumes: HistogramData[] } {
  const candles: CandlestickData[] = raw.map((k) => ({
    time: (k.timestamp / 1000) as Time,
    open: k.open, high: k.high, low: k.low, close: k.close,
  }));
  const volumes: HistogramData[] = raw.map((k) => ({
    time: (k.timestamp / 1000) as Time,
    value: k.volume,
    color: k.close >= k.open ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
  }));
  return { candles, volumes };
}

export function ChartCard({ symbol, index, onExpand, isModal = false }: ChartCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const lastCandleRef = useRef<CandleState | null>(null);
  const oldestTimeRef = useRef<number | null>(null);
  const allRawRef = useRef<any[]>([]);
  const loadingMoreRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);

  const { selectedExchange, selectedTimeframe, getTicker } = useMarketStore();
  const [loading, setLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number | null>(null);

  const ticker = getTicker(symbol, selectedExchange);

  // ── Init chart + load history ──────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const initChart = async () => {
      setLoading(true);
      lastCandleRef.current = null;
      oldestTimeRef.current = null;
      allRawRef.current = [];

      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        volumeSeriesRef.current = null;
      }

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
        if (resp.ok) {
          const data = await resp.json();
          const raw: any[] = data.data || [];
          if (raw.length) {
            allRawRef.current = raw;
            const { candles, volumes } = buildCandles(raw);
            candleSeries.setData(candles);
            volumeSeries.setData(volumes);

            const lastRaw = raw[raw.length - 1];
            lastCandleRef.current = {
              time: lastRaw.timestamp / 1000,
              open: lastRaw.open, high: lastRaw.high,
              low: lastRaw.low, close: lastRaw.close,
              volume: lastRaw.volume,
            };
            oldestTimeRef.current = raw[0].timestamp / 1000;

            setCurrentPrice(lastRaw.close);
            if (raw.length > 1) {
              setPriceChange(
                ((lastRaw.close - raw[0].open) / raw[0].open) * 100
              );
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch candles:', err);
      }

      chart.timeScale().fitContent();
      setLoading(false);
    };

    initChart();

    return () => {
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

  // ── Socket.IO: real-time candle updates via WS ─────────────
  useEffect(() => {
    const socket = io('/market', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('subscribe', {
        channel: 'candle',
        symbol,
        exchange: selectedExchange,
        timeframe: selectedTimeframe,
      });
    });

    socket.on('candle', (candle: any) => {
      if (candle.symbol !== symbol) return;
      if (!candleSeriesRef.current) return;

      const candleTime = candle.timestamp / 1000;

      candleSeriesRef.current.update({
        time: candleTime as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      });

      volumeSeriesRef.current?.update({
        time: candleTime as Time,
        value: candle.volume,
        color: candle.close >= candle.open ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
      });

      // Update last candle ref
      if (!lastCandleRef.current || candleTime >= lastCandleRef.current.time) {
        lastCandleRef.current = {
          time: candleTime,
          open: candle.open, high: candle.high,
          low: candle.low, close: candle.close,
          volume: candle.volume,
        };
        setCurrentPrice(candle.close);
      }
    });

    return () => {
      socket.emit('unsubscribe', {
        channel: 'candle',
        symbol,
        exchange: selectedExchange,
        timeframe: selectedTimeframe,
      });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [symbol, selectedExchange, selectedTimeframe]);

  // ── Intra-candle update from ticker (fills gaps between WS events) ──
  useEffect(() => {
    if (!candleSeriesRef.current || !ticker?.price || !lastCandleRef.current) return;

    const price = ticker.price;
    const last = lastCandleRef.current;
    const newHigh = Math.max(last.high, price);
    const newLow = Math.min(last.low, price);

    candleSeriesRef.current.update({
      time: last.time as Time,
      open: last.open,
      high: newHigh,
      low: newLow,
      close: price,
    });

    volumeSeriesRef.current?.update({
      time: last.time as Time,
      value: last.volume,
      color: price >= last.open ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
    });

    lastCandleRef.current = { ...last, high: newHigh, low: newLow, close: price };
    setCurrentPrice(price);
  }, [ticker?.price]);

  // ── Historical scroll: load more when user scrolls left ────
  useEffect(() => {
    if (!chartRef.current) return;

    const handleRangeChange = async (range: any) => {
      if (!range || loadingMoreRef.current || !oldestTimeRef.current) return;
      if (range.from > 10) return; // not near left edge

      loadingMoreRef.current = true;
      try {
        const endTime = oldestTimeRef.current * 1000 - 1;
        const resp = await fetch(
          `/api/market/candles/${symbol.replace('/', '-')}?timeframe=${selectedTimeframe}&exchange=${selectedExchange}&limit=300&endTime=${endTime}`
        );
        if (!resp.ok) { loadingMoreRef.current = false; return; }

        const data = await resp.json();
        const older: any[] = data.data || [];
        if (!older.length) { loadingMoreRef.current = false; return; }

        // Prepend older candles and re-render
        allRawRef.current = [...older, ...allRawRef.current];
        const { candles, volumes } = buildCandles(allRawRef.current);
        candleSeriesRef.current?.setData(candles);
        volumeSeriesRef.current?.setData(volumes);
        oldestTimeRef.current = older[0].timestamp / 1000;
      } catch {
        // silent
      }
      loadingMoreRef.current = false;
    };

    chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);

    return () => {
      chartRef.current?.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeChange);
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
      {/* Header */}
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

          <button
            onClick={onExpand}
            className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer"
          >
            {isModal ? <X className="w-4 h-4 text-text-muted" /> : <Maximize2 className="w-4 h-4 text-text-muted" />}
          </button>
        </div>
      </div>

      {/* Chart */}
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
