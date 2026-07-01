import type { LocalScreenerPreset } from './screener-types.ts';

export function serializeScreenerPreset(preset: LocalScreenerPreset): string {
  return JSON.stringify(preset);
}

export function deserializeScreenerPreset(raw: string): LocalScreenerPreset {
  return JSON.parse(raw) as LocalScreenerPreset;
}
