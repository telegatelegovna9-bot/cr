'use client';

import { useUIStore } from '@/stores';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Table2,
  Grid3x3,
  Settings2,
  Activity,
  BarChart3,
} from 'lucide-react';

const VIEW_ICONS: Record<string, typeof Table2> = {
  terminal: Activity,
  screener: BarChart3,
  grid: Grid3x3,
  settings: Settings2,
};

export function TerminalView({ children }: { children: React.ReactNode }) {
  const { viewMode, showHeatmap } = useUIStore();
  const Icon = VIEW_ICONS[viewMode] || Activity;

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-[100px]" />
      </div>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
