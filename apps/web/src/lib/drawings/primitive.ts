import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { AnyDrawing, RulerDrawing } from './models';
import {
  type ChartProjectionContext,
  projectHorizontalLine,
  projectRangeBox,
  projectRectangle,
  projectTrendline,
} from './engine';
import type { RangeMetricCandle } from './range-metrics';
import { calculateRangeMetrics } from './range-metrics';
import { getRangeStyle } from './range-style';

interface DrawingPrimitiveState {
  drawings: AnyDrawing[];
  hidden: boolean;
  lastBarTime: number | null;
  selectedDrawingId: string | null;
  measurementCandles: RangeMetricCandle[];
  temporaryMeasure: RulerDrawing | null;
}

class DrawingPrimitiveRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(private readonly primitive: DrawingPrimitive) {}

  private drawRange(
    context: CanvasRenderingContext2D,
    projection: ChartProjectionContext,
    drawing: RulerDrawing,
    selected: boolean,
    measurementCandles: RangeMetricCandle[],
    temporary = false,
  ) {
    const box = projectRangeBox(drawing, projection);
    if (!box) return;

    const metrics = calculateRangeMetrics(drawing, measurementCandles);
    const style = getRangeStyle(metrics.priceDelta);
    const deltaLabel = `${metrics.priceDelta >= 0 ? '+' : ''}${metrics.priceDelta.toFixed(3)} (${Math.abs(metrics.percentDelta).toFixed(2)}%) ${drawing.p2.price.toFixed(1)}`;
    const timeDays = Math.max(1, Math.round(metrics.timeMs / 86400000));
    const subLabel = `Бары: ${metrics.bars}, ${timeDays}д`;
    const centerX = (box.x1 + box.x2) / 2;
    const topY = Math.min(box.y1, box.y2);
    const bottomY = Math.max(box.y1, box.y2);
    const midY = (topY + bottomY) / 2;

    context.save();
    context.fillStyle = style.fill;
    context.fillRect(box.x, box.y, box.width, box.height);

    context.beginPath();
    context.moveTo(centerX, topY);
    context.lineTo(centerX, bottomY);
    context.strokeStyle = style.line;
    context.lineWidth = selected ? 1.6 : 1.2;
    context.setLineDash(temporary ? [4, 3] : []);
    context.stroke();

    context.beginPath();
    context.moveTo(box.x, midY);
    context.lineTo(box.x + box.width, midY);
    context.strokeStyle = style.line;
    context.lineWidth = 1;
    context.setLineDash([]);
    context.stroke();

    context.beginPath();
    context.moveTo(centerX, topY);
    context.lineTo(centerX - 5, topY + 7);
    context.moveTo(centerX, topY);
    context.lineTo(centerX + 5, topY + 7);
    context.strokeStyle = style.line;
    context.lineWidth = 1;
    context.stroke();

    if (selected && !temporary) {
      context.setLineDash([]);
      context.fillStyle = style.handle;
      context.strokeStyle = style.line;
      for (const [x, y] of [[centerX, topY], [centerX, bottomY]] as const) {
        context.beginPath();
        context.arc(x, y, 3.5, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      }
    }

    context.setLineDash([]);
    context.font = 'bold 11px Inter, sans-serif';
    const line1Width = context.measureText(deltaLabel).width;
    context.font = '600 11px Inter, sans-serif';
    const line2Width = context.measureText(subLabel).width;
    const labelWidth = Math.max(line1Width, line2Width) + 20;
    const labelHeight = 42;
    const labelX = Math.min(Math.max(centerX - (labelWidth / 2), 4), Math.max(4, projection.width - labelWidth - 4));
    const labelY = Math.max(4, topY - labelHeight - 10);

    context.shadowColor = 'rgba(15, 23, 42, 0.24)';
    context.shadowBlur = 10;
    context.fillStyle = style.textBg;
    context.beginPath();
    context.roundRect(labelX, labelY, labelWidth, labelHeight, 5);
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = style.textFg;
    context.font = 'bold 11px Inter, sans-serif';
    context.fillText(deltaLabel, labelX + ((labelWidth - line1Width) / 2), labelY + 16);
    context.font = '600 11px Inter, sans-serif';
    context.fillText(subLabel, labelX + ((labelWidth - line2Width) / 2), labelY + 31);
    context.restore();
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      const projection = this.primitive.projectionContext(mediaSize.width, mediaSize.height);
      if (!projection) return;

      const { drawings, measurementCandles, temporaryMeasure } = this.primitive.state();
      context.save();

      for (const drawing of drawings) {
        const selected = this.primitive.state().selectedDrawingId === drawing.id;

        if (drawing.kind === 'horizontal_line' || drawing.kind === 'signal_level') {
          const line = projectHorizontalLine(drawing, projection);
          if (!line) continue;

          context.save();
          context.beginPath();
          context.moveTo(line.x1, line.y1);
          context.lineTo(line.x2, line.y2);
          context.strokeStyle = drawing.style.color;
          context.lineWidth = selected ? drawing.style.lineWidth + 0.6 : drawing.style.lineWidth;
          context.globalAlpha = drawing.kind === 'signal_level' && drawing.triggered ? 0.45 : 1;
          context.setLineDash(drawing.kind === 'signal_level' ? [5, 4] : []);
          context.stroke();
          context.restore();
          continue;
        }

        if (drawing.kind === 'trendline') {
          const line = projectTrendline(drawing, projection);
          if (!line) continue;

          context.beginPath();
          context.moveTo(line.x1, line.y1);
          context.lineTo(line.x2, line.y2);
          context.strokeStyle = drawing.style.color;
          context.lineWidth = selected ? drawing.style.lineWidth + 0.6 : drawing.style.lineWidth;
          context.setLineDash([]);
          context.stroke();
          continue;
        }

        if (drawing.kind === 'ruler') {
          this.drawRange(context, projection, drawing, selected, measurementCandles);
          continue;
        }

        if (drawing.kind === 'rectangle') {
          const rect = projectRectangle(drawing, projection);
          if (!rect) continue;

          context.fillStyle = drawing.style.color;
          context.globalAlpha = drawing.style.fillOpacity;
          context.fillRect(rect.x, rect.y, rect.width, rect.height);
          context.globalAlpha = 1;
          context.strokeStyle = drawing.style.color;
          context.lineWidth = selected ? drawing.style.lineWidth + 0.6 : drawing.style.lineWidth;
          context.setLineDash([]);
          context.strokeRect(rect.x, rect.y, rect.width, rect.height);
        }
      }

      if (temporaryMeasure) {
        this.drawRange(context, projection, temporaryMeasure, false, measurementCandles, true);
      }

      context.restore();
    });
  }
}

