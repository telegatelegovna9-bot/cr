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

function projectTime(chart: IChartApi, timestampMs: number): number | null {
  return chart.timeScale().timeToCoordinate(Math.floor(timestampMs / 1000) as Time);
}

// Clamp a line segment to the visible SVG area [0..width] x [0..height].
// If both points are outside on the same side, returns null.
// Uses Cohen-Sutherland line clipping algorithm.
function clipLineToRect(
  x1: number, y1: number,
  x2: number, y2: number,
  width: number, height: number,
): [number, number, number, number] | null {
  const INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8;

  function code(x: number, y: number): number {
    let c = INSIDE;
    if (x < 0) c |= LEFT;
    else if (x > width) c |= RIGHT;
    if (y < 0) c |= TOP;
    else if (y > height) c |= BOTTOM;
    return c;
  }

  let c1 = code(x1, y1);
  let c2 = code(x2, y2);

  while (true) {
    if (!(c1 | c2)) return [x1, y1, x2, y2]; // both inside
    if (c1 & c2) return null; // both outside same region

    const c = c1 || c2;
    let x = 0, y = 0;
    const dx = x2 - x1, dy = y2 - y1;

    if (c & BOTTOM) { x = x1 + dx * (height - y1) / dy; y = height; }
    else if (c & TOP) { x = x1 + dx * (0 - y1) / dy; y = 0; }
    else if (c & RIGHT) { y = y1 + dy * (width - x1) / dx; x = width; }
    else if (c & LEFT) { y = y1 + dy * (0 - x1) / dx; x = 0; }

    if (c === c1) { x1 = x; y1 = y; c1 = code(x1, y1); }
    else { x2 = x; y2 = y; c2 = code(x2, y2); }
  }
}

function projectLine(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  line: PatternLine,
  width: number,
  height: number,
): ProjectedLine | null {
  const [from, to] = line.points;

  // For rays, we try to get at least one coordinate and extrapolate
  let x1 = projectTime(chart, from.time);
  let x2 = projectTime(chart, to.time);
  const y1Raw = series.priceToCoordinate(from.price);
  const y2Raw = series.priceToCoordinate(to.price);

  // If both x-coords are null, line is completely out of view
  if (x1 == null && x2 == null) return null;
  if (y1Raw == null && y2Raw == null) return null;

  // Extrapolate missing x using the slope from what we have
  if (x1 == null && x2 != null) {
    const timeDelta = to.time - from.time;
    const pxPerMs = timeDelta !== 0 ? (x2 - (x2)) / timeDelta : 0;
    x1 = x2 - (to.time - from.time) * (timeDelta !== 0 ? 1 : 0);
    // Simpler: place x1 far to the left
    x1 = x2 - Math.abs(x2) - 100;
  }
  if (x2 == null && x1 != null) {
    x2 = x1 + Math.abs(width - x1) + 100;
  }

  // Interpolate y values using price ratio if one is missing
  let y1: number | null = y1Raw == null ? null : Number(y1Raw);
  let y2: number | null = y2Raw == null ? null : Number(y2Raw);
  if (y1 == null && y2 != null) y1 = y2 + (from.price - to.price) / Math.max(Math.abs(to.price), 1) * height;
  if (y2 == null && y1 != null) y2 = y1 - (to.price - from.price) / Math.max(Math.abs(from.price), 1) * height;
  if (y1 == null || y2 == null) return null;

  const clipped = clipLineToRect(x1!, y1, x2!, y2, width, height);
  if (!clipped) return null;
  const [cx1, cy1, cx2, cy2] = clipped;

  return {
    key: `${line.kind}:${from.time}:${from.price}:${to.time}:${to.price}`,
    x1: cx1,
    y1: cy1,
    x2: cx2,
    y2: cy2,
    isRay: line.kind === 'ray',
  };
}

