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
import type { AnyDrawing } from './models';
import {
  type ChartProjectionContext,
  projectHorizontalLine,
  projectRuler,
  projectRectangle,
  projectTrendline,
} from './engine';

interface DrawingPrimitiveState {
  drawings: AnyDrawing[];
  hidden: boolean;
  lastBarTime: number | null;
  selectedDrawingId: string | null;
}

class DrawingPrimitiveRenderer implements ISeriesPrimitivePaneRenderer {
  constructor(private readonly primitive: DrawingPrimitive) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      const projection = this.primitive.projectionContext(mediaSize.width, mediaSize.height);
      if (!projection) return;

      const { drawings } = this.primitive.state();
      context.save();

      for (const drawing of drawings) {
        const selected = this.primitive.state().selectedDrawingId === drawing.id;

        if (drawing.kind === 'horizontal_line' || drawing.kind === 'signal_level') {
          const line = projectHorizontalLine(drawing, projection);
          if (!line) continue;

          context.beginPath();
          context.moveTo(line.x1, line.y1);
          context.lineTo(line.x2, line.y2);
          context.strokeStyle = drawing.style.color;
          context.lineWidth = selected ? drawing.style.lineWidth + 1 : drawing.style.lineWidth;
          context.setLineDash(drawing.kind === 'signal_level' ? [5, 4] : []);
          context.stroke();
          continue;
        }

        if (drawing.kind === 'trendline') {
          const line = projectTrendline(drawing, projection);
          if (!line) continue;

          context.beginPath();
          context.moveTo(line.x1, line.y1);
          context.lineTo(line.x2, line.y2);
          context.strokeStyle = drawing.style.color;
          context.lineWidth = selected ? drawing.style.lineWidth + 1 : drawing.style.lineWidth;
          context.setLineDash([]);
          context.stroke();
          continue;
        }

        if (drawing.kind === 'ruler') {
          const line = projectRuler(drawing, projection);
          if (!line) continue;

          const delta = drawing.p2.price - drawing.p1.price;
          const percent = drawing.p1.price === 0 ? 0 : (delta / drawing.p1.price) * 100;
          const midX = (line.x1 + line.x2) / 2;
          const midY = (line.y1 + line.y2) / 2;

          context.beginPath();
          context.moveTo(line.x1, line.y1);
          context.lineTo(line.x2, line.y2);
          context.strokeStyle = '#f59e0b';
          context.lineWidth = selected ? 3 : 2;
          context.setLineDash([6, 4]);
          context.stroke();

          context.setLineDash([]);
          context.fillStyle = 'rgba(15, 23, 42, 0.92)';
          context.strokeStyle = '#f59e0b';
          context.lineWidth = 1;
          context.font = '11px JetBrains Mono, monospace';
          const label = `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} (${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%)`;
          const textWidth = context.measureText(label).width;
          const boxWidth = textWidth + 10;
          const boxHeight = 18;
          context.fillRect(midX - boxWidth / 2, midY - boxHeight - 6, boxWidth, boxHeight);
          context.strokeRect(midX - boxWidth / 2, midY - boxHeight - 6, boxWidth, boxHeight);
          context.fillStyle = '#f8fafc';
          context.fillText(label, midX - textWidth / 2, midY - 12);
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
          context.lineWidth = selected ? drawing.style.lineWidth + 1 : drawing.style.lineWidth;
          context.setLineDash([]);
          context.strokeRect(rect.x, rect.y, rect.width, rect.height);
        }
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
