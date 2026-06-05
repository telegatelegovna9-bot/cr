import {
  DEFAULT_PATTERNS_UI_STATE,
  type PatternFilters,
  type PatternsUIState,
} from './models';

export const PATTERNS_UI_STORAGE_KEY = 'aionui.patterns-ui.v1';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isValidFilters(value: unknown): value is PatternFilters {
  if (!value || typeof value !== 'object') return false;
  const filters = value as PatternFilters;
  return (
    isStringArray(filters.kinds) &&
    isStringArray(filters.timeframes) &&
    isStringArray(filters.statuses)
  );
}

export function loadPersistedPatternsUIState(storage: Storage | null | undefined): PatternsUIState {
  if (!storage) return DEFAULT_PATTERNS_UI_STATE;

  const raw = storage.getItem(PATTERNS_UI_STORAGE_KEY);
  if (!raw) return DEFAULT_PATTERNS_UI_STATE;

  try {
    const parsed = JSON.parse(raw) as Partial<PatternsUIState>;
    if (
      typeof parsed.search !== 'string' ||
      (parsed.selectedPatternId !== null && typeof parsed.selectedPatternId !== 'string') ||
      !isValidFilters(parsed.filters)
    ) {
      return DEFAULT_PATTERNS_UI_STATE;
    }

    return {
      search: parsed.search,
      selectedPatternId: parsed.selectedPatternId ?? null,
      filters: parsed.filters,
    };
  } catch {
    return DEFAULT_PATTERNS_UI_STATE;
  }
}

export function savePersistedPatternsUIState(
  storage: Storage | null | undefined,
  state: PatternsUIState,
): void {
  if (!storage) return;
  storage.setItem(PATTERNS_UI_STORAGE_KEY, JSON.stringify(state));
}
