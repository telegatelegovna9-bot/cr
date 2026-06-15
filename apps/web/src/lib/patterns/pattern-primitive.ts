import type {
  AutoscaleInfo,
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  Logical,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { PatternDetail, PatternLine, PatternZone } from './models';

const PATTERN_STROKE_MAP: Record<string, string> = {
  breakout: '#34d399',
  retest: '#38bdf8',
  structure_break: '#e879f9',
  liquidity_sweep: '#fbbf24',
  triangle: '#a78bfa',
  wedge: '#fb7185',
  flag: '#4ade80',
  cascade: '#f97316',
  fvg: '#fbbf24',
};

type PatternSeries = ISeriesApi<'Candlestick'>;

interface ProjectedLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isRay: boolean;
}

interface ProjectedZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ProjectedPivot {
  x: number;
  y: number;
}

interface ProjectedLabel {
  x: number;
  y: number;
  text: string;
}

function getNearestTimePoint(timestampMs: number, timePoints: number[]): number | null {
  if (timePoints.length === 0) return null;
  if (timePoints.length === 1) return timePoints[0] ?? null;

  let left = 0;
  let right = timePoints.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const current = timePoints[mid]!;
    if (current === timestampMs) return current;
    if (current < timestampMs) left = mid + 1;
    else right = mid - 1;
  }

  const first = timePoints[0]!;
  const last = timePoints[timePoints.length - 1]!;
  const nominalStep = Math.max(1, timePoints[1]! - first);
  if (timestampMs < first - nominalStep || timestampMs > last + nominalStep) return null;

  const before = right >= 0 ? timePoints[right]! : null;
  const after = left < timePoints.length ? timePoints[left]! : null;
  if (before == null) return after;
  if (after == null) return before;
  return Math.abs(before - timestampMs) <= Math.abs(after - timestampMs) ? before : after;
}

function getNearestTimeIndex(timestampMs: number, timePoints: number[]): number | null {
  const point = getNearestTimePoint(timestampMs, timePoints);
  if (point == null) return null;
  const index = timePoints.indexOf(point);
  return index >= 0 ? index : null;
}

function projectTime(chart: IChartApi, timestampMs: number, timePoints: number[]): number | null {
  const direct = chart.timeScale().timeToCoordinate(Math.floor(timestampMs / 1000) as Time);
  if (direct != null) return direct;
  const nearest = getNearestTimePoint(timestampMs, timePoints);
  if (nearest == null) return null;
  return chart.timeScale().timeToCoordinate(Math.floor(nearest / 1000) as Time) ?? null;
}

function projectLine(
  chart: IChartApi,
  series: PatternSeries,
  line: PatternLine,
  timePoints: number[],
): ProjectedLine | null {
  const [from, to] = line.points;
  const x1 = projectTime(chart, from.time, timePoints);
  const x2 = projectTime(chart, to.time, timePoints);
  const y1 = series.priceToCoordinate(from.price);
  const y2 = series.priceToCoordinate(to.price);
  if (x1 == null || x2 == null || y1 == null || y2 == null) return null;
  return { x1, y1, x2, y2, isRay: line.kind === 'ray' };
}

function projectZone(
  chart: IChartApi,
  series: PatternSeries,
  zone: PatternZone,
  timePoints: number[],
): ProjectedZone | null {
  const x1 = projectTime(chart, zone.fromTime, timePoints);
  const x2 = projectTime(chart, zone.toTime, timePoints);
  const y1 = series.priceToCoordinate(zone.low);
  const y2 = series.priceToCoordinate(zone.high);
  if (x1 == null || x2 == null || y1 == null || y2 == null) return null;
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  return {
    x: left,
    y: top,
    w: Math.max(1, Math.abs(x2 - x1)),
    h: Math.max(1, Math.abs(y2 - y1)),
  };
}

class PatternRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(
    private readonly lines: readonly ProjectedLine[],
    private readonly zones: readonly ProjectedZone[],
    private readonly pivots: readonly ProjectedPivot[],
    private readonly label: ProjectedLabel | null,
    private readonly color: string,
    private readonly isFinished: boolean,
  ) {}

  draw(target: any): void {
    target.useBitmapCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const hRatio: number = scope.horizontalPixelRatio;
      const vRatio: number = scope.verticalPixelRatio;
      const width: number = scope.bitmapSize.width;

      ctx.save();

      ctx.fillStyle = `${this.color}${this.isFinished ? '18' : '24'}`;
      ctx.strokeStyle = `${this.color}55`;
      ctx.lineWidth = 0.75 * hRatio;
      for (const zone of this.zones) {
        const x = Math.round(zone.x * hRatio);
        const y = Math.round(zone.y * vRatio);
        const w = Math.max(1, Math.round(zone.w * hRatio));
        const h = Math.max(1, Math.round(zone.h * vRatio));
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }

      ctx.lineCap = 'round';
      for (const line of this.lines) {
        const x1 = Math.round(line.x1 * hRatio);
        const y1 = Math.round(line.y1 * vRatio);
        let x2 = Math.round(line.x2 * hRatio);
        let y2 = Math.round(line.y2 * vRatio);

        if (line.isRay && x2 > x1) {
          const slope = (y2 - y1) / Math.max(1, x2 - x1);
          y2 = Math.round(y1 + slope * (width - x1));
          x2 = width;
        }

        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 3.5 * hRatio;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.strokeStyle = this.color;
        ctx.lineWidth = (line.isRay ? 1.5 : 2) * hRatio;
        ctx.globalAlpha = line.isRay ? 0.78 : 1;
        ctx.setLineDash(line.isRay ? [4 * hRatio, 4 * hRatio] : []);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }

      for (const pivot of this.pivots) {
        const cx = Math.round(pivot.x * hRatio);
        const cy = Math.round(pivot.y * vRatio);
        ctx.beginPath();
        ctx.arc(cx, cy, 5 * hRatio, 0, Math.PI * 2);
        ctx.fillStyle = `${this.color}30`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, 2.5 * hRatio, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = 1 * hRatio;
        ctx.fill();
        ctx.stroke();
      }

      if (this.label) {
        ctx.font = `${Math.round(10 * hRatio)}px monospace`;
        ctx.fillStyle = this.color;
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3 * hRatio;
        const x = Math.round(this.label.x * hRatio);
        const y = Math.round(this.label.y * vRatio);
        ctx.strokeText(this.label.text, x, y);
        ctx.fillText(this.label.text, x, y);
      }

      ctx.restore();
    });
  }
}

