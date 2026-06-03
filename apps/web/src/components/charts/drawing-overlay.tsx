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
import { DrawingPrimitive } from '@/lib/drawings/primitive';

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
}: DrawingOverlayProps) {
  const primitiveRef = useRef<DrawingPrimitive | null>(null);
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 });
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

  const timeScaleWidth = chart ? chart.timeScale().width() : 0;
  const timeScaleHeight = chart ? chart.timeScale().height() : 0;
  const paneWidth = Math.max(0, Math.min(hostSize.width, timeScaleWidth || hostSize.width));
  const paneLeft = 0;
  const paneHeight = Math.max(0, hostSize.height - timeScaleHeight);

  useEffect(() => {
    if (!candleSeries) return;

    const primitive = new DrawingPrimitive();
    candleSeries.attachPrimitive(primitive);
    primitiveRef.current = primitive;

    return () => {
      candleSeries.detachPrimitive(primitive);
      if (primitiveRef.current === primitive) {
        primitiveRef.current = null;
      }
    };
  }, [candleSeries]);

  useEffect(() => {
    primitiveRef.current?.setState({
      drawings,
      hidden,
      lastBarTime,
    });
  }, [drawings, hidden, lastBarTime]);

  const screenToValue = useCallback((clientX: number, clientY: number): DrawingPoint | null => {
    if (!chart || !candleSeries || !hostRef.current || paneWidth <= 0 || paneHeight <= 0) {
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
      if (logical === null) {
        return null;
      }

      const lastBarX =
        lastBarTime === null ? null : chart.timeScale().timeToCoordinate(lastBarTime as any);
      const lastRealLogical =
        lastBarX === null ? null : chart.timeScale().coordinateToLogical(lastBarX);
      if (lastRealLogical === null) {
        return null;
      }

      const offset = Number(logical) - Number(lastRealLogical);
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
  }, [chart, candleSeries, hostRef, lastBarTime, paneHeight, paneLeft, paneWidth]);

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
    if (!chart || !candleSeries || hidden) return;
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

  if (!chart || !candleSeries || hidden || paneWidth <= 0 || paneHeight <= 0) {
    return null;
  }

  return (
    <svg
      className="absolute left-0 top-0 z-30 select-none pointer-events-none"
      width={hostSize.width}
      height={hostSize.height}
      style={{
        width: hostSize.width,
        height: hostSize.height,
      }}
    >
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
    </svg>
  );
}
