export interface RangeStyleTokens {
  direction: 'up' | 'down' | 'flat';
  fill: string;
  border: string;
  line: string;
  textBg: string;
  textFg: string;
  handle: string;
}

export function getRangeStyle(priceDelta: number): RangeStyleTokens {
  if (priceDelta < 0) {
    return {
      direction: 'down',
      fill: 'rgba(239, 68, 68, 0.16)',
      border: 'rgba(239, 68, 68, 0.9)',
      line: 'rgba(239, 68, 68, 0.95)',
      textBg: 'rgba(127, 29, 29, 0.95)',
      textFg: '#fee2e2',
      handle: '#ef4444',
    };
  }

  if (priceDelta > 0) {
    return {
      direction: 'up',
      fill: 'rgba(59, 130, 246, 0.16)',
      border: 'rgba(59, 130, 246, 0.9)',
      line: 'rgba(59, 130, 246, 0.95)',
      textBg: 'rgba(30, 64, 175, 0.95)',
      textFg: '#dbeafe',
      handle: '#3b82f6',
    };
  }

  return {
    direction: 'flat',
    fill: 'rgba(148, 163, 184, 0.16)',
    border: 'rgba(148, 163, 184, 0.9)',
    line: 'rgba(148, 163, 184, 0.95)',
    textBg: 'rgba(51, 65, 85, 0.95)',
    textFg: '#e2e8f0',
    handle: '#94a3b8',
  };
}
