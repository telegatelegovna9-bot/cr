'use client';

import React, { useEffect } from 'react';
import { useDrawingStore, DrawingType } from '@/stores';
import { motion } from 'framer-motion';
import { 
  MousePointer2, 
  Minus, 
  TrendingUp, 
  BellRing, 
  Ruler, 
  Trash2,
  Undo2
} from 'lucide-react';

interface ToolbarButtonProps {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}

const ToolbarButton = ({ icon: Icon, label, active, onClick, color }: ToolbarButtonProps) => (
  <button
    onClick={onClick}
    className={`group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 cursor-pointer
      ${active 
        ? 'bg-accent/20 text-accent-light shadow-glow-sm border border-accent/30' 
        : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
      }`}
    title={label}
  >
    <Icon className={`w-5 h-5 ${active ? 'animate-pulse-slow' : ''}`} style={color ? { color } : undefined} />
    
    {/* Tooltip */}
    <div className="absolute left-full ml-3 px-2 py-1 bg-bg-secondary border border-border rounded-md text-[10px] font-bold text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[100] shadow-glass-lg">
      {label}
    </div>
  </button>
);

export function DrawingToolbar({ symbol, exchange }: { symbol: string; exchange: string }) {
  const { selectedTool, setSelectedTool, clearDrawings } = useDrawingStore();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toLowerCase()) {
        case 'v': setSelectedTool('cursor'); break;
        case 'h': setSelectedTool('horizontal_line'); break;
        case 't': setSelectedTool('trendline'); break;
        case 'a': setSelectedTool('signal_level'); break;
        case 'r': setSelectedTool('ruler'); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSelectedTool]);

  const tools: { id: DrawingType | 'cursor' | 'ruler'; label: string; icon: any; shortcut: string }[] = [
    { id: 'cursor', label: 'Cursor', icon: MousePointer2, shortcut: 'V' },
    { id: 'horizontal_line', label: 'Horizontal Line', icon: Minus, shortcut: 'H' },
    { id: 'trendline', label: 'Trendline', icon: TrendingUp, shortcut: 'T' },
    { id: 'signal_level', label: 'Signal Level', icon: BellRing, shortcut: 'A' },
    { id: 'ruler', label: 'Ruler', icon: Ruler, shortcut: 'R' },
  ];

  return (
    <motion.div 
      initial={{ x: -10, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="absolute left-1 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-1 p-1 glass-panel rounded-xl shadow-glass-lg border border-border/30 scale-[0.85] origin-left sm:scale-100"
    >
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => setSelectedTool(tool.id)}
          className={`group relative flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 cursor-pointer
            ${selectedTool === tool.id 
              ? 'bg-accent/20 text-accent-light shadow-glow-sm border border-accent/30' 
              : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
            }`}
          title={tool.label}
        >
          <tool.icon className={`w-4 h-4 ${selectedTool === tool.id ? 'animate-pulse-slow' : ''}`} />
        </button>
      ))}

      <div className="w-full h-px bg-border/50 my-0.5" />

      <button
        onClick={() => clearDrawings(symbol, exchange)}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-negative hover:bg-negative/10 transition-all cursor-pointer"
        title="Clear All"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </motion.div>
  );
}