class PatternPaneView implements ISeriesPrimitivePaneView {
  private _lines: readonly ProjectedLine[] = [];
  private _zones: readonly ProjectedZone[] = [];
  private _pivots: readonly ProjectedPivot[] = [];
  private _label: ProjectedLabel | null = null;

  constructor(private readonly primitive: PatternPrimitive) {}

  zOrder(): 'top' {
    return 'top';
  }

  update(): void {
    const { chart, series, pattern, timePoints } = this.primitive;
    if (!chart || !series || !pattern || timePoints.length === 0) {
      this._lines = [];
      this._zones = [];
      this._pivots = [];
      this._label = null;
      return;
    }

    this._lines = pattern.geometry.lines
      .map(line => projectLine(chart, series, line, timePoints))
      .filter((line): line is ProjectedLine => line !== null);
    this._zones = pattern.geometry.zones
      .map(zone => projectZone(chart, series, zone, timePoints))
      .filter((zone): zone is ProjectedZone => zone !== null);
    this._pivots = pattern.geometry.pivots
      .map(pivot => {
        const x = projectTime(chart, pivot.time, timePoints);
        const y = series.priceToCoordinate(pivot.price);
        return x == null || y == null ? null : { x, y: Number(y) };
      })
      .filter((pivot): pivot is ProjectedPivot => pivot !== null);

    const lastPivot = this._pivots.reduce<ProjectedPivot | null>(
      (latest, pivot) => (latest == null || pivot.x > latest.x ? pivot : latest),
      null,
    );
    this._label = lastPivot
      ? {
          x: lastPivot.x,
          y: lastPivot.y - 14,
          text: `${pattern.kind.toUpperCase()} (${pattern.quality}%)`,
        }
      : null;
  }

  renderer(): ISeriesPrimitivePaneRenderer | null {
    if (
      this._lines.length === 0 &&
      this._zones.length === 0 &&
      this._pivots.length === 0 &&
      this._label == null
    ) {
      return null;
    }
    return new PatternRenderer(
      this._lines,
      this._zones,
      this._pivots,
      this._label,
      this.primitive.color,
      this.primitive.pattern?.status === 'finished',
    );
  }
}

export function getPatternColor(kind: string): string {
  return PATTERN_STROKE_MAP[kind] ?? '#6366f1';
}

export function focusPatternLogicalRange(
  chart: IChartApi,
  pattern: PatternDetail,
  timePoints: number[],
): boolean {
  if (timePoints.length === 0) return false;
  const span = Math.max(60_000, pattern.geometry.anchorTimeTo - pattern.geometry.anchorTimeFrom);
  const midpoint = pattern.geometry.anchorTimeFrom + span / 2;
  const leftTarget = midpoint - span * 0.8;
  const rightTarget = midpoint + span * 1.0;
  const fromIndex = getNearestTimeIndex(leftTarget, timePoints);
  const toIndex = getNearestTimeIndex(rightTarget, timePoints);
  if (fromIndex == null || toIndex == null) return false;

  const from = Math.max(0, Math.min(fromIndex, toIndex) - 3);
  const to = Math.max(from + 10, Math.max(fromIndex, toIndex) + 3);
  try {
    chart.timeScale().setVisibleLogicalRange({ from, to });
    return true;
  } catch {
    return false;
  }
}

export class PatternPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: PatternSeries | null = null;
  pattern: PatternDetail | null = null;
  timePoints: number[] = [];
  color = '#6366f1';

  private readonly paneViewsRef: readonly PatternPaneView[] = [new PatternPaneView(this)];
  private requestUpdateRef: (() => void) | null = null;

  attached(param: SeriesAttachedParameter<Time, 'Candlestick'>): void {
    this.chart = param.chart as IChartApi;
    this.series = param.series;
    this.requestUpdateRef = param.requestUpdate;
    this.requestUpdateRef();
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdateRef = null;
  }

  updateAllViews(): void {
    for (const view of this.paneViewsRef) {
      view.update();
    }
  }

  paneViews(): readonly ISeriesPrimitivePaneView[] {
    return this.paneViewsRef;
  }

  autoscaleInfo(_from: Logical, _to: Logical): AutoscaleInfo | null {
    const pattern = this.pattern;
    if (!pattern || pattern.status === 'finished') return null;
    const padding = Math.max(1e-8, (pattern.geometry.priceMax - pattern.geometry.priceMin) * 0.12);
    return {
      priceRange: {
        minValue: pattern.geometry.priceMin - padding,
        maxValue: pattern.geometry.priceMax + padding,
      },
    };
  }

  setPattern(pattern: PatternDetail | null, timePoints: number[]): void {
    this.pattern = pattern;
    this.timePoints = timePoints;
    this.color = pattern ? getPatternColor(pattern.kind) : '#6366f1';
    this.requestUpdateRef?.();
  }
}
