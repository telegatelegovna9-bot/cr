'use client';

import React, { useState, useMemo } from 'react';
import { useMarketStore, useUIStore } from '@/stores';
import type { PatternScanResult, PatternType } from '@crypto-screener/shared';
import { motion } from 'framer-motion';
import {
  Search,
  TrendingUp,
  TrendingDown,
  Loader2,
  Activity,
  Eye,
  ArrowRight,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────

function formatPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(3);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(6);
}

function getPatternEmoji(type: PatternType): string {
  if (type.includes('bull') || type.includes('bullish')) return '🟢';
  if (type.includes('bear') || type.includes('bearish')) return '🔴';
  if (type.includes('reversal')) return '🔄';
  if (type.includes('continuation')) return '➡️';
  return '📊';
}

function getPatternColor(type: PatternType): { bg: string; text: string; border: string } {
  if (type.includes('bull') || type.includes('bullish')) return { bg: 'bg-positive/10', text: 'text-positive', border: 'border-positive/20' };
  if (type.includes('bear') || type.includes('bearish')) return { bg: 'bg-negative/10', text: 'text-negative', border: 'border-negative/20' };
  return { bg: 'bg-accent/10', text: 'text-accent-light', border: 'border-accent/20' };
}

function getDirectionIcon(direction: string) {
  if (direction === 'bullish') return <TrendingUp className="w-4 h-4 text-positive" />;
  if (direction === 'bearish') return <TrendingDown className="w-4 h-4 text-negative" />;
  return <Activity className="w-4 h-4 text-text-muted" />;
}

function getStrengthBars(strength: number): React.ReactElement[] {
  return Array.from({ length: 5 }, (_, i) => (
    <div
      key={i}
      className={`w-1.5 rounded-full transition-all ${i < strength ? 'bg-accent' : 'bg-border'}`}
      style={{ height: `${8 + i * 3}px` }}
    />
  ));
}

// ─── Pattern Card ────────────────────────────────────────────

