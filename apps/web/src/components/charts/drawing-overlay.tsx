'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useDrawingStore } from '@/stores';
import {
  AnyDrawing,
  DrawingPoint,
  InstrumentMarketType,
  makeInstrumentKey,
} from '@/lib/drawings/models';
import {
  ChartProjectionContext,
  projectHorizontalLine,
  projectRectangle,
  projectTrendline,
} from '@/lib/drawings/engine';
import { formatPrice } from '@/lib/format';

interface DrawingOverlayProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  hostRef: React.RefObject<HTMLDivElement | null>;
  lastBarTime: number | null;
  exchange: string;
  marketType: InstrumentMarketType;
  symbol: string;
  compact?: boolean;
}

interface CreationState {
  drawingId: string;
  kind: 'trendline' | 'rectangle';
}

function createDrawingId() {
  return `draw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function DrawingOverlay({
  chart,
  candleSeries,
  hostRef,
  lastBarTime,
  exchange,
  marketType,
  symbol,
  compact,
}: DrawingOverlayProps) {
  const overlayRef = useRef<SVGSVGElement>(null);
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 });
  const [renderTick, setRenderTick] = useState(0);
  const [creation, setCreation] = useState<CreationState | null>(null);

  const {
    byId,
    byInstrument,
    hidden,
    selectedTool,
    upsertDrawing,
  } = useDrawingStore();

  const instrumentKey = useMemo(
    () => makeInstrumentKey(exchange, marketType, symbol),
    [exchange, marketType, symbol],
  );

  const drawings = useMemo(() => {
    const ids = byInstrument[instrumentKey] ?? [];
    return ids
      .map((id) => byId[id])
      .filter(Boolean)
      .filter((drawing): drawing is AnyDrawing => {
        return drawing.kind === 'horizontal_line'
          || drawing.kind === 'signal_level'
          || drawing.kind === 'trendline'
          || drawing.kind === 'rectangle';
      });
  }, [byId, byInstrument, instrumentKey]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const sync = () => {
      const rect = host.getBoundingClientRect();
      setHostSize({ width: rect.width, height: rect.height });
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(host);

    return () => observer.disconnect();
  }, [hostRef]);

  useEffect(() => {
    if (!chart) return;

    const bump = () => setRenderTick((value) => value + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(bump);
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(bump);
  }, [chart]);

  const rightPriceScaleWidth = chart ? chart.priceScale('right').width() : 0;
  const timeScaleWidth = chart ? chart.timeScale().width() : 0;
  const timeScaleHeight = chart ? chart.timeScale().height() : 0;
  const paneWidth = Math.max(0, Math.min(hostSize.width, timeScaleWidth || (hostSize.width - rightPriceScaleWidth)));
  const paneLeft = Math.max(0, hostSize.width - rightPriceScaleWidth - paneWidth);
  const paneHeight = Math.max(0, hostSize.height - timeScaleHeight);
  const clipPathId = useMemo(
    () => `drawing-pane-${instrumentKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    [instrumentKey],
  );

  const projectionContext = useMemo<ChartProjectionContext | null>(() => {
    if (!chart || !candleSeries || paneWidth <= 0 || paneHeight <= 0) {
      return null;
    }

    const lastBarX =
      lastBarTime === null ? null : chart.timeScale().timeToCoordinate(lastBarTime as any);
    const lastRealLogical =
      lastBarX === null ? null : chart.timeScale().coordinateToLogical(lastBarX);

    return {
      width: paneWidth,
      height: paneHeight,
      timeToX: (time: number) => {
        const x = chart.timeScale().timeToCoordinate(time as any);
        return x === null ? null : x - paneLeft;
      },
      logicalToX: (logical: number) => {
        const x = chart.timeScale().logicalToCoordinate(logical as any);
        return x === null ? null : x - paneLeft;
      },
      lastRealLogical: lastRealLogical === null ? null : Number(lastRealLogical),
      priceToY: (price: number) => candleSeries.priceToCoordinate(price),
    };
  }, [chart, candleSeries, lastBarTime, paneHeight, paneLeft, paneWidth, renderTick]);

  const screenToValue = useCallback((clientX: number, clientY: number): DrawingPoint | null => {
    if (!chart || !candleSeries || !hostRef.current || !projectionContext || paneWidth <= 0 || paneHeight <= 0) {
      return null;
    }

    const rect = hostRef.current.getBoundingClientRect();
    const chartX = clientX - rect.left;
    const x = chartX - paneLeft;
    const y = clientY - rect.top;

    if (x < 0 || y < 0 || x > paneWidth || y > paneHeight) {
      return null;
    }

    const logical = chart.timeScale().coordinateToLogical(chartX);
    const time = chart.timeScale().coordinateToTime(chartX);
    const price = candleSeries.coordinateToPrice(y);

    if ((time === null && logical === null) || price === null) {
      return null;
    }

    let futureOffset: number | undefined;
    if (time === null) {
      if (logical === null || projectionContext.lastRealLogical === null) {
        return null;
      }

      const offset = Number(logical) - projectionContext.lastRealLogical;
      if (offset < 0) {
        return null;
      }

      futureOffset = offset;
    }

    return {
      time: time === null ? 0 : (typeof time === 'number' ? time : (time as any).timestamp || 0),
      price,
      futureOffset,
    };
  }, [chart, candleSeries, hostRef, paneHeight, paneLeft, paneWidth, projectionContext]);

  const makeBaseDrawing = useCallback((id: string) => ({
    id,
    instrumentKey,
    exchange,
    marketType,
    symbol,
    visible: true,
    locked: false,
    zIndex: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    style: {
      color: '#3b82f6',
      lineWidth: 2,
      lineStyle: 'solid' as const,
      fillOpacity: 0.12,
    },
  }), [exchange, instrumentKey, marketType, symbol]);

  const handlePointerDown = (event: React.PointerEvent<SVGElement>) => {
    if (!projectionContext || hidden) return;
    if (selectedTool === 'cursor') return;

    const point = screenToValue(event.clientX, event.clientY);
    if (!point) return;

    const id = createDrawingId();
    const base = makeBaseDrawing(id);

    if (selectedTool === 'horizontal_line') {
      upsertDrawing({
        ...base,
        kind: 'horizontal_line',
        price: point.price,
      } as AnyDrawing);
      return;
    }

    if (selectedTool === 'trendline' || selectedTool === 'rectangle') {
      upsertDrawing({
        ...base,
        kind: selectedTool,
        p1: point,
        p2: point,
      } as AnyDrawing);

      setCreation({
        drawingId: id,
        kind: selectedTool,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<SVGElement>) => {
    if (!creation) return;

    const current = byId[creation.drawingId];
    if (!current || (current.kind !== 'trendline' && current.kind !== 'rectangle')) {
      return;
    }

    const point = screenToValue(event.clientX, event.clientY);
    if (!point) return;

    upsertDrawing({
      ...current,
      p2: point,
      updatedAt: Date.now(),
    });
  };

  const forwardWheelToHost = (event: React.WheelEvent<SVGRectElement>) => {
    const host = hostRef.current;
    if (!host) return;

    host.dispatchEvent(new WheelEvent('wheel', {
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      clientX: event.clientX,
      clientY: event.clientY,
      bubbles: true,
      cancelable: true,
    }));
  };

  const finishCreation = (event: React.PointerEvent<SVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setCreation(null);
  };

  if (!projectionContext || hidden || paneWidth <= 0 || paneHeight <= 0) {
    return null;
  }

  return (
    <svg
      ref={overlayRef}
      className="absolute left-0 top-0 z-30 select-none pointer-events-none"
      width={hostSize.width}
      height={hostSize.height}
      style={{
        width: hostSize.width,
        height: hostSize.height,
      }}
    >
      <defs>
        <clipPath id={clipPathId}>
          <rect x={paneLeft} y={0} width={paneWidth} height={paneHeight} />
        </clipPath>
      </defs>

      {selectedTool !== 'cursor' && (
        <rect
          x={paneLeft}
          y={0}
          width={paneWidth}
          height={paneHeight}
          fill="transparent"
          pointerEvents="auto"
          onWheel={forwardWheelToHost}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishCreation}
          onPointerCancel={finishCreation}
          onPointerLeave={(event) => {
            if (creation) {
              finishCreation(event);
            }
          }}
        />
      )}

      <g clipPath={`url(#${clipPathId})`}>
        {drawings.map((drawing) => {
        if (drawing.kind === 'horizontal_line' || drawing.kind === 'signal_level') {
          const line = projectHorizontalLine(drawing, projectionContext);
          if (!line) return null;

          return (
            <g key={drawing.id}>
              <line
                x1={line.x1 + paneLeft}
                y1={line.y1}
                x2={line.x2 + paneLeft}
                y2={line.y2}
                stroke={drawing.style.color}
                strokeWidth={drawing.style.lineWidth}
                strokeDasharray={drawing.kind === 'signal_level' ? '5 4' : undefined}
              />
              {!compact && (
                <text
                  x={Math.max(48, line.x2 + paneLeft - 8)}
                  y={line.y1 - 6}
                  fill={drawing.style.color}
                  fontSize="10"
                  textAnchor="end"
                  className="font-mono pointer-events-none"
                >
                  {formatPrice(drawing.price)}
                </text>
              )}
            </g>
          );
        }

        if (drawing.kind === 'trendline') {
          const line = projectTrendline(drawing, projectionContext);
          if (!line) return null;

          return (
            <line
              key={drawing.id}
              x1={line.x1 + paneLeft}
              y1={line.y1}
              x2={line.x2 + paneLeft}
              y2={line.y2}
              stroke={drawing.style.color}
              strokeWidth={drawing.style.lineWidth}
            />
          );
        }

        if (drawing.kind === 'rectangle') {
          const rect = projectRectangle(drawing, projectionContext);
          if (!rect) return null;

          return (
            <rect
              key={drawing.id}
              x={rect.x + paneLeft}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              fill={drawing.style.color}
              fillOpacity={drawing.style.fillOpacity}
              stroke={drawing.style.color}
              strokeWidth={drawing.style.lineWidth}
            />
          );
        }

        return null;
      })}
      </g>
    </svg>
  );
}
