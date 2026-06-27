'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useDrawingStore } from '@/stores';
import {
  AnyDrawing,
  DrawingPoint,
  InstrumentMarketType,
  RulerDrawing,
  makeInstrumentKey,
} from '@/lib/drawings/models';
import { DrawingPrimitive } from '@/lib/drawings/primitive';
import {
  type ChartProjectionContext,
  hitTestLine,
  hitTestPoint,
  projectHorizontalLine,
  projectRangeBox,
  projectRectangle,
  projectTrendline,
} from '@/lib/drawings/engine';
import type { RangeMetricCandle } from '@/lib/drawings/range-metrics';
import {
  shouldStartTemporaryMeasure,
} from './drawing-overlay-helpers';

interface DrawingOverlayProps {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'> | null;
  hostRef: React.RefObject<HTMLDivElement | null>;
  lastBarTime: number | null;
  exchange: string;
  marketType: InstrumentMarketType;
  symbol: string;
  measurementCandles: RangeMetricCandle[];
  compact?: boolean;
}

interface CreationState {
  drawingId: string;
  kind: 'trendline' | 'rectangle' | 'ruler';
}

type DragState =
  | {
      drawingId: string;
      mode: 'move';
      anchor: DrawingPoint;
      original: RulerDrawing;
    }
  | {
      drawingId: string;
      mode: 'resize-start' | 'resize-end';
      original: RulerDrawing;
    };

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
  measurementCandles,
}: DrawingOverlayProps) {
  const primitiveRef = useRef<DrawingPrimitive | null>(null);
  const [hostSize, setHostSize] = useState({ width: 0, height: 0 });
  const [creation, setCreation] = useState<CreationState | null>(null);
  const [temporaryMeasure, setTemporaryMeasure] = useState<RulerDrawing | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const {
    byId,
    byInstrument,
    hidden,
    selectedTool,
    selectedDrawingId,
    setSelectedDrawingId,
    upsertDrawing,
    removeDrawing,
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
          || drawing.kind === 'trendline'
          || drawing.kind === 'rectangle'
          || drawing.kind === 'ruler';
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
      selectedDrawingId,
      measurementCandles,
      temporaryMeasure,
    });
  }, [drawings, hidden, lastBarTime, measurementCandles, selectedDrawingId, temporaryMeasure]);

  const projectionContext = useMemo<ChartProjectionContext | null>(() => {
    if (!chart || !candleSeries || paneWidth <= 0 || paneHeight <= 0) return null;

    const lastBarX =
      lastBarTime === null ? null : chart.timeScale().timeToCoordinate(lastBarTime as any);
    const lastRealLogical =
      lastBarX === null ? null : chart.timeScale().coordinateToLogical(lastBarX);

    return {
      width: paneWidth,
      height: paneHeight,
      timeToX: (time: number) => chart.timeScale().timeToCoordinate(time as any),
      logicalToX: (logical: number) => chart.timeScale().logicalToCoordinate(logical as any),
      lastRealLogical: lastRealLogical === null ? null : Number(lastRealLogical),
      priceToY: (price: number) => candleSeries.priceToCoordinate(price),
    };
  }, [chart, candleSeries, lastBarTime, paneHeight, paneWidth]);

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
      lineWidth: 1.25,
      lineStyle: 'solid' as const,
      fillOpacity: 0.12,
    },
  }), [exchange, instrumentKey, marketType, symbol]);

  const hitTestDrawing = useCallback((x: number, y: number): AnyDrawing | null => {
    if (!projectionContext) return null;

    for (let index = drawings.length - 1; index >= 0; index -= 1) {
      const drawing = drawings[index];

      if (drawing.kind === 'horizontal_line') {
        const line = projectHorizontalLine(drawing, projectionContext);
        if (line && hitTestLine(x, y, line.x1, line.y1, line.x2, line.y2, 8)) {
          return drawing;
        }
      }

      if (drawing.kind === 'trendline') {
        const line = projectTrendline(drawing, projectionContext);
        if (line && hitTestLine(x, y, line.x1, line.y1, line.x2, line.y2, 8)) {
          return drawing;
        }
      }

      if (drawing.kind === 'ruler') {
        const box = projectRangeBox(drawing, projectionContext);
        const inside = box
          ? x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
          : false;
        const onLine = box
          ? hitTestLine(x, y, box.x1, box.y1, box.x2, box.y2, 10)
          : false;
        if (inside || onLine) {
          return drawing;
        }
      }

      if (drawing.kind === 'rectangle') {
        const rect = projectRectangle(drawing, projectionContext);
        if (!rect) continue;
        const inside =
          x >= rect.x &&
          x <= rect.x + rect.width &&
          y >= rect.y &&
          y <= rect.y + rect.height;
        if (inside) {
          return drawing;
        }
      }
    }

    return null;
  }, [drawings, projectionContext]);

  const beginRulerInteraction = useCallback((chartX: number, chartY: number, point: DrawingPoint) => {
    const hit = hitTestDrawing(chartX, chartY);
    setSelectedDrawingId(hit?.id ?? null);
    if (hit?.kind !== 'ruler') {
      return;
    }

    const box = projectionContext ? projectRangeBox(hit, projectionContext) : null;
    if (!box) {
      return;
    }

    const centerX = box.midX;
    const topY = Math.min(box.y1, box.y2);
    const bottomY = Math.max(box.y1, box.y2);

    const mode = hitTestPoint(chartX, chartY, centerX, topY, 8)
      ? 'resize-start'
      : hitTestPoint(chartX, chartY, centerX, bottomY, 8)
        ? 'resize-end'
        : 'move';

    setDragState(
      mode === 'move'
        ? { drawingId: hit.id, mode, anchor: point, original: hit }
        : { drawingId: hit.id, mode, original: hit },
    );
  }, [hitTestDrawing, projectionContext, setSelectedDrawingId]);

  const handlePointerDown = (event: React.PointerEvent<SVGElement>) => {
    if (!chart || !candleSeries || hidden) return;

    const rect = hostRef.current?.getBoundingClientRect();
    const chartX = rect ? event.clientX - rect.left : 0;
    const chartY = rect ? event.clientY - rect.top : 0;

    if (selectedTool === 'delete') {
      const hit = hitTestDrawing(chartX, chartY);
      if (hit) removeDrawing(hit.id);
      return;
    }

    const point = screenToValue(event.clientX, event.clientY);
    if (!point) return;

    const id = createDrawingId();
    const base = makeBaseDrawing(id);

    if (selectedTool === 'horizontal_line') {
      upsertDrawing({
        ...base,
        kind: selectedTool,
        price: point.price,
      } as AnyDrawing);
      setSelectedDrawingId(id);
      return;
    }

    if (selectedTool === 'trendline' || selectedTool === 'rectangle' || selectedTool === 'ruler') {
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
      setSelectedDrawingId(id);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
  };

  const handlePointerMove = (event: React.PointerEvent<SVGElement>) => {
    if (temporaryMeasure) {
      const point = screenToValue(event.clientX, event.clientY);
      if (!point) return;
      setTemporaryMeasure((current) => (current ? { ...current, p2: point, updatedAt: Date.now() } : null));
      return;
    }

    if (dragState) {
      const point = screenToValue(event.clientX, event.clientY);
      if (!point) return;

      const current = byId[dragState.drawingId];
      if (!current || current.kind !== 'ruler') return;

      if (dragState.mode === 'resize-start') {
        upsertDrawing({ ...current, p1: point, updatedAt: Date.now() });
        return;
      }

      if (dragState.mode === 'resize-end') {
        upsertDrawing({ ...current, p2: point, updatedAt: Date.now() });
        return;
      }

      if (dragState.mode !== 'move') {
        return;
      }

      const deltaPrice = point.price - dragState.anchor.price;
      const timeOffset =
        typeof point.futureOffset === 'number'
        && typeof dragState.anchor.futureOffset === 'number'
          ? point.futureOffset - dragState.anchor.futureOffset
          : null;
      const deltaTime = point.time - dragState.anchor.time;
      const movePoint = (input: DrawingPoint): DrawingPoint => ({
        ...input,
        price: input.price + deltaPrice,
        time: input.time + deltaTime,
        futureOffset:
          typeof input.futureOffset === 'number' && timeOffset !== null
            ? input.futureOffset + timeOffset
            : input.futureOffset,
      });

      upsertDrawing({
        ...current,
        p1: movePoint(dragState.original.p1),
        p2: movePoint(dragState.original.p2),
        updatedAt: Date.now(),
      });
      return;
    }

    if (!creation) return;

    const current = byId[creation.drawingId];
    if (!current || (current.kind !== 'trendline' && current.kind !== 'rectangle' && current.kind !== 'ruler')) {
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
    setDragState(null);
    setTemporaryMeasure(null);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedDrawingId) {
        removeDrawing(selectedDrawingId);
        setSelectedDrawingId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [removeDrawing, selectedDrawingId, setSelectedDrawingId]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !chart || !candleSeries || hidden) return;

    const handlePointerDown = (event: PointerEvent) => {
      const point = screenToValue(event.clientX, event.clientY);
      if (!point) return;

      const rect = host.getBoundingClientRect();
      const chartX = event.clientX - rect.left;
      const chartY = event.clientY - rect.top;

      if (shouldStartTemporaryMeasure({ shiftKey: event.shiftKey, button: event.button })) {
        event.preventDefault();
        event.stopPropagation();
        setTemporaryMeasure({
          ...makeBaseDrawing('temp_measure'),
          kind: 'ruler',
          p1: point,
          p2: point,
        } as RulerDrawing);
        return;
      }

      if (selectedTool === 'cursor' && event.button === 0) {
        const hit = hitTestDrawing(chartX, chartY);
        if (hit?.kind === 'ruler') {
          event.preventDefault();
          event.stopPropagation();
          beginRulerInteraction(chartX, chartY, point);
        }
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const point = screenToValue(event.clientX, event.clientY);
      if (!point) return;

      if (temporaryMeasure) {
        setTemporaryMeasure((current) => (current ? { ...current, p2: point, updatedAt: Date.now() } : null));
        return;
      }

      if (!dragState) return;

      const current = byId[dragState.drawingId];
      if (!current || current.kind !== 'ruler') return;

      if (dragState.mode === 'resize-start') {
        upsertDrawing({ ...current, p1: point, updatedAt: Date.now() });
        return;
      }

      if (dragState.mode === 'resize-end') {
        upsertDrawing({ ...current, p2: point, updatedAt: Date.now() });
        return;
      }

      if (dragState.mode !== 'move') {
        return;
      }

      const deltaPrice = point.price - dragState.anchor.price;
      const timeOffset =
        typeof point.futureOffset === 'number'
        && typeof dragState.anchor.futureOffset === 'number'
          ? point.futureOffset - dragState.anchor.futureOffset
          : null;
      const deltaTime = point.time - dragState.anchor.time;
      const movePoint = (input: DrawingPoint): DrawingPoint => ({
        ...input,
        price: input.price + deltaPrice,
        time: input.time + deltaTime,
        futureOffset:
          typeof input.futureOffset === 'number' && timeOffset !== null
            ? input.futureOffset + timeOffset
            : input.futureOffset,
      });

      upsertDrawing({
        ...current,
        p1: movePoint(dragState.original.p1),
        p2: movePoint(dragState.original.p2),
        updatedAt: Date.now(),
      });
    };

    const finish = () => {
      setDragState(null);
      setTemporaryMeasure(null);
    };

    host.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finish);

    return () => {
      host.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finish);
    };
  }, [
    beginRulerInteraction,
    byId,
    candleSeries,
    chart,
    dragState,
    hidden,
    hostRef,
    makeBaseDrawing,
    screenToValue,
    selectedTool,
    temporaryMeasure,
    hitTestDrawing,
    upsertDrawing,
  ]);

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
            if (creation || temporaryMeasure) {
              finishCreation(event);
            }
          }}
        />
      )}
    </svg>
  );
}
