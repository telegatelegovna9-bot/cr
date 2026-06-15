import type {
  IChartApi,
  ISeriesApi,
  Time,
  AutoscaleInfo,
} from 'lightweight-charts';
import type { PatternDetail } from './models';

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

export function getPatternColor(kind: string): string {
  return PATTERN_STROKE_MAP[kind] ?? '#6366f1';
}

class PatternRenderer {
  constructor(
    private readonly lines: Array<{ x1: number; y1: number; x2: number; y2: number; isRay: boolean; extX2?: number; extY2?: number }>,
    private readonly zones: Array<{ x: number; y: number; w: number; h: number }>,
    private readonly pivots: Array<{ x: number; y: number }>,
    private readonly color: string,
    private readonly isFinished: boolean,
  ) {}

  draw(target: any): void {
    target.useBitmapCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const pr: number = scope.horizontalPixelRatio;
      const pv: number = scope.verticalPixelRatio;
      const canvasW: number = scope.bitmapSize.width;
      const canvasH: number = scope.bitmapSize.height;

      ctx.save();

      // Zones
      ctx.fillStyle = this.color + (this.isFinished ? '18' : '28');
      for (const z of this.zones) {
        ctx.fillRect(
          Math.round(z.x * pr),
          Math.round(z.y * pv),
          Math.round(z.w * pr),
          Math.round(z.h * pv),
        );
        ctx.strokeStyle = this.color + '45';
        ctx.lineWidth = 0.75 * pr;
        ctx.setLineDash([]);
        ctx.strokeRect(
          Math.round(z.x * pr),
          Math.round(z.y * pv),
          Math.round(z.w * pr),
          Math.round(z.h * pv),
        );
      }

      // Lines
      ctx.lineCap = 'round';
      for (const l of this.lines) {
        const x1 = Math.round(l.x1 * pr);
        const y1 = Math.round(l.y1 * pv);
        let x2 = Math.round(l.x2 * pr);
        let y2 = Math.round(l.y2 * pv);

        if (l.isRay && x2 > x1) {
          // Extend ray to right canvas edge, computing Y via slope
          const slope = (y2 - y1) / (x2 - x1);
          y2 = Math.round(y1 + slope * (canvasW - x1));
          x2 = canvasW;
        }

        // Clip to canvas bounds roughly
        if ((x1 < 0 && x2 < 0) || (y1 < -canvasH && y2 < -canvasH)) continue;

        // Drop-shadow
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 3.5 * pr;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Colored line
        ctx.strokeStyle = this.color;
        ctx.lineWidth = (l.isRay ? 1.5 : 2) * pr;
        ctx.globalAlpha = l.isRay ? 0.78 : 1;
        ctx.setLineDash(l.isRay ? [4 * pr, 4 * pr] : []);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }

      // Pivot dots
      for (const p of this.pivots) {
        const cx = Math.round(p.x * pr);
        const cy = Math.round(p.y * pv);
        if (cx < -10 || cx > canvasW + 10 || cy < -10 || cy > canvasH + 10) continue;

        ctx.beginPath();
        ctx.arc(cx, cy, 5 * pr, 0, Math.PI * 2);
        ctx.fillStyle = this.color + '30';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, 2.5 * pr, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 1 * pr;
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    });
  }
}

class PatternPaneView {
  private _lines: PatternRenderer['lines'] = [];
  private _zones: PatternRenderer['zones'] = [];
  private _pivots: PatternRenderer['pivots'] = [];

  constructor(private readonly primitive: PatternPrimitive) {}

  zOrder(): 'top' {
    return 'top';
  }

  update(): void {
    const { chart, series, pattern } = this.primitive;
    if (!chart || !series || !pattern) {
      this._lines = [];
      this._zones = [];
      this._pivots = [];
      return;
    }

    const ts = chart.timeScale();

    const toX = (ms: number): number | null => {
      const coord = ts.timeToCoordinate(Math.floor(ms / 1000) as Time);
      return coord ?? null;
    };

    const toY = (price: number): number | null => {
      const coord = series.priceToCoordinate(price);
      return coord ?? null;
    };

    this._lines = pattern.geometry.lines.flatMap(line => {
      const [from, to] = line.points;
      const x1 = toX(from.time);
      const y1 = toY(from.price);
      if (x1 == null || y1 == null) return [];

      // For ray lines, x2 might be off-screen to the right — that's OK, we extend in the renderer
      const x2 = toX(to.time) ?? x1 + 300;
      const y2 = toY(to.price) ?? y1;

      return [{ x1, y1, x2, y2, isRay: line.kind === 'ray' }];
    });

    this._zones = pattern.geometry.zones.flatMap(zone => {
      const y1 = toY(zone.low);
      const y2 = toY(zone.high);
      if (y1 == null || y2 == null) return [];

      const x1 = toX(zone.fromTime);
      const x2 = toX(zone.toTime);

      // Allow partial visibility — clip to 0 on left
      const effectiveX1 = x1 ?? 0;
      const effectiveX2 = x2 ?? effectiveX1 + 400;

      const left = Math.min(effectiveX1, effectiveX2);
      const top = Math.min(y1, y2);
      const w = Math.abs(effectiveX2 - effectiveX1);
      const h = Math.abs(y2 - y1);

      if (w < 1 || h < 1) return [];
      return [{ x: left, y: top, w, h }];
    });

    this._pivots = pattern.geometry.pivots.flatMap(pivot => {
      const x = toX(pivot.time);
      const y = toY(pivot.price);
      if (x == null || y == null) return [];
      return [{ x, y }];
    });
  }

  renderer(): PatternRenderer {
    return new PatternRenderer(
      this._lines,
      this._zones,
      this._pivots,
      this.primitive.color,
      this.primitive.pattern?.status === 'finished',
    );
  }
}

export class PatternPrimitive {
  chart: IChartApi | null = null;
  series: ISeriesApi<'Candlestick'> | null = null;
  pattern: PatternDetail | null = null;
  color: string = '#34d399';

  private readonly _paneViews = [new PatternPaneView(this)];
  private _requestUpdate: (() => void) | undefined;

  updateAllViews(): void {
    for (const view of this._paneViews) {
      view.update();
    }
  }

  paneViews() {
    return this._paneViews;
  }

  attached(params: { chart: IChartApi; series: ISeriesApi<'Candlestick'>; requestUpdate: () => void }): void {
    this.chart = params.chart;
    this.series = params.series;
    this._requestUpdate = params.requestUpdate;
    // Apply any pattern that was set before attachment
    if (this.pattern) {
      this._requestUpdate();
    }
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this._requestUpdate = undefined;
  }

  setPattern(pattern: PatternDetail | null, color?: string): void {
    this.pattern = pattern;
    if (color) this.color = color;
    this._requestUpdate?.();
  }

  autoscaleInfo(): AutoscaleInfo | null {
    const p = this.pattern;
    if (!p || p.status === 'finished') return null;
    const padding = (p.geometry.priceMax - p.geometry.priceMin) * 0.12;
    return {
      priceRange: {
        minValue: p.geometry.priceMin - padding,
        maxValue: p.geometry.priceMax + padding,
      },
    };
  }
}