function PatternCard({ pattern, index }: { pattern: PatternScanResult; index: number }) {
  const { setSelectedSymbol, setSelectedCoin } = useMarketStore();
  const [expanded, setExpanded] = useState(false);
  const colors = getPatternColor(pattern.pattern.type);
  const p = pattern.pattern;
  const strength = p.strength ?? 3;
  const entry = p.entry ?? p.points?.[0]?.price ?? 0;
  const target = p.target ?? p.targetPrice ?? 0;
  const stopLoss = p.stopLoss ?? 0;
  const riskReward = p.riskReward ?? (target && stopLoss ? Math.abs(target - entry) / Math.abs(entry - stopLoss || 1) : 0);

  const handleViewChart = () => {
    setSelectedSymbol(pattern.symbol);
    setSelectedCoin(pattern.symbol);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="glass-card overflow-hidden hover:border-accent/20 transition-all duration-300"
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${colors.bg} border ${colors.border}`}>
              {getPatternEmoji(pattern.pattern.type)}
            </div>
            <div>
              <div className="text-sm font-bold text-text-primary">{pattern.symbol}</div>
              <div className={`text-xs font-medium ${colors.text} mt-0.5`}>
                {pattern.pattern.type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getDirectionIcon(pattern.pattern.direction)}
            <span className={`text-xs font-bold uppercase ${pattern.pattern.direction === 'bullish' ? 'text-positive' : pattern.pattern.direction === 'bearish' ? 'text-negative' : 'text-text-muted'}`}>
              {pattern.pattern.direction}
            </span>
          </div>
        </div>

        {/* Strength & Confidence */}
        <div className="flex items-center gap-4 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">Strength</span>
            <div className="flex items-end gap-0.5">
              {getStrengthBars(strength)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">Confidence</span>
            <div className="w-16 h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-aurora transition-all duration-500"
                style={{ width: `${pattern.confidence * 100}%` }}
              />
            </div>
            <span className="text-xs font-bold text-accent-light font-mono">{(pattern.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Targets */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-bg-primary/40 rounded-lg p-2 border border-border">
            <div className="text-[10px] text-text-muted mb-0.5">Entry</div>
            <div className="text-xs font-bold font-mono text-text-primary">${formatPrice(entry)}</div>
          </div>
          <div className="bg-positive/5 rounded-lg p-2 border border-positive/10">
            <div className="text-[10px] text-positive/70 mb-0.5">Target</div>
            <div className="text-xs font-bold font-mono text-positive">${formatPrice(target)}</div>
          </div>
          <div className="bg-negative/5 rounded-lg p-2 border border-negative/10">
            <div className="text-[10px] text-negative/70 mb-0.5">Stop</div>
            <div className="text-xs font-bold font-mono text-negative">${formatPrice(stopLoss)}</div>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-text-secondary mb-3 leading-relaxed">{pattern.pattern.description}</p>

        {/* R:R & Action */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="badge-premium !text-[10px]">
              R:R {riskReward.toFixed(1)}
            </span>
            <span className="badge-premium !text-[10px]">
              {pattern.pattern.timeframe}
            </span>
          </div>
          <button
            onClick={handleViewChart}
            className="ghost-btn !py-1.5 !px-3 !text-[10px] flex items-center gap-1.5"
          >
            <Eye className="w-3 h-3" />
            View Chart
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Patterns Panel ─────────────────────────────────────

export function PatternsPanel({ patterns, loading }: {
  patterns: PatternScanResult[];
  loading: boolean;
}) {
  const { selectedExchange } = useMarketStore();
  const [filter, setFilter] = useState<'all' | 'bullish' | 'bearish'>('all');
  const [sortBy, setSortBy] = useState<'confidence' | 'time' | 'strength'>('confidence');
  const [search, setSearch] = useState('');

  const filteredPatterns = useMemo(() => {
    let filtered = patterns;

    if (filter !== 'all') {
      filtered = filtered.filter((p) => p.pattern.direction === filter);
    }

    if (search) {
      filtered = filtered.filter((p) => p.symbol.toLowerCase().includes(search.toLowerCase()));
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === 'confidence') return b.confidence - a.confidence;
      if (sortBy === 'strength') return b.pattern.strength - a.pattern.strength;
      return b.timestamp - a.timestamp;
    });
  }, [patterns, filter, sortBy, search]);

  const stats = useMemo(() => ({
    total: patterns.length,
    bullish: patterns.filter((p) => p.pattern.direction === 'bullish').length,
    bearish: patterns.filter((p) => p.pattern.direction === 'bearish').length,
    highConf: patterns.filter((p) => p.confidence > 0.7).length,
  }), [patterns]);

  return (
    <div className="h-full flex flex-col p-3 gap-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
            <Activity className="w-5 h-5 text-accent-light" />
          </div>
          <div>
            <h1 className="text-lg font-bold gradient-text">Patterns</h1>
            <p className="text-xs text-text-muted">
              {stats.total} detected · {stats.highConf} high confidence
            </p>
          </div>
        </div>

        <div className="flex-1" />

        {/* Stats badges */}
        <div className="flex items-center gap-2">
          <span className="badge-positive !text-[10px]">{stats.bullish} Bullish</span>
          <span className="badge-negative !text-[10px]">{stats.bearish} Bearish</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        {/* Direction filter */}
        <div className="flex items-center gap-1 bg-bg-primary/40 rounded-xl p-1 border border-border">
          {(['all', 'bullish', 'bearish'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-200 cursor-pointer font-medium capitalize
                ${filter === f
                  ? 'bg-accent/15 text-accent-light shadow-glow-sm'
                  : 'text-text-muted hover:text-text-secondary'
                }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="select-premium !py-2 !text-xs !rounded-xl"
        >
          <option value="confidence" className="bg-bg-secondary">Confidence</option>
          <option value="strength" className="bg-bg-secondary">Strength</option>
          <option value="time" className="bg-bg-secondary">Time</option>
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search pair..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-premium !py-2 !pl-9 !text-xs !rounded-xl"
          />
        </div>
      </div>

      {/* Patterns grid */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        ) : filteredPatterns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-text-muted">
            <Activity className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No patterns detected</p>
            <p className="text-xs mt-1">Patterns will appear as the scanner runs</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredPatterns.map((pattern, index) => (
              <PatternCard key={`${pattern.symbol}-${pattern.pattern.type}-${pattern.timestamp}`} pattern={pattern} index={index} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
