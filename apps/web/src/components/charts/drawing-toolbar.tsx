'use client';

import React from 'react';
import { 
  MousePointer2, 
  Minus, 
  Bell, 
  TrendingUp, 
  Square, 
  ArrowsUpFromLine, 
  Eye, 
  EyeOff, 
  Trash2,
  Maximize2
} from 'lucide-react';
import { useDrawingStore } from '@/stores';
import { cn } from '@/lib/utils';
import type { DrawingTool, InstrumentMarketType } from '@/lib/drawings/models';

interface DrawingToolbarProps {
  exchange: string;
  marketType: InstrumentMarketType;
  symbol: string;
  compact?: boolean;
}

export function DrawingToolbar({ exchange, marketType, symbol, compact }: DrawingToolbarProps) {
  const { 
    selectedTool, 
    setSelectedTool, 
    hidden, 
    setHidden, 
    clearInstrument 
  } = useDrawingStore();

  const tools: { id: DrawingTool; icon: any; label: string }[] = [
    { id: 'cursor', icon: MousePointer2, label: 'Cursor' },
    { id: 'horizontal_line', icon: Minus, label: 'Horizontal Line' },
    { id: 'signal_level', icon: Bell, label: 'Signal Level' },
    { id: 'trendline', icon: TrendingUp, label: 'Trend Line' },
    { id: 'vertical_line', icon: ArrowsUpFromLine, label: 'Vertical Line' },
    { id: 'rectangle', icon: Square, label: 'Rectangle' },
    { id: 'ruler', icon: Maximize2, label: 'Ruler' },
  ];

  const toolbarClass = compact
    ? 'absolute left-2 top-2 z-40 flex gap-1 p-1 glass-panel rounded-lg shadow-xl border border-white/10'
    : 'absolute left-3 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-1.5 p-1.5 glass-panel rounded-xl shadow-2xl border border-white/10';

  const buttonClass = (active: boolean) => cn(
    'flex items-center justify-center rounded-md transition-all duration-200 group relative',
    compact ? 'w-8 h-8' : 'w-9 h-9',
    active 
      ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.3)] border border-blue-500/30' 
      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
  );

  return (
    <div className={toolbarClass}>
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => setSelectedTool(tool.id)}
          className={buttonClass(selectedTool === tool.id)}
          title={tool.label}
        >
          <tool.icon size={compact ? 18 : 20} />
          {!compact && (
            <div className="absolute left-full ml-3 px-2 py-1 bg-zinc-900 text-zinc-200 text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 border border-white/10 shadow-xl">
              {tool.label}
            </div>
          )}
        </button>
      ))}

      <div className={cn(
        "bg-white/10",
        compact ? "w-[1px] h-6 mx-1" : "h-[1px] w-6 my-1 mx-auto"
      )} />

      <button
        onClick={() => setHidden(!hidden)}
        className={buttonClass(hidden)}
        title={hidden ? "Show Drawings" : "Hide Drawings"}
      >
        {hidden ? <EyeOff size={compact ? 18 : 20} /> : <Eye size={compact ? 18 : 20} />}
      </button>

      <button
        onClick={() => {
          if (confirm('Clear all drawings for this instrument?')) {
            clearInstrument(exchange, marketType, symbol);
          }
        }}
        className={cn(buttonClass(false), "hover:text-red-400 hover:bg-red-500/10")}
        title="Clear All"
      >
        <Trash2 size={compact ? 18 : 20} />
      </button>
    </div>
  );
}
