'use client';

import { useUIStore } from '@/stores';
import { Settings } from 'lucide-react';
import { useState } from 'react';

const MIN_SIZE_OPTIONS = [
  { label: '10K', value: 10_000 },
  { label: '50K', value: 50_000 },
  { label: '100K', value: 100_000 },
  { label: '500K', value: 500_000 },
  { label: '1M', value: 1_000_000 },
];

const DEPTH_OPTIONS = [
  { label: '1%', value: 0.01 },
  { label: '2%', value: 0.02 },
  { label: '3%', value: 0.03 },
  { label: '5%', value: 0.05 },
];

export function HeatmapControls() {
  const { heatmapSettings, setHeatmapSettings } = useUIStore();
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute top-2 left-2 z-20 select-none">
      <button
        onClick={() => setOpen(o => !o)}
        title="Heatmap settings"
        className={`w-6 h-6 flex items-center justify-center rounded-md border transition-all ${
          open
            ? 'bg-accent/20 border-accent/50 text-accent-light'
            : 'bg-bg-primary/70 border-border/50 text-text-muted hover:text-text-secondary hover:border-border'
        }`}
      >
        <Settings className="w-3 h-3" />
      </button>

      {open && (
        <div
          className="absolute top-7 left-0 w-52 rounded-xl border border-border/60 shadow-xl p-2.5 space-y-2.5"
          style={{ background: 'rgba(10,10,20,0.92)', backdropFilter: 'blur(12px)' }}
        >
          <div className="space-y-1">
            <div className="text-[9px] font-semibold text-text-muted uppercase tracking-widest px-0.5">
              Intensity
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-text-secondary">Background strength</span>
              <span className="text-[10px] text-text-secondary font-mono">
                {heatmapSettings.intensity.toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={heatmapSettings.intensity}
              onChange={e => setHeatmapSettings({ intensity: parseFloat(e.target.value) })}
              className="w-full h-1 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: '#6366f1' }}
            />
          </div>

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

          <div className="space-y-1">
            <div className="text-[9px] font-semibold text-text-muted uppercase tracking-widest px-0.5">
              Visible Depth
            </div>
            <div className="flex flex-wrap gap-1">
              {DEPTH_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setHeatmapSettings({ depthPct: opt.value })}
                  className="px-1.5 py-0.5 rounded-md text-[10px] font-medium border transition-all"
                  style={
                    heatmapSettings.depthPct === opt.value
                      ? { borderColor: '#22c55e55', color: '#86efac', background: '#22c55e18' }
                      : { borderColor: 'rgba(255,255,255,0.08)', color: '#555570', background: 'transparent' }
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between px-0.5">
            <span className="text-[9px] font-semibold text-text-muted uppercase tracking-widest">
              Advanced Diagnostics
            </span>
            <button
              onClick={() => setHeatmapSettings({ showDiagnostics: !heatmapSettings.showDiagnostics })}
              className={`relative w-8 h-4 rounded-full border transition-all ${
                heatmapSettings.showDiagnostics
                  ? 'bg-accent/40 border-accent/60'
                  : 'bg-white/5 border-white/15'
              }`}
            >
              <span
                className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                style={{ left: heatmapSettings.showDiagnostics ? '17px' : '2px' }}
              />
            </button>
          </div>

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
