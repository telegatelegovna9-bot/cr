import type { PatternKind } from './models';

export const PATTERN_COLOR_MAP: Record<
  PatternKind,
  { text: string; bg: string; border: string }
> = {
  breakout: {
    text: 'text-emerald-300',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
  },
  retest: {
    text: 'text-sky-300',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
  },
  structure_break: {
    text: 'text-fuchsia-300',
    bg: 'bg-fuchsia-500/10',
    border: 'border-fuchsia-500/30',
  },
  liquidity_sweep: {
    text: 'text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
  },
  triangle: {
    text: 'text-violet-300',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
  },
  wedge: {
    text: 'text-rose-300',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
  },
  flag: {
    text: 'text-green-300',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
  },
  cascade: {
    text: 'text-orange-300',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
  },
  fvg: {
    text: 'text-yellow-300',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
  },
};

export const PATTERN_LABEL_MAP: Record<PatternKind, string> = {
  breakout: 'Breakout',
  retest: 'Retest',
  structure_break: 'BOS',
  liquidity_sweep: 'Sweep',
  triangle: 'Triangle',
  wedge: 'Wedge',
  flag: 'Flag',
  cascade: 'Cascade',
  fvg: 'FVG',
};

const FALLBACK_PATTERN_UI = {
  text: 'text-text-secondary',
  bg: 'bg-bg-secondary/40',
  border: 'border-border',
};

export function getPatternUi(kind: string) {
  return PATTERN_COLOR_MAP[kind as PatternKind] ?? FALLBACK_PATTERN_UI;
}

export function getPatternLabel(kind: string) {
  return PATTERN_LABEL_MAP[kind as PatternKind] ?? kind.replace(/_/g, ' ');
}
