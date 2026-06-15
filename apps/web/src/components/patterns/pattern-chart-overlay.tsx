'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MutableRefObject } from 'react';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { getPatternLabel, getPatternUi } from '@/lib/patterns/color-map';
import type { PatternDetail, PatternLine, PatternZone } from '@/lib/patterns/models';

const PATTERN_STROKE_MAP = {
  breakout: '#34d399',
  retest: '#38bdf8',
  structure_break: '#e879f9',
  liquidity_sweep: '#fbbf24',
  triangle: '#a78bfa',
  wedge: '#fb7185',
  flag: '#4ade80',
  cascade: '#f97316',
  fvg: '#fbbf24',
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
  timePointsRef: MutableRefObject<number[]>;
  overlayVersion: string;
}

function toNum(v: number | null | undefined): number | null {
  if (v == null) return null;
  return Number(v);
}

function getNearestTimePoint(timestampMs: number, timePoints: number[]): number | null {
  if (timePoints.length === 0) return null;
  if (timePoints.length === 1) return timePoints[0] ?? null;

  let left = 0;
  let right = timePoints.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const time = timePoints[mid]!;
    if (time === timestampMs) return time;
    if (time < timestampMs) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  const nominalStep = Math.max(1, timePoints[1]! - timePoints[0]!);
  const before = right >= 0 ? timePoints[right]! : null;
  const after = left < timePoints.length ? timePoints[left]! : null;
  const nearest =
    before == null
      ? after
      : after == null
        ? before
        : Math.abs(before - timestampMs) <= Math.abs(after - timestampMs)
          ? before
          : after;

  if (nearest == null) return null;
  if (timestampMs < timePoints[0]! - nominalStep || timestampMs > timePoints[timePoints.length - 1]! + nominalStep) {
    return null;
  }

  return nearest;
}

function getNearestTimeIndex(timestampMs: number, timePoints: number[]): number | null {
  const nearest = getNearestTimePoint(timestampMs, timePoints);
  if (nearest == null) return null;
  const index = timePoints.indexOf(nearest);
  return index >= 0 ? index : null;
}

function projectTime(chart: IChartApi, timestampMs: number, timePoints: number[]): number | null {
  const exact = toNum(chart.timeScale().timeToCoordinate(Math.floor(timestampMs / 1000) as Time));
  if (exact != null) return exact;

  const nearest = getNearestTimePoint(timestampMs, timePoints);
  if (nearest == null) return null;
  return toNum(chart.timeScale().timeToCoordinate(Math.floor(nearest / 1000) as Time));
}

function projectLine(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  line: PatternLine,
  timePoints: number[],
): ProjectedLine | null {
  const [from, to] = line.points;
  const x1 = projectTime(chart, from.time, timePoints);
  const x2 = projectTime(chart, to.time, timePoints);
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
  timePoints: number[],
): ProjectedZone | null {
  const x1 = projectTime(chart, zone.fromTime, timePoints);
  const x2 = projectTime(chart, zone.toTime, timePoints);
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
  timePoints: number[],
): ProjectedPoint | null {
  const x = projectTime(chart, time, timePoints);
  const y = toNum(series.priceToCoordinate(price));
  if (x == null || y == null) return null;
  return { key: `${time}:${price}`, x, y };
}

function computeProjection(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  host: HTMLDivElement,
  pattern: PatternDetail,
  timePoints: number[],
): ProjectionState {
  const width = host.clientWidth;
  const height = host.clientHeight;

  const lines = pattern.geometry.lines
    .map(line => projectLine(chart, series, line, timePoints))
    .filter((l): l is ProjectedLine => l !== null);

  const zones = pattern.geometry.zones
    .map(zone => projectZone(chart, series, zone, timePoints))
    .filter((z): z is ProjectedZone => z !== null);

  const points = pattern.geometry.pivots
    .map(p => projectPoint(chart, series, p.time, p.price, timePoints))
    .filter((p): p is ProjectedPoint => p !== null);

  return { width, height, lines, zones, points };
}

