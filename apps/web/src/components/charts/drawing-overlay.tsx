'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useDrawingStore } from '@/stores';
import { 
  makeInstrumentKey, 
  AnyDrawing, 
  InstrumentMarketType,
  DrawingPoint
} from '@/lib/drawings/models';
import { 
  ChartProjectionContext,
  projectHorizontalLine,
  projectVerticalLine,
  projectTrendline,
  projectRectangle,
  hitTestPoint,
  hitTestLine,
  hitTestRectangleHandle
} from '@/lib/drawings/engine';
import { cn } from '@/lib/utils';
import { getLocalOverlayPoint, panLogicalRange } from './drawing-overlay-helpers';

interface DrawingOverlayProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  exchange: string;
  marketType: InstrumentMarketType;
  symbol: string;
  compact?: boolean;
}

interface InteractionState {
  type: 'idle' | 'creating' | 'moving' | 'editing_handle' | 'panning';
  drawingId?: string;
  handleId?: 'p1' | 'p2';
  startPoint?: { x: number; y: number; time: number; price: number };
  panStartX?: number;
  panStartRange?: { from: number; to: number } | null;
}

export function DrawingOverlay({ 
  chart, 
  candleSeries, 
  exchange, 
  marketType, 
  symbol, 
  compact 
}: DrawingOverlayProps) {
  const containerRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [renderVersion, setRenderVersion] = useState(0);
  const [interaction, setInteraction] = useState<InteractionState>({ type: 'idle' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { 
    byId, 
    byInstrument, 
    selectedTool, 
    setSelectedTool,
    hidden, 
    upsertDrawing, 
    removeDrawing 
  } = useDrawingStore();

  const instrumentKey = useMemo(() => makeInstrumentKey(exchange, marketType, symbol), [exchange, marketType, symbol]);
  const drawings = useMemo(() => {
    const ids = byInstrument[instrumentKey] ?? [];
    return ids.map(id => byId[id]).filter(Boolean) as AnyDrawing[];
  }, [byId, byInstrument, instrumentKey]);

  // Sync size with container
  useEffect(() => {
    if (!chart) return;
    const container = containerRef.current?.parentElement;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [chart]);

  // Redraw on chart changes (scroll, scale)
  useEffect(() => {
    if (!chart) return;
    const bump = () => setRenderVersion(v => v + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(bump);
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(bump);
  }, [chart]);

  const getProjectionContext = useCallback((): ChartProjectionContext | null => {
    if (!chart || !candleSeries || size.width === 0) return null;
    return {
      width: size.width,
      height: size.height,
      timeToX: (time: number) => chart.timeScale().timeToCoordinate(time as any),
      priceToY: (price: number) => candleSeries.priceToCoordinate(price),
    };
  }, [chart, candleSeries, size]);

  const screenToValue = useCallback((x: number, y: number): DrawingPoint | null => {
    if (!chart || !candleSeries) return null;
    const time = chart.timeScale().coordinateToTime(x);
    const price = candleSeries.coordinateToPrice(y);
    if (time === null || price === null) return null;
    return { time: typeof time === 'number' ? time : (time as any).timestamp || 0, price };
  }, [chart, candleSeries]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (hidden || !chart || !candleSeries) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { x, y } = getLocalOverlayPoint(e.clientX, e.clientY, rect, size.width, size.height);

    const ctx = getProjectionContext();
    if (!ctx) return;

    // 1. Check handles of selected drawing
    if (selectedId) {
      const drawing = byId[selectedId];
      if (drawing && (drawing.kind === 'trendline' || drawing.kind === 'rectangle' || drawing.kind === 'ruler')) {
        const p1x = ctx.timeToX(drawing.p1.time);
        const p1y = ctx.priceToY(drawing.p1.price);
        const p2x = ctx.timeToX(drawing.p2.time);
        const p2y = ctx.priceToY(drawing.p2.price);

        if (p1x !== null && p1y !== null && hitTestPoint(x, y, p1x, p1y, 8)) {
          setInteraction({ type: 'editing_handle', drawingId: selectedId, handleId: 'p1' });
          return;
        }
        if (p2x !== null && p2y !== null && hitTestPoint(x, y, p2x, p2y, 8)) {
          setInteraction({ type: 'editing_handle', drawingId: selectedId, handleId: 'p2' });
          return;
        }
      }
    }

    // 2. Check hit test for existing drawings to select/move
    if (selectedTool === 'cursor') {
      for (const drawing of [...drawings].reverse()) {
        let hit = false;
        if (drawing.kind === 'horizontal_line' || drawing.kind === 'signal_level') {
          const dy = ctx.priceToY(drawing.price);
          if (dy !== null && Math.abs(y - dy) < 10) hit = true;
        } else if (drawing.kind === 'vertical_line') {
          const dx = ctx.timeToX(drawing.time);
          if (dx !== null && Math.abs(x - dx) < 10) hit = true;
        } else if (drawing.kind === 'trendline' || drawing.kind === 'ruler') {
          const p1x = ctx.timeToX(drawing.p1.time);
          const p1y = ctx.priceToY(drawing.p1.price);
          const p2x = ctx.timeToX(drawing.p2.time);
          const p2y = ctx.priceToY(drawing.p2.price);
          if (p1x !== null && p1y !== null && p2x !== null && p2y !== null) {
            hit = hitTestLine(x, y, p1x, p1y, p2x, p2y, 10);
          }
        } else if (drawing.kind === 'rectangle') {
          const p1x = ctx.timeToX(drawing.p1.time);
          const p1y = ctx.priceToY(drawing.p1.price);
          const p2x = ctx.timeToX(drawing.p2.time);
          const p2y = ctx.priceToY(drawing.p2.price);
          if (p1x !== null && p1y !== null && p2x !== null && p2y !== null) {
             const minX = Math.min(p1x, p2x);
             const maxX = Math.max(p1x, p2x);
             const minY = Math.min(p1y, p2y);
             const maxY = Math.max(p1y, p2y);
             // Hit if near border
             const nearBorder = Math.abs(x - minX) < 10 || Math.abs(x - maxX) < 10 || Math.abs(y - minY) < 10 || Math.abs(y - maxY) < 10;
             if (nearBorder && x >= minX - 10 && x <= maxX + 10 && y >= minY - 10 && y <= maxY + 10) hit = true;
          }
        }

        if (hit) {
          setSelectedId(drawing.id);
          const val = screenToValue(x, y);
          if (val) {
            setInteraction({ 
              type: 'moving', 
              drawingId: drawing.id, 
              startPoint: { x, y, ...val } 
            });
          }
          return;
        }
      }
      setSelectedId(null);
      e.currentTarget.setPointerCapture(e.pointerId);
      setInteraction({
        type: 'panning',
        panStartX: x,
        panStartRange: chart.timeScale().getVisibleLogicalRange(),
      });
      return;
    } 
    // 3. Create new drawing
    else {
      const val = screenToValue(x, y);
      if (!val) return;

      const id = `draw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const now = Date.now();
      const base = {
        id,
        instrumentKey,
        exchange,
        marketType,
        symbol,
        visible: true,
        locked: false,
        zIndex: 0,
        createdAt: now,
        updatedAt: now,
        style: {
          color: selectedTool === 'signal_level' ? '#f59e0b' : '#3b82f6',
          lineWidth: 2,
          lineStyle: 'solid' as const,
          fillOpacity: 0.1
        }
      };

      let newDrawing: AnyDrawing;
      if (selectedTool === 'horizontal_line') {
        newDrawing = { ...base, kind: 'horizontal_line', price: val.price } as any;
      } else if (selectedTool === 'signal_level') {
        newDrawing = { ...base, kind: 'signal_level', price: val.price, triggered: false, triggeredAt: null, armed: true } as any;
      } else if (selectedTool === 'vertical_line') {
        newDrawing = { ...base, kind: 'vertical_line', time: val.time } as any;
      } else if (selectedTool === 'trendline' || selectedTool === 'rectangle' || selectedTool === 'ruler') {
        newDrawing = { ...base, kind: selectedTool as any, p1: val, p2: val } as any;
        setInteraction({ type: 'creating', drawingId: id });
      } else return;

      upsertDrawing(newDrawing);
      setSelectedId(id);
      if (selectedTool === 'horizontal_line' || selectedTool === 'signal_level' || selectedTool === 'vertical_line') {
        setSelectedTool('cursor');
      }
    }

    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { x, y } = getLocalOverlayPoint(e.clientX, e.clientY, rect, size.width, size.height);

    if (interaction.type === 'idle') {
      // Handle hover
      const ctx = getProjectionContext();
      if (!ctx) return;
      let hovered: string | null = null;
      for (const drawing of [...drawings].reverse()) {
        let hit = false;
        if (drawing.kind === 'horizontal_line' || drawing.kind === 'signal_level') {
          const dy = ctx.priceToY(drawing.price);
          if (dy !== null && Math.abs(y - dy) < 10) hit = true;
        } else if (drawing.kind === 'vertical_line') {
          const dx = ctx.timeToX(drawing.time);
          if (dx !== null && Math.abs(x - dx) < 10) hit = true;
        } else if (drawing.kind === 'trendline' || drawing.kind === 'ruler') {
          const p1x = ctx.timeToX(drawing.p1.time);
          const p1y = ctx.priceToY(drawing.p1.price);
          const p2x = ctx.timeToX(drawing.p2.time);
          const p2y = ctx.priceToY(drawing.p2.price);
          if (p1x !== null && p1y !== null && p2x !== null && p2y !== null) {
            hit = hitTestLine(x, y, p1x, p1y, p2x, p2y, 10);
          }
        } else if (drawing.kind === 'rectangle') {
          const p1x = ctx.timeToX(drawing.p1.time);
          const p1y = ctx.priceToY(drawing.p1.price);
          const p2x = ctx.timeToX(drawing.p2.time);
          const p2y = ctx.priceToY(drawing.p2.price);
          if (p1x !== null && p1y !== null && p2x !== null && p2y !== null) {
             const minX = Math.min(p1x, p2x);
             const maxX = Math.max(p1x, p2x);
             const minY = Math.min(p1y, p2y);
             const maxY = Math.max(p1y, p2y);
             const nearBorder = Math.abs(x - minX) < 10 || Math.abs(x - maxX) < 10 || Math.abs(y - minY) < 10 || Math.abs(y - maxY) < 10;
             if (nearBorder && x >= minX - 10 && x <= maxX + 10 && y >= minY - 10 && y <= maxY + 10) hit = true;
          }
        }
        if (hit) { hovered = drawing.id; break; }
      }
      setHoveredId(hovered);
      return;
    }

    const val = screenToValue(x, y);

    if (interaction.type === 'panning' && interaction.panStartRange && chart) {
      const nextRange = panLogicalRange(interaction.panStartRange, x - interaction.panStartX!, size.width);
      if (nextRange) {
        chart.timeScale().setVisibleLogicalRange(nextRange);
      }
      return;
    }

    if (!val) return;

    if (interaction.type === 'creating' && interaction.drawingId) {
      const drawing = byId[interaction.drawingId];
      if (drawing && (drawing.kind === 'trendline' || drawing.kind === 'rectangle' || drawing.kind === 'ruler')) {
        upsertDrawing({ ...drawing, p2: val, updatedAt: Date.now() });
      }
    } else if (interaction.type === 'editing_handle' && interaction.drawingId && interaction.handleId) {
      const drawing = byId[interaction.drawingId];
      if (drawing && (drawing.kind === 'trendline' || drawing.kind === 'rectangle' || drawing.kind === 'ruler')) {
        upsertDrawing({ ...drawing, [interaction.handleId]: val, updatedAt: Date.now() });
      }
    } else if (interaction.type === 'moving' && interaction.drawingId && interaction.startPoint) {
      const drawing = byId[interaction.drawingId];
      if (!drawing) return;

      const dTime = val.time - interaction.startPoint.time;
      const dPrice = val.price - interaction.startPoint.price;

      if (drawing.kind === 'horizontal_line' || drawing.kind === 'signal_level') {
        upsertDrawing({ ...drawing, price: drawing.price + dPrice, updatedAt: Date.now() });
      } else if (drawing.kind === 'vertical_line') {
        upsertDrawing({ ...drawing, time: drawing.time + dTime, updatedAt: Date.now() });
      } else if (drawing.kind === 'trendline' || drawing.kind === 'rectangle' || drawing.kind === 'ruler') {
        upsertDrawing({ 
          ...drawing, 
          p1: { time: drawing.p1.time + dTime, price: drawing.p1.price + dPrice },
          p2: { time: drawing.p2.time + dTime, price: drawing.p2.price + dPrice },
          updatedAt: Date.now() 
        });
      }
      setInteraction(prev => ({ ...prev, startPoint: { x, y, ...val } }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (interaction.type === 'creating') {
      setSelectedTool('cursor');
    }
    setInteraction({ type: 'idle' });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          removeDrawing(selectedId);
          setSelectedId(null);
        }
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
        setSelectedTool('cursor');
        setInteraction({ type: 'idle' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, removeDrawing, setSelectedTool]);

  const ctx = getProjectionContext();
  if (!ctx || hidden) return (
    <svg
      ref={containerRef}
      className="absolute inset-0 z-30 pointer-events-none"
      width="100%"
      height="100%"
      overflow="visible"
    />
  );

  return (
    <svg
      ref={containerRef}
      className={cn(
        "absolute inset-0 z-30 select-none outline-none",
        selectedTool === 'cursor' ? "cursor-grab active:cursor-grabbing" : "cursor-cell"
      )}
      width={size.width}
      height={size.height}
      overflow="visible"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <defs>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {drawings.map(drawing => {
        const isSelected = selectedId === drawing.id;
        const isHovered = hoveredId === drawing.id;
        const color = drawing.style.color;
        const opacity = (isSelected || isHovered) ? 1 : 0.7;
        const strokeWidth = (isSelected || isHovered) ? drawing.style.lineWidth + 1 : drawing.style.lineWidth;

        if (drawing.kind === 'horizontal_line' || drawing.kind === 'signal_level') {
          const line = projectHorizontalLine(drawing, ctx);
          if (!line) return null;
          return (
            <g key={drawing.id}>
              <line
                x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeOpacity={opacity}
                strokeDasharray={drawing.kind === 'signal_level' ? "4 4" : undefined}
                filter={isSelected ? "url(#glow)" : undefined}
              />
              {drawing.kind === 'signal_level' && !compact && (
                <text 
                  x={10} y={line.y1 - 5} 
                  fill={color} fontSize="10" 
                  className="font-mono pointer-events-none"
                  fillOpacity={opacity}
                >
                  {drawing.triggered ? "TRIGGERED" : "SIGNAL"}
                </text>
              )}
            </g>
          );
        }

        if (drawing.kind === 'vertical_line') {
          const line = projectVerticalLine(drawing, ctx);
          if (!line) return null;
          return (
            <line
              key={drawing.id}
              x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeOpacity={opacity}
              filter={isSelected ? "url(#glow)" : undefined}
            />
          );
        }

        if (drawing.kind === 'trendline' || drawing.kind === 'ruler') {
          const line = projectTrendline(drawing, ctx);
          if (!line) return null;
          return (
            <g key={drawing.id}>
              <line
                x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeOpacity={opacity}
                filter={isSelected ? "url(#glow)" : undefined}
              />
              {isSelected && (
                <>
                  <circle cx={line.x1} cy={line.y1} r={4} fill="#fff" stroke={color} strokeWidth={2} />
                  <circle cx={line.x2} cy={line.y2} r={4} fill="#fff" stroke={color} strokeWidth={2} />
                </>
              )}
              {drawing.kind === 'ruler' && (
                <text 
                  x={(line.x1 + line.x2) / 2} y={(line.y1 + line.y2) / 2 - 10} 
                  fill={color} fontSize="10" 
                  className="font-mono text-center pointer-events-none"
                  textAnchor="middle"
                  fillOpacity={opacity}
                >
                  {Math.abs(((drawing.p2.price - drawing.p1.price) / drawing.p1.price) * 100).toFixed(2)}%
                </text>
              )}
            </g>
          );
        }

        if (drawing.kind === 'rectangle') {
          const rect = projectRectangle(drawing, ctx);
          if (!rect) return null;
          return (
            <g key={drawing.id}>
              <rect
                x={rect.x} y={rect.y} width={rect.width} height={rect.height}
                fill={color}
                fillOpacity={drawing.style.fillOpacity}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeOpacity={opacity}
                filter={isSelected ? "url(#glow)" : undefined}
              />
              {isSelected && (
                <>
                  <circle cx={rect.x1} cy={rect.y1} r={4} fill="#fff" stroke={color} strokeWidth={2} />
                  <circle cx={rect.x2} cy={rect.y2} r={4} fill="#fff" stroke={color} strokeWidth={2} />
                </>
              )}
            </g>
          );
        }

        return null;
      })}
    </svg>
  );
}
