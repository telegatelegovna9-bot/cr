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
  triangle_symmetrical: {
    text: 'text-emerald-300',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
  },
  triangle_ascending: {
    text: 'text-green-300',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
  },
  triangle_descending: {
    text: 'text-rose-300',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
  },
  channel_up: {
    text: 'text-blue-300',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
  },
  channel_down: {
    text: 'text-orange-300',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
  },
};
