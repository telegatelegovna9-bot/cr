'use client';

import { useUIStore } from '@/stores';
import { Settings } from 'lucide-react';
import { useState } from 'react';

const MIN_SIZE_OPTIONS = [
  { label: 'All', value: 0 },
  { label: '10K', value: 10_000 },
  { label: '50K', value: 50_000 },
  { label: '100K', value: 100_000 },
  { label: '500K', value: 500_000 },
  { label: '1M', value: 1_000_000 },
];

const TYPE_PILLS = [
  { key: 'showReal', label: 'Real', color: '#00C896' },
  { key: 'showSpoof', label: 'Spoof', color: '#FF8A3D' },
  { key: 'showIceberg', label: 'Iceberg', color: '#00E0FF' },
  { key: 'showAbsorption', label: 'Absorb', color: '#FFB400' },
] as const;

export function HeatmapControls() {
  const { heatmapSettings, setHeatmapSettings } = useUIStore();
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute top-2 left-2 z-20 select-none">
      {/* Gear trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Heatmap settings"
        className={`w-6 h-6 flex items-center justify-center rounded-md border transition-all
          ${open
            ? 'bg-accent/20 border-accent/50 text-accent-light'
            : 'bg-bg-primary/70 border-border/50 text-text-muted hover:text-text-secondary hover:border-border'
          }`}
      >
        <Settings className="w-3 h-3" />
      </button>

      {open && (
        <div
          className="absolute top-7 left-0 w-48 rounded-xl border border-border/60 shadow-xl p-2.5 space-y-2.5"
          style={{ background: 'rgba(10,10,20,0.92)', backdropFilter: 'blur(12px)' }}
        >
          {/* Types */}
          <div className="space-y-1">
            <div className="text-[9px] font-semibold text-text-muted uppercase tracking-widest px-0.5">
              Liquidity Types
            </div>
            <div className="flex flex-wrap gap-1">
              {TYPE_PILLS.map(({ key, label, color }) => {
                const active = heatmapSettings[key];
                return (
                  <button
                    key={key}
                    onClick={() => setHeatmapSettings({ [key]: !active })}
                    className="px-2 py-0.5 rounded-md text-[10px] font-medium border transition-all"
                    style={
                      active
                        ? { borderColor: color + '55', color, background: color + '18' }
                        : { borderColor: 'rgba(255,255,255,0.08)', color: '#555570', background: 'transparent' }
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Intensity */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-semibold text-text-muted uppercase tracking-widest">
                Intensity
              </span>
              <span className="text-[10px] text-text-secondary font-mono">
                {heatmapSettings.intensity.toFixed(1)}×
              </span>
            </div>
            <input
              type="range" min={0.5} max={2.0} step={0.1}
              value={heatmapSettings.intensity}
              onChange={e => setHeatmapSettings({ intensity: parseFloat(e.target.value) })}
              className="w-full h-1 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: '#6366f1' }}
            />
          </div>

          {/* Min size */}
          <div className="space-y-1">
            <div className="text-[9px] font-semibold text-text-muted uppercase tracking-widest px-0.5">
              Min Liquidity
            </div>
            <div className="flex flex-wrap gap-1">
              {MIN_SIZE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setHeatmapSettings({ minSizeUsd: opt.value })}
                  className="px-1.5 py-0.5 rounded-md text-[10px] font-medium border transition-all"
                  style={
                    heatmapSettings.minSizeUsd === opt.value
                      ? { borderColor: '#6366f155', color: '#a5b4fc', background: '#6366f118' }
                      : { borderColor: 'rgba(255,255,255,0.08)', color: '#555570', background: 'transparent' }
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Auto Fade */}
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[9px] font-semibold text-text-muted uppercase tracking-widest">
              Auto Fade
            </span>
            <button
              onClick={() => setHeatmapSettings({ autoFade: !heatmapSettings.autoFade })}
              className={`relative w-8 h-4 rounded-full border transition-all ${
                heatmapSettings.autoFade
                  ? 'bg-accent/40 border-accent/60'
                  : 'bg-white/5 border-white/15'
              }`}
            >
              <span
                className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                style={{ left: heatmapSettings.autoFade ? '17px' : '2px' }}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