class DrawingPrimitivePaneView implements ISeriesPrimitivePaneView {
  constructor(private readonly rendererInstance: DrawingPrimitiveRenderer) {}

  zOrder() {
    return 'top' as const;
  }

  renderer(): ISeriesPrimitivePaneRenderer {
    return this.rendererInstance;
  }
}

export class DrawingPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Candlestick'> | null = null;
  private requestUpdate: (() => void) | null = null;
  private currentState: DrawingPrimitiveState = {
    drawings: [],
    hidden: false,
    lastBarTime: null,
    selectedDrawingId: null,
    measurementCandles: [],
    temporaryMeasure: null,
  };
  private readonly rendererInstance = new DrawingPrimitiveRenderer(this);
  private readonly paneView = new DrawingPrimitivePaneView(this.rendererInstance);

  attached(param: SeriesAttachedParameter<Time, 'Candlestick'>): void {
    this.chart = param.chart;
    this.series = param.series;
    this.requestUpdate = param.requestUpdate;
    this.requestUpdate?.();
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  updateAllViews?(): void {}

  paneViews(): readonly ISeriesPrimitivePaneView[] {
    return this.currentState.hidden ? [] : [this.paneView];
  }

  setState(state: DrawingPrimitiveState): void {
    this.currentState = state;
    this.requestUpdate?.();
  }

  state(): DrawingPrimitiveState {
    return this.currentState;
  }

  projectionContext(width: number, height: number): ChartProjectionContext | null {
    if (!this.chart || !this.series) return null;

    const lastBarTime = this.currentState.lastBarTime;
    const lastBarX =
      lastBarTime === null ? null : this.chart.timeScale().timeToCoordinate(lastBarTime as Time);
    const lastRealLogical =
      lastBarX === null ? null : this.chart.timeScale().coordinateToLogical(lastBarX);

    return {
      width,
      height,
      timeToX: (time: number) => this.chart!.timeScale().timeToCoordinate(time as Time),
      logicalToX: (logical: number) => this.chart!.timeScale().logicalToCoordinate(logical as any),
      lastRealLogical: lastRealLogical === null ? null : Number(lastRealLogical),
      priceToY: (price: number) => this.series!.priceToCoordinate(price),
    };
  }
}
