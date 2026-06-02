import type { AnyDrawing } from './models';

export const DRAWINGS_STORAGE_KEY = 'aionui_drawings_v1';

export interface PersistedDrawingsState {
  version: 1;
  drawings: AnyDrawing[];
}

const EMPTY_PERSISTED_DRAWINGS_STATE: PersistedDrawingsState = {
  version: 1,
  drawings: [],
};

function isDrawingArray(value: unknown): value is AnyDrawing[] {
  if (!Array.isArray(value)) return false;
  return value.every(item => typeof item === 'object' && item !== null);
}

export function loadPersistedDrawings(storage: Pick<Storage, 'getItem'>): PersistedDrawingsState {
  const raw = storage.getItem(DRAWINGS_STORAGE_KEY);
  if (!raw) return EMPTY_PERSISTED_DRAWINGS_STATE;

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedDrawingsState> | null;
    if (!parsed || parsed.version !== 1 || !isDrawingArray(parsed.drawings)) {
      return EMPTY_PERSISTED_DRAWINGS_STATE;
    }

    return {
      version: 1,
      drawings: parsed.drawings,
    };
  } catch {
    return EMPTY_PERSISTED_DRAWINGS_STATE;
  }
}

export function savePersistedDrawings(
  storage: Pick<Storage, 'setItem'>,
  drawings: AnyDrawing[],
): PersistedDrawingsState {
  const payload: PersistedDrawingsState = {
    version: 1,
    drawings,
  };

  storage.setItem(DRAWINGS_STORAGE_KEY, JSON.stringify(payload));
  return payload;
}
