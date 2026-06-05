import type { PatternKind } from './models';

export const PATTERN_COLOR_MAP: Record<
  PatternKind,
  { text: string; bg: string; border: string }
> = {
  cascade: {
    text: 'text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
  },
  trendline: {
    text: 'text-sky-300',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
  },
  triangle: {
    text: 'text-emerald-300',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
  },
};
