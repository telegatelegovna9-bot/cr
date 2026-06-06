'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MutableRefObject } from 'react';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { PATTERN_COLOR_MAP } from '@/lib/patterns/color-map';
import type { PatternDetail, PatternLine, PatternZone } from '@/lib/patterns/models';

const PATTERN_STROKE_MAP = {
  cascade: '#fbbf24',
  trendline: '#7dd3fc',
  triangle: '#6ee7b7',
} as const;

interface ProjectedLine {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isRay: boolean;
}

interface ProjectedZone {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ProjectedPoint {
  key: string;
  x: number;
  y: number;
}

interface ProjectionState {
  width: number;
  height: number;
  lines: ProjectedLine[];
  zones: ProjectedZone[];
  points: ProjectedPoint[];
}

interface PatternChartOverlayProps {
  pattern: PatternDetail | null;
  chartRef: MutableRefObject<IChartApi | null>;
  candleSeriesRef: MutableRefObject<ISeriesApi<'Candlestick'> | null>;
  hostRef: MutableRefObject<HTMLDivElement | null>;
}

function toNum(v: number | null | undefined): number | null {
  if (v == null) return null;
  return Number(v);
}

function projectTime(chart: IChartApi, timestampMs: number): number | null {
  return toNum(chart.timeScale().timeToCoordinate(Math.floor(timestampMs / 1000) as Time));
}

function projectLine(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  line: PatternLine,
): ProjectedLine | null {
  const [from, to] = line.points;
  const x1 = projectTime(chart, from.time);
  const x2 = projectTime(chart, to.time);
  const y1 = toNum(series.priceToCoordinate(from.price));
  const y2 = toNum(series.priceToCoordinate(to.price));
  if (x1 == null || x2 == null || y1 == null || y2 == null) return null;

  return {
    key: `${line.kind}:${from.time}:${from.price}:${to.time}:${to.price}`,
    x1, y1, x2, y2,
    isRay: line.kind === 'ray',
  };
}

function projectZone(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  zone: PatternZone,
): ProjectedZone | null {
  const x1 = projectTime(chart, zone.fromTime);
  const x2 = projectTime(chart, zone.toTime);
  const y1 = toNum(series.priceToCoordinate(zone.low));
  const y2 = toNum(series.priceToCoordinate(zone.high));
  if (x1 == null || x2 == null || y1 == null || y2 == null) return null;

  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const w = Math.max(1, Math.abs(x2 - x1));
  const h = Math.max(1, Math.abs(y2 - y1));

  return {
    key: `${zone.fromTime}:${zone.toTime}:${zone.low}:${zone.high}`,
    x: left, y: top, width: w, height: h,
  };
}

function projectPoint(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  time: number,
  price: number,
): ProjectedPoint | null {
  const x = projectTime(chart, time);
  const y = toNum(series.priceToCoordinate(price));
  if (x == null || y == null) return null;
  return { key: `${time}:${price}`, x, y };
}

function computeProjection(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  host: HTMLDivElement,
  pattern: PatternDetail,
): ProjectionState {
  const width = host.clientWidth;
  const height = host.clientHeight;

  const lines = pattern.geometry.lines
    .map(line => projectLine(chart, series, line))
    .filter((l): l is ProjectedLine => l !== null);

  const zones = pattern.geometry.zones
    .map(zone => projectZone(chart, series, zone))
    .filter((z): z is ProjectedZone => z !== null);

  const points = pattern.geometry.pivots
    .map(p => projectPoint(chart, series, p.time, p.price))
    .filter((p): p is ProjectedPoint => p !== null);

  return { width, height, lines, zones, points };
}

export function PatternChartOverlay({
  pattern,
  chartRef,
  candleSeriesRef,
  hostRef,
}: PatternChartOverlayProps) {
  const [projection, setProjection] = useState<ProjectionState | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  const focusedPatternRef = useRef<string | null>(null);

  const patternColor = useMemo(() => {
    if (!pattern) return null;
    return {
      ui: PATTERN_COLOR_MAP[pattern.kind],
      stroke: PATTERN_STROKE_MAP[pattern.kind],
    };
  }, [pattern]);

  // Resolve portal target once host is available
  useEffect(() => {
    const check = () => {
      if (hostRef.current) {
        setPortalTarget(hostRef.current);
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  }, [hostRef]);

  // Main projection effect — event-driven, not a continuous RAF loop
  useEffect(() => {
    if (!pattern) {
      setProjection(null);
      focusedPatternRef.current = null;
      return;
    }

    let subscribedChart: IChartApi | null = null;
    let frameId: number | null = null;

    const redraw = () => {
      const chart = chartRef.current;
      const series = candleSeriesRef.current;
      const host = hostRef.current;
      if (!chart || !series || !host) return;
      setProjection(computeProjection(chart, series, host, pattern));
    };

    const focusChart = (chart: IChartApi) => {
      if (focusedPatternRef.current === pattern.id) return;
      const span = Math.max(60_000, pattern.geometry.anchorTimeTo - pattern.geometry.anchorTimeFrom);
      const leftPadding = Math.max(5 * 60_000, Math.floor(span * 0.25));
      const rightPadding = Math.max(5 * 60_000, Math.floor(span * 0.4));
      const visibleFrom = pattern.geometry.anchorTimeFrom - leftPadding;
      const visibleTo = Math.max(
        pattern.geometry.anchorTimeTo + rightPadding,
        pattern.updatedAt + rightPadding,
      );
      chart.timeScale().setVisibleRange({
        from: Math.floor(visibleFrom / 1000) as Time,
        to: Math.floor(visibleTo / 1000) as Time,
      });
      focusedPatternRef.current = pattern.id;
    };

    // Wait for chart to be available before subscribing to events
    const subscribe = () => {
      const chart = chartRef.current;
      if (!chart) {
        frameId = requestAnimationFrame(subscribe);
        return;
      }
      subscribedChart = chart;
      focusChart(chart);
      redraw();
      chart.timeScale().subscribeVisibleTimeRangeChange(redraw);
      chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);
    };
    frameId = requestAnimationFrame(subscribe);

    const resizeObserver = new ResizeObserver(redraw);
    if (hostRef.current) resizeObserver.observe(hostRef.current);

    return () => {
      if (frameId != null) cancelAnimationFrame(frameId);
      subscribedChart?.timeScale().unsubscribeVisibleTimeRangeChange(redraw);
      subscribedChart?.timeScale().unsubscribeVisibleLogicalRangeChange(redraw);
      resizeObserver.disconnect();
      setProjection(null);
    };
  }, [pattern, chartRef, candleSeriesRef, hostRef]);

  if (!pattern || !projection || !patternColor || !portalTarget) {
    return null;
  }

  const svg = (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 4,
        overflow: 'visible',
      }}
      width={projection.width}
      height={projection.height}
      viewBox={`0 0 ${projection.width} ${projection.height}`}
    >
      {projection.zones.map(zone => (
        <rect
          key={zone.key}
          x={zone.x}
          y={zone.y}
          width={zone.width}
          height={zone.height}
          rx={3}
          fill={`${patternColor.stroke}15`}
          stroke={`${patternColor.stroke}35`}
          strokeWidth={1}
        />
      ))}

      {projection.lines.map(line => (
        <line
          key={line.key}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={patternColor.stroke}
          strokeWidth={line.isRay ? 1.2 : 1.8}
          strokeDasharray={line.isRay ? '6 4' : undefined}
          strokeLinecap="round"
          opacity={line.isRay ? 0.6 : 0.92}
        />
      ))}

      {projection.points.map(point => (
        <circle
          key={point.key}
          cx={point.x}
          cy={point.y}
          r={3.5}
          fill={patternColor.stroke}
          stroke="rgba(10, 12, 22, 0.9)"
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );

  return createPortal(svg, portalTarget);
}
