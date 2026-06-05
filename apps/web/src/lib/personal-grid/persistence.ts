import {
  DEFAULT_PERSONAL_GRID_STATE,
  type PersonalGridLayout,
  type PersonalGridState,
} from './models';
import type { Timeframe } from '@crypto-screener/shared';

export const PERSONAL_GRID_STORAGE_KEY = 'aionui.personal-grid.v1';

function isValidLayout(value: unknown): value is PersonalGridLayout {
  return value === 1 || value === 4 || value === 6;
}

function isValidTimeframe(value: unknown): value is Timeframe {
  return value === '1m' || value === '5m' || value === '15m' || value === '1h' || value === '4h' || value === '1d' || value === '1w';
}

function normalizeState(value: unknown): PersonalGridState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const state = value as Partial<PersonalGridState> & {
    slots?: Array<{
      id?: unknown;
      symbol?: unknown;
      exchange?: unknown;
      marketType?: unknown;
      timeframe?: unknown;
    }>;
  };

  if (!isValidLayout(state.layout)) {
    return null;
  }

  if (!Array.isArray(state.slots) || state.slots.length !== 6) {
    return null;
  }

  if (state.expandedSlotId !== null && state.expandedSlotId !== undefined && typeof state.expandedSlotId !== 'string') {
    return null;
  }

  const slots = state.slots.map(slot => {
    if (
      !slot ||
      typeof slot !== 'object' ||
      typeof slot.id !== 'string' ||
      (slot.symbol !== null && slot.symbol !== undefined && typeof slot.symbol !== 'string') ||
      (slot.exchange !== null && slot.exchange !== undefined && typeof slot.exchange !== 'string') ||
      (slot.marketType !== null && slot.marketType !== undefined && slot.marketType !== 'spot' && slot.marketType !== 'futures') ||
      (slot.timeframe !== null && slot.timeframe !== undefined && !isValidTimeframe(slot.timeframe))
    ) {
      return null;
    }

    return {
      id: slot.id,
      symbol: slot.symbol ?? null,
      exchange: slot.exchange ?? null,
      marketType: slot.marketType ?? null,
      timeframe: slot.timeframe ?? null,
    };
  });

  if (slots.some(slot => slot === null)) {
    return null;
  }

  return {
    layout: state.layout,
    expandedSlotId: state.expandedSlotId ?? null,
    slots: slots.filter((slot): slot is NonNullable<typeof slot> => slot !== null),
  };
}

function isValidState(value: unknown): value is PersonalGridState {
  return normalizeState(value) !== null;
}

export function loadPersistedPersonalGrid(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): PersonalGridState {
  if (!storage) {
    return DEFAULT_PERSONAL_GRID_STATE;
  }

  const raw = storage.getItem(PERSONAL_GRID_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_PERSONAL_GRID_STATE;
  }

  try {
    const parsed = JSON.parse(raw);
    return normalizeState(parsed) ?? DEFAULT_PERSONAL_GRID_STATE;
  } catch {
    return DEFAULT_PERSONAL_GRID_STATE;
  }
}

export function savePersistedPersonalGrid(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  state: PersonalGridState,
): PersonalGridState {
  if (!storage) {
    return state;
  }

  storage.setItem(PERSONAL_GRID_STORAGE_KEY, JSON.stringify(state));
  return state;
}
