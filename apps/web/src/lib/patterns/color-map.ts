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
};

export const PATTERN_LABEL_MAP: Record<PatternKind, string> = {
  breakout: 'Breakout',
  retest: 'Retest',
  structure_break: 'Structure Break',
  liquidity_sweep: 'Liquidity Sweep',
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
