'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

function projectLine(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  line: PatternLine,
): ProjectedLine | null {
  const [from, to] = line.points;
  const x1 = projectTime(chart, from.time);
  const x2 = projectTime(chart, to.time);
  const y1 = series.priceToCoordinate(from.price);
  const y2 = series.priceToCoordinate(to.price);
  if (x1 == null || x2 == null || y1 == null || y2 == null) return null;

  return {
    key: `${line.kind}:${from.time}:${from.price}:${to.time}:${to.price}`,
    x1,
    y1,
    x2,
    y2,
  };
}

function projectZone(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  zone: PatternZone,
): ProjectedZone | null {
  const x1 = projectTime(chart, zone.fromTime);
  const x2 = projectTime(chart, zone.toTime);
  const y1 = series.priceToCoordinate(zone.low);
  const y2 = series.priceToCoordinate(zone.high);
  if (x1 == null || x2 == null || y1 == null || y2 == null) return null;

  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);

  return {
    key: `${zone.fromTime}:${zone.toTime}:${zone.low}:${zone.high}`,
    x: left,
    y: top,
    width: Math.max(1, Math.abs(x2 - x1)),
    height: Math.max(1, Math.abs(y2 - y1)),
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
  const lastSerializedRef = useRef<string>('');
  const focusedPatternRef = useRef<string | null>(null);
  const patternColor = useMemo(() => {
    if (!pattern) return null;
    return {
      ui: PATTERN_COLOR_MAP[pattern.kind],
      stroke: PATTERN_STROKE_MAP[pattern.kind],
    };
  }, [pattern]);

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
        const leftPadding = Math.max(5 * 60_000, Math.floor(span * 1.5));
        const rightPadding = Math.max(3 * 60_000, Math.floor(span * 0.75));
        chart.timeScale().setVisibleRange({
          from: Math.floor((pattern.geometry.anchorTimeFrom - leftPadding) / 1000) as Time,
          to: Math.floor((pattern.geometry.anchorTimeTo + rightPadding) / 1000) as Time,
        });
        focusedPatternRef.current = pattern.id;
      }

      const lines = pattern.geometry.lines
        .map(line => projectLine(chart, series, line))
        .filter((line): line is ProjectedLine => line !== null);
      const zones = pattern.geometry.zones
        .map(zone => projectZone(chart, series, zone))
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

  if (!pattern || !projection || !patternColor) {
    return null;
  }

  return (
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
          rx={8}
          fill="rgba(99, 102, 241, 0.08)"
          stroke="rgba(99, 102, 241, 0.16)"
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
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.95}
        />
      ))}

      {projection.points.map(point => (
        <circle
          key={point.key}
          cx={point.x}
          cy={point.y}
          r={3}
          fill={patternColor.stroke}
          stroke="rgba(12, 14, 26, 0.95)"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}
