'use client';

import { useEffect, useRef } from 'react';
import type { PatternListItem } from '@/lib/patterns/models';
import { PatternsEmptyState } from './patterns-empty-state';
import { PatternsListRow } from './patterns-list-row';

interface PatternsListProps {
  items: PatternListItem[];
  selectedPatternId: string | null;
  onSelect: (id: string) => void;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function PatternsList({
  items,
  selectedPatternId,
  onSelect,
  hasMore,
  onLoadMore,
}: PatternsListProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: '120px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  if (!items.length) {
    return <PatternsEmptyState />;
  }

  return (
    <div className="space-y-2">
      {items.map(item => (
        <PatternsListRow
          key={item.id}
          item={item}
          selected={item.id === selectedPatternId}
          onClick={() => onSelect(item.id)}
        />
      ))}
      <div ref={sentinelRef} className="h-4" />
    </div>
  );
}
