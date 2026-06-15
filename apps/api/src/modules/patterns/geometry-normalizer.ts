import type { PatternGeometry, PatternKind, PatternLine, PatternPoint, PatternZone } from './patterns.types';

function normalizePoint(point: PatternPoint): PatternPoint {
  return {
    time: Number(point.time),
    price: Number(point.price),
  };
}

function normalizeLine(line: PatternLine): PatternLine {
  const first = normalizePoint(line.points[0]);
  const second = normalizePoint(line.points[1]);
  if (first.time <= second.time) {
    return { kind: line.kind, points: [first, second] };
  }
  return { kind: line.kind, points: [second, first] };
}

function normalizeZone(zone: PatternZone): PatternZone {
  return {
    fromTime: Math.min(zone.fromTime, zone.toTime),
    toTime: Math.max(zone.fromTime, zone.toTime),
    low: Math.min(zone.low, zone.high),
    high: Math.max(zone.low, zone.high),
  };
}

function collectTimes(geometry: PatternGeometry): number[] {
  return [
    ...geometry.pivots.map(point => point.time),
    ...geometry.lines.flatMap(line => line.points.map(point => point.time)),
    ...geometry.zones.flatMap(zone => [zone.fromTime, zone.toTime]),
  ].filter(Number.isFinite);
}

function collectPrices(geometry: PatternGeometry): number[] {
  return [
    ...geometry.pivots.map(point => point.price),
    ...geometry.lines.flatMap(line => line.points.map(point => point.price)),
    ...geometry.zones.flatMap(zone => [zone.low, zone.high]),
  ].filter(Number.isFinite);
}

export function normalizePatternGeometry(kind: PatternKind, geometry: PatternGeometry): PatternGeometry {
  const pivots = geometry.pivots
    .map(normalizePoint)
    .sort((a, b) => a.time - b.time);

  const lines = geometry.lines
    .map(normalizeLine)
    .sort((a, b) => a.points[0].time - b.points[0].time);

  const zones = (kind === 'triangle' || kind === 'wedge'
    ? []
    : geometry.zones.map(normalizeZone).sort((a, b) => a.fromTime - b.fromTime));

  const normalized: PatternGeometry = {
    anchorTimeFrom: geometry.anchorTimeFrom,
    anchorTimeTo: geometry.anchorTimeTo,
    priceMin: geometry.priceMin,
    priceMax: geometry.priceMax,
    pivots,
    lines,
    zones,
  };

  const times = collectTimes(normalized);
  const prices = collectPrices(normalized);

  const derivedFrom = times.length > 0 ? Math.min(...times) : geometry.anchorTimeFrom;
  const derivedTo = times.length > 0 ? Math.max(...times) : geometry.anchorTimeTo;
  const derivedMin = prices.length > 0 ? Math.min(...prices) : geometry.priceMin;
  const derivedMax = prices.length > 0 ? Math.max(...prices) : geometry.priceMax;
  const priceSpan = Math.max(1e-8, derivedMax - derivedMin);
  const padding = priceSpan * 0.03;

  return {
    anchorTimeFrom: derivedFrom,
    anchorTimeTo: derivedTo,
    priceMin: Math.min(geometry.priceMin, derivedMin - padding),
    priceMax: Math.max(geometry.priceMax, derivedMax + padding),
    pivots,
    lines,
    zones,
  };
}
