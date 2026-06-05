import {
  DEFAULT_PERSONAL_GRID_STATE,
  type PersonalGridLayout,
  type PersonalGridState,
} from './models';

export const PERSONAL_GRID_STORAGE_KEY = 'aionui.personal-grid.v1';

function isValidLayout(value: unknown): value is PersonalGridLayout {
  return value === 1 || value === 4 || value === 6;
}

function isValidState(value: unknown): value is PersonalGridState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const state = value as PersonalGridState;

  if (!isValidLayout(state.layout)) {
    return false;
  }

  if (!Array.isArray(state.slots) || state.slots.length !== 6) {
    return false;
  }

  if (state.expandedSlotId !== null && typeof state.expandedSlotId !== 'string') {
    return false;
  }

  return state.slots.every(
    slot =>
      !!slot &&
      typeof slot === 'object' &&
      typeof slot.id === 'string' &&
      (slot.symbol === null || typeof slot.symbol === 'string') &&
      (slot.exchange === null || typeof slot.exchange === 'string') &&
      (slot.marketType === null || slot.marketType === 'spot' || slot.marketType === 'futures'),
  );
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
    return isValidState(parsed) ? parsed : DEFAULT_PERSONAL_GRID_STATE;
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
