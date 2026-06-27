import { SCREENER_DEFAULT_EXCHANGES, type ExchangeId, type ScreenerMarketType } from '@crypto-screener/shared';

interface ScreenerToolbarProps {
  marketType: ScreenerMarketType;
  onMarketTypeChange: (marketType: ScreenerMarketType) => void;
  exchanges: ExchangeId[];
  onExchangeToggle: (exchange: ExchangeId) => void;
  presetName: string;
  onPresetNameChange: (value: string) => void;
  presets: Array<{ id: string; name: string }>;
  selectedPresetId: string | null;
  onPresetSelect: (id: string | null) => void;
  onSavePreset: () => void;
  onResetFilters: () => void;
  soundEnabled: boolean;
  onSoundToggle: () => void;
}

export function ScreenerToolbar({
  marketType,
  onMarketTypeChange,
  exchanges,
  onExchangeToggle,
  presetName,
  onPresetNameChange,
  presets,
  selectedPresetId,
  onPresetSelect,
  onSavePreset,
  onResetFilters,
  soundEnabled,
  onSoundToggle,
}: ScreenerToolbarProps) {
  return (
    <div className="glass-card flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMarketTypeChange('spot')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              marketType === 'spot'
                ? 'bg-accent/15 text-accent-light shadow-glow-sm'
                : 'border border-border text-text-secondary transition-colors hover:text-text-primary'
            }`}
          >
            Spot
          </button>
          <button
            type="button"
            onClick={() => onMarketTypeChange('futures')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              marketType === 'futures'
                ? 'bg-accent/15 text-accent-light shadow-glow-sm'
                : 'border border-border text-text-secondary transition-colors hover:text-text-primary'
            }`}
          >
            Futures
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {SCREENER_DEFAULT_EXCHANGES.map(exchange => {
            const active = exchanges.includes(exchange);
            return (
              <button
                key={exchange}
                type="button"
                onClick={() => onExchangeToggle(exchange)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  active
                    ? 'bg-accent/15 text-accent-light'
                    : 'border border-border text-text-muted transition-colors hover:text-text-primary'
                }`}
              >
                {exchange}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input-premium w-40 !py-2 !text-xs"
          value={selectedPresetId ?? ''}
          onChange={event => onPresetSelect(event.target.value || null)}
        >
          <option value="">Preset: none</option>
          {presets.map(preset => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        <input
          className="input-premium w-40 !py-2 !text-xs"
          placeholder="Preset name"
          value={presetName}
          onChange={event => onPresetNameChange(event.target.value)}
        />
        <button type="button" className="ghost-btn px-3 py-1.5 text-xs" onClick={onSavePreset}>
          Save
        </button>
        <button type="button" className="ghost-btn px-3 py-1.5 text-xs" onClick={onResetFilters}>
          Reset
        </button>
        <button type="button" className="ghost-btn px-3 py-1.5 text-xs" onClick={onSoundToggle}>
          {soundEnabled ? 'Sound On' : 'Sound Off'}
        </button>
      </div>
    </div>
  );
}
