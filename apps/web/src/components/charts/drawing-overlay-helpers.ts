export interface OverlayPoint {
  x: number;
  y: number;
}

export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LogicalRangeLike {
  from: number;
  to: number;
}

export function getLocalOverlayPoint(
  clientX: number,
  clientY: number,
  rect: OverlayRect,
  targetWidth: number,
  targetHeight: number,
): OverlayPoint {
  const scaleX = rect.width > 0 && targetWidth > 0 ? targetWidth / rect.width : 1;
  const scaleY = rect.height > 0 && targetHeight > 0 ? targetHeight / rect.height : 1;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

export function panLogicalRange(
  range: LogicalRangeLike | null,
  deltaX: number,
  viewportWidth: number,
): LogicalRangeLike | null {
  if (!range || viewportWidth <= 0) {
    return null;
  }

  const logicalSpan = range.to - range.from;
  const barsPerPixel = logicalSpan / viewportWidth;
  const deltaBars = deltaX * barsPerPixel;

  return {
    from: range.from - deltaBars,
    to: range.to - deltaBars,
  };
}