export function PatternChartOverlay({
  pattern,
  chartRef,
  candleSeriesRef,
  hostRef,
  timePointsRef,
  overlayVersion,
}: PatternChartOverlayProps) {
  const [projection, setProjection] = useState<ProjectionState | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  const focusedPatternRef = useRef<string | null>(null);

  const patternColor = useMemo(() => {
    if (!pattern) return null;
    const kind = pattern.kind as keyof typeof PATTERN_STROKE_MAP;
    return {
      ui: getPatternUi(pattern.kind),
      stroke: PATTERN_STROKE_MAP[kind] || '#6366f1',
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

  // Main projection effect
  useEffect(() => {
    if (!pattern) {
      setProjection(null);
      focusedPatternRef.current = null;
      return;
    }

    let frameId: number | null = null;
    let redrawRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let focusRetries = 0;

    const focusChart = (chart: IChartApi, force = false) => {
      const focusKey = `${pattern.id}:${overlayVersion}`;
      if (!force && focusedPatternRef.current === focusKey) return;

      const timePoints = timePointsRef.current;
      if (!timePoints.length) return;

      const span = Math.max(60_000, pattern.geometry.anchorTimeTo - pattern.geometry.anchorTimeFrom);
      const midpoint = pattern.geometry.anchorTimeFrom + span / 2;
      const leftTarget = midpoint - span * 0.8;
      const rightTarget = midpoint + span * 1.0;
      const fromIndex = getNearestTimeIndex(leftTarget, timePoints);
      const toIndex = getNearestTimeIndex(rightTarget, timePoints);
      if (fromIndex == null || toIndex == null) return;

      const left = Math.max(0, Math.min(fromIndex, toIndex) - 3);
      const right = Math.max(left + 10, Math.max(fromIndex, toIndex) + 3);

      try {
        chart.timeScale().setVisibleLogicalRange({
          from: left,
          to: right,
        });
      } catch {
        return;
      }
      focusedPatternRef.current = focusKey;
    };

    const redraw = () => {
      const chart = chartRef.current;
      const series = candleSeriesRef.current;
      const host = hostRef.current;
      const timePoints = timePointsRef.current;
      if (!chart || !series || !host) return;

      const nextProjection = computeProjection(chart, series, host, pattern, timePoints);
      if (
        focusRetries < 12 &&
        (nextProjection.lines.length > 0 || nextProjection.zones.length > 0 || nextProjection.points.length > 0)
      ) {
        focusChart(chart, true);
        focusRetries = 12;
      } else if (focusRetries < 12) {
        focusChart(chart, true);
        focusRetries += 1;
      }

      setProjection(current => {
        if (
          current &&
          current.width === nextProjection.width &&
          current.height === nextProjection.height &&
          JSON.stringify(current.lines) === JSON.stringify(nextProjection.lines) &&
          JSON.stringify(current.zones) === JSON.stringify(nextProjection.zones) &&
          JSON.stringify(current.points) === JSON.stringify(nextProjection.points)
        ) {
          return current;
        }
        return nextProjection;
      });
    };

    const scheduleRedraw = () => {
      if (frameId != null) return;
      frameId = requestAnimationFrame(() => {
        frameId = null;
        redraw();
      });
    };

    const chart = chartRef.current;
    const host = hostRef.current;
    if (chart) {
      chart.timeScale().subscribeVisibleTimeRangeChange(scheduleRedraw);
      chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleRedraw);
    }
    if (host) {
      resizeObserver = new ResizeObserver(() => scheduleRedraw());
      resizeObserver.observe(host);
    }

    redraw();
    redrawRetryTimer = setTimeout(() => scheduleRedraw(), 150);

    return () => {
      if (frameId != null) cancelAnimationFrame(frameId);
      if (redrawRetryTimer) clearTimeout(redrawRetryTimer);
      if (chart) {
        chart.timeScale().unsubscribeVisibleTimeRangeChange(scheduleRedraw);
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleRedraw);
      }
      resizeObserver?.disconnect();
      setProjection(null);
    };
  }, [pattern, chartRef, candleSeriesRef, hostRef, overlayVersion, timePointsRef]);

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
      {/* Structural Support/Resistance Lines (Rays) */}
      {projection.zones.map(zone => (
        <rect
          key={zone.key}
          x={zone.x}
          y={zone.y}
          width={zone.width}
          height={zone.height}
          fill={patternColor.stroke}
          opacity={pattern.status === 'finished' ? 0.08 : 0.14}
          rx={4}
        />
      ))}

      {projection.lines.map(line => (
        <g key={line.key}>
          <line
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="rgba(0,0,0,0.4)"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <line
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={patternColor.stroke}
            strokeWidth={line.isRay ? 1.5 : 2}
            strokeDasharray={line.isRay ? '4 4' : undefined}
            strokeLinecap="round"
            opacity={line.isRay ? 0.7 : 1}
          />
        </g>
      ))}

      {/* Structural Pivot Points (ZigZag) */}
      {projection.points.map(point => (
        <g key={point.key}>
          <circle
            cx={point.x}
            cy={point.y}
            r={4}
            fill={patternColor.stroke}
            opacity={0.3}
          />
          <circle
            cx={point.x}
            cy={point.y}
            r={2}
            fill={patternColor.stroke}
            stroke="rgba(0,0,0,0.8)"
            strokeWidth={1}
          />
        </g>
      ))}

      {/* Label for quality */}
      {projection.points.length > 0 && (
        <text
          x={projection.points[projection.points.length - 1].x}
          y={projection.points[projection.points.length - 1].y - 15}
          fill={patternColor.stroke}
          fontSize="10px"
          fontWeight="bold"
          fontFamily="monospace"
          textAnchor="middle"
          style={{ filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.8))' }}
        >
          {getPatternLabel(pattern.kind).toUpperCase()} ({pattern.quality}%)
        </text>
      )}
    </svg>
  );

  return createPortal(svg, portalTarget);
}
