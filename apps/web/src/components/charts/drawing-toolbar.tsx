'use client';

import React, { useState } from 'react';
import { 
  MousePointer2, 
  Minus, 
  TrendingUp, 
  Square, 
  Ruler,
  Siren,
  Eye, 
  EyeOff, 
  Trash2,
  PanelLeftClose,
  PanelLeftOpen
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
  const [collapsed, setCollapsed] = useState(compact);
  const { 
    selectedTool, 
    setSelectedTool, 
    hidden, 
    setHidden
  } = useDrawingStore();

  const tools: { id: DrawingTool; icon: any; label: string }[] = [
    { id: 'cursor', icon: MousePointer2, label: 'Cursor' },
    { id: 'horizontal_line', icon: Minus, label: 'Horizontal Line' },
    { id: 'signal_level', icon: Siren, label: 'Signal Level' },
    { id: 'trendline', icon: TrendingUp, label: 'Trend Line' },
    { id: 'rectangle', icon: Square, label: 'Rectangle' },
    { id: 'ruler', icon: Ruler, label: 'Ruler' },
    { id: 'delete', icon: Trash2, label: 'Delete' },
  ];

  const toolbarClass = compact
    ? 'absolute left-2 top-2 z-40 flex gap-0.5 p-0.5 glass-panel rounded-lg shadow-xl border border-white/10 max-w-[calc(100%-1rem)] overflow-x-auto'
    : 'absolute left-2 top-2 z-40 flex flex-col gap-0.5 p-0.5 glass-panel rounded-lg shadow-2xl border border-white/10';

  const buttonClass = (active: boolean) => cn(
    'flex items-center justify-center rounded-md transition-all duration-200 group relative',
    compact ? 'w-6 h-6 shrink-0' : 'w-7 h-7',
    active 
      ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.3)] border border-blue-500/30' 
      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
  );

  return (
    <div className={toolbarClass}>
      <button
        onClick={() => setCollapsed(value => !value)}
        className={buttonClass(false)}
        title={collapsed ? "Show Toolbar" : "Hide Toolbar"}
      >
        {collapsed ? <PanelLeftOpen size={compact ? 12 : 14} /> : <PanelLeftClose size={compact ? 12 : 14} />}
      </button>

      {!collapsed && (
        <>
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => setSelectedTool(tool.id)}
          className={buttonClass(selectedTool === tool.id)}
          title={tool.label}
        >
          <tool.icon size={compact ? 13 : 15} />
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
        {hidden ? <EyeOff size={compact ? 13 : 15} /> : <Eye size={compact ? 13 : 15} />}
      </button>
        </>
      )}
    </div>
  );
}
