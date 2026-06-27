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
      fill: 'rgba(239, 68, 68, 0.18)',
      border: 'rgba(239, 68, 68, 0.95)',
      line: 'rgba(239, 68, 68, 1)',
      textBg: 'rgba(185, 28, 28, 0.96)',
      textFg: '#ffffff',
      handle: '#ffffff',
    };
  }

  if (priceDelta > 0) {
    return {
      direction: 'up',
      fill: 'rgba(34, 197, 94, 0.18)',
      border: 'rgba(34, 197, 94, 0.95)',
      line: 'rgba(34, 197, 94, 1)',
      textBg: 'rgba(21, 128, 61, 0.96)',
      textFg: '#ffffff',
      handle: '#ffffff',
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
