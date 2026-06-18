export type SummaryLevel = { price: number; usd: number } | null;

export interface HeatmapSummarySnapshot {
  barrier: SummaryLevel;
  topAbove: SummaryLevel;
  topBelow: SummaryLevel;
  bias: 'pull up' | 'pull down' | 'balanced';
  upPath: 'clear' | 'mixed' | 'blocked';
  downPath: 'clear' | 'mixed' | 'blocked';
}

function isLevelEqual(left: SummaryLevel, right: SummaryLevel): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  return left.price === right.price && left.usd === right.usd;
}

export function areHeatmapSummariesEqual(
  left: HeatmapSummarySnapshot | null,
  right: HeatmapSummarySnapshot | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;

  return (
    isLevelEqual(left.barrier, right.barrier) &&
    isLevelEqual(left.topAbove, right.topAbove) &&
    isLevelEqual(left.topBelow, right.topBelow) &&
    left.bias === right.bias &&
    left.upPath === right.upPath &&
    left.downPath === right.downPath
  );
}

export function shouldCommitHeatmapSummary(params: {
  previous: HeatmapSummarySnapshot | null;
  next: HeatmapSummarySnapshot;
  lastCommittedAt: number;
  now: number;
  minIntervalMs: number;
}): boolean {
  if (!params.previous) return true;
  if (areHeatmapSummariesEqual(params.previous, params.next)) return false;
  return params.now - params.lastCommittedAt >= params.minIntervalMs;
}
