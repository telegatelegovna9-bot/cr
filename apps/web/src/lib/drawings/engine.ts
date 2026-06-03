import type { AnyDrawing } from './models';

export interface ChartProjectionContext {
  width: number;
  height: number;
  timeToX: (time: number) => number | null;
  priceToY: (price: number) => number | null;
}

export function projectHorizontalLine(
  drawing: { price: number },
  ctx: ChartProjectionContext
) {
  const y = ctx.priceToY(drawing.price);
  if (y === null) return null;
  return { x1: 0, y1: y, x2: ctx.width, y2: y };
}

export function projectVerticalLine(
  drawing: { time: number },
  ctx: ChartProjectionContext
) {
  const x = ctx.timeToX(drawing.time);
  if (x === null) return null;
  return { x1: x, y1: 0, x2: x, y2: ctx.height };
}

export function projectTrendline(
  drawing: { p1: { time: number; price: number }; p2: { time: number; price: number } },
  ctx: ChartProjectionContext
) {
  const x1Raw = ctx.timeToX(drawing.p1.time);
  const y1 = ctx.priceToY(drawing.p1.price);
  const x2Raw = ctx.timeToX(drawing.p2.time);
  const y2 = ctx.priceToY(drawing.p2.price);

  // Both time coords null → line entirely off-screen
  if (x1Raw === null && x2Raw === null) return null;
  if (y1 === null || y2 === null) return null;

  // Extrapolate off-screen x based on time order so SVG clips the line correctly
  const x1 = x1Raw ?? (drawing.p1.time < drawing.p2.time ? -9999 : ctx.width + 9999);
  const x2 = x2Raw ?? (drawing.p2.time > drawing.p1.time ? ctx.width + 9999 : -9999);

  return { x1, y1, x2, y2 };
}

export function projectRectangle(
  drawing: { p1: { time: number; price: number }; p2: { time: number; price: number } },
  ctx: ChartProjectionContext
) {
  const x1Raw = ctx.timeToX(drawing.p1.time);
  const y1Raw = ctx.priceToY(drawing.p1.price);
  const x2Raw = ctx.timeToX(drawing.p2.time);
  const y2Raw = ctx.priceToY(drawing.p2.price);

  if (x1Raw === null && x2Raw === null) return null;
  if (y1Raw === null && y2Raw === null) return null;

  const x1 = x1Raw ?? (drawing.p1.time < drawing.p2.time ? -9999 : ctx.width + 9999);
  const x2 = x2Raw ?? (drawing.p2.time > drawing.p1.time ? ctx.width + 9999 : -9999);
  const y1 = y1Raw ?? (drawing.p1.price > drawing.p2.price ? -9999 : ctx.height + 9999);
  const y2 = y2Raw ?? (drawing.p2.price < drawing.p1.price ? ctx.height + 9999 : -9999);

  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
    x1, y1, x2, y2
  };
}

export function hitTestPoint(x: number, y: number, px: number, py: number, radius: number): boolean {
  const dx = x - px;
  const dy = y - py;
  return dx * dx + dy * dy <= radius * radius;
}

export function hitTestRectangleHandle(args: {
  x: number;
  y: number;
  handleX: number;
  handleY: number;
  radius: number;
}): boolean {
  return hitTestPoint(args.x, args.y, args.handleX, args.handleY, args.radius);
}

export function hitTestLine(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tolerance: number
): boolean {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return hitTestPoint(px, py, x1, y1, tolerance);
  
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  
  const closestX = x1 + t * (x2 - x1);
  const closestY = y1 + t * (y2 - y1);
  
  return hitTestPoint(px, py, closestX, closestY, tolerance);
}

export function nextToolState(
  state: { selectedTool: string; hidden: boolean },
  action: { type: 'toggle-hidden' | 'select-tool'; tool?: string }
) {
  if (action.type === 'toggle-hidden') {
    return { ...state, hidden: !state.hidden };
  }
  if (action.type === 'select-tool') {
    return { ...state, selectedTool: action.tool || 'cursor' };
  }
  return state;
}
