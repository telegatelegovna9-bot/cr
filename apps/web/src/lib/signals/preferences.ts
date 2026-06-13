export const SIGNAL_PREFERENCES_STORAGE_KEY = 'aionui.signal-preferences.v1';
export const SIGNAL_CLIENT_ID_STORAGE_KEY = 'aionui.signal-client-id.v1';

export const SIGNAL_NOTIFICATION_THRESHOLDS = [
  25_000,
  50_000,
  100_000,
  250_000,
  500_000,
  1_000_000,
] as const;

export type SignalNotificationThreshold = typeof SIGNAL_NOTIFICATION_THRESHOLDS[number];

export interface SignalPreferencesState {
  enabled: boolean;
  minUsd: SignalNotificationThreshold;
}

export const DEFAULT_SIGNAL_PREFERENCES: SignalPreferencesState = {
  enabled: true,
  minUsd: 100_000,
};

function isValidSignalNotificationThreshold(value: unknown): value is SignalNotificationThreshold {
  return SIGNAL_NOTIFICATION_THRESHOLDS.includes(value as SignalNotificationThreshold);
}

export function loadPersistedSignalPreferences(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): SignalPreferencesState {
  if (!storage) return DEFAULT_SIGNAL_PREFERENCES;

  const raw = storage.getItem(SIGNAL_PREFERENCES_STORAGE_KEY);
  if (!raw) return DEFAULT_SIGNAL_PREFERENCES;

  try {
    const parsed = JSON.parse(raw) as Partial<SignalPreferencesState>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SIGNAL_PREFERENCES.enabled,
      minUsd: isValidSignalNotificationThreshold(parsed.minUsd)
        ? parsed.minUsd
        : DEFAULT_SIGNAL_PREFERENCES.minUsd,
    };
  } catch {
    return DEFAULT_SIGNAL_PREFERENCES;
  }
}

export function savePersistedSignalPreferences(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  state: SignalPreferencesState,
): SignalPreferencesState {
  if (!storage) return state;
  storage.setItem(SIGNAL_PREFERENCES_STORAGE_KEY, JSON.stringify(state));
  return state;
}

export function getOrCreateSignalClientId(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
): string {
  if (!storage) return 'server-render';

  const existing = storage.getItem(SIGNAL_CLIENT_ID_STORAGE_KEY);
  if (existing) return existing;

  const next = `signal-client-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  storage.setItem(SIGNAL_CLIENT_ID_STORAGE_KEY, next);
  return next;
}