function projectZone(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  zone: PatternZone,
  width: number,
  height: number,
): ProjectedZone | null {
  let x1 = projectTime(chart, zone.fromTime);
  let x2 = projectTime(chart, zone.toTime);
  const y1 = series.priceToCoordinate(zone.low);
  const y2 = series.priceToCoordinate(zone.high);

  if (y1 == null || y2 == null) return null;

  // Clamp x to visible area if out of range
  if (x1 == null) x1 = 0;
  if (x2 == null) x2 = width;

  const left = Math.max(0, Math.min(x1, x2));
  const right = Math.min(width, Math.max(x1, x2));
  const top = Math.max(0, Math.min(y1, y2));
  const bottom = Math.min(height, Math.max(y1, y2));

  if (right <= left || bottom <= top) return null;

  return {
    key: `${zone.fromTime}:${zone.toTime}:${zone.low}:${zone.high}`,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function projectPoint(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  time: number,
  price: number,
): ProjectedPoint | null {
  const x = projectTime(chart, time);
  const y = series.priceToCoordinate(price);
  if (x == null || y == null) return null;

  return {
    key: `${time}:${price}`,
    x,
    y,
  };
}

function serializeProjection(state: ProjectionState): string {
  return JSON.stringify(state);
}

export function PatternChartOverlay({
  pattern,
  chartRef,
  candleSeriesRef,
  hostRef,
}: PatternChartOverlayProps) {
  const [projection, setProjection] = useState<ProjectionState | null>(null);
  const [hostMounted, setHostMounted] = useState(false);
  const lastSerializedRef = useRef<string>('');
  const focusedPatternRef = useRef<string | null>(null);
  const patternColor = useMemo(() => {
    if (!pattern) return null;
    return {
      ui: PATTERN_COLOR_MAP[pattern.kind],
      stroke: PATTERN_STROKE_MAP[pattern.kind],
    };
  }, [pattern]);

  // Track when hostRef becomes available so portal can mount
  useEffect(() => {
    if (hostRef.current) {
      setHostMounted(true);
    }
  }, [hostRef]);

  useEffect(() => {
    if (!pattern) {
      setProjection(null);
      lastSerializedRef.current = '';
      focusedPatternRef.current = null;
      return;
    }

    let frameId: number | null = null;

    const run = () => {
      const chart = chartRef.current;
      const series = candleSeriesRef.current;
      const host = hostRef.current;
      if (!chart || !series || !host) {
        frameId = requestAnimationFrame(run);
        return;
      }

      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) {
        frameId = requestAnimationFrame(run);
        return;
      }

      if (focusedPatternRef.current !== pattern.id) {
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
      }

      const lines = pattern.geometry.lines
        .map(line => projectLine(chart, series, line, width, height))
        .filter((line): line is ProjectedLine => line !== null);
      const zones = pattern.geometry.zones
        .map(zone => projectZone(chart, series, zone, width, height))
        .filter((zone): zone is ProjectedZone => zone !== null);
      const points = pattern.geometry.pivots
        .map(point => projectPoint(chart, series, point.time, point.price))
        .filter((point): point is ProjectedPoint => point !== null);

      const nextState: ProjectionState = { width, height, lines, zones, points };
      const serialized = serializeProjection(nextState);
      if (serialized !== lastSerializedRef.current) {
        lastSerializedRef.current = serialized;
        setProjection(nextState);
      }

      frameId = requestAnimationFrame(run);
    };

    frameId = requestAnimationFrame(run);
    return () => {
      if (frameId != null) cancelAnimationFrame(frameId);
    };
  }, [pattern, chartRef, candleSeriesRef, hostRef]);

  const host = hostRef.current;
  if (!pattern || !projection || !patternColor || !host || !hostMounted) {
    return null;
  }

  const svg = (
    <svg
      className="absolute inset-0 pointer-events-none z-[4]"
      width={projection.width}
      height={projection.height}
      viewBox={`0 0 ${projection.width} ${projection.height}`}
      preserveAspectRatio="none"
    >
      {projection.zones.map(zone => (
        <rect
          key={zone.key}
          x={zone.x}
          y={zone.y}
          width={zone.width}
          height={zone.height}
          rx={4}
          fill={`${patternColor.stroke}18`}
          stroke={`${patternColor.stroke}40`}
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
          opacity={line.isRay ? 0.65 : 0.9}
        />
      ))}

      {projection.points.map(point => (
        <circle
          key={point.key}
          cx={point.x}
          cy={point.y}
          r={3.5}
          fill={patternColor.stroke}
          stroke="rgba(12, 14, 26, 0.9)"
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );

  // Portal into the chart container so SVG shares the same coordinate origin
  // as the lightweight-charts canvas. Without this, absolute positioning is
  // relative to a parent div that includes the header, causing drift on scroll.
  return createPortal(svg, host);
}
