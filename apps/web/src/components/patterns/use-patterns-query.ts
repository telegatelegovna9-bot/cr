'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPatternsPage } from '@/lib/patterns/api';
import type { PatternFilters, PatternListItem } from '@/lib/patterns/models';

const PATTERNS_POLL_MS = 45_000;

export function usePatternsQuery(search: string, filters: PatternFilters) {
  const [items, setItems] = useState<PatternListItem[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    const page = await fetchPatternsPage({
      search,
      filters,
      cursor: null,
    });
    setItems(page.items);
    setHasMore(page.hasMore);
    setCursor(page.nextCursor);
    setLoading(false);
  }, [filters, search]);

  const loadMore = useCallback(async () => {
    if (!hasMore || cursor === null) return;

    const page = await fetchPatternsPage({
      search,
      filters,
      cursor,
    });

    setItems(current => [...current, ...page.items]);
    setHasMore(page.hasMore);
    setCursor(page.nextCursor);
  }, [cursor, filters, hasMore, search]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage, refreshNonce]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setRefreshNonce(value => value + 1);
    }, PATTERNS_POLL_MS);

    return () => window.clearInterval(timer);
  }, []);

  return useMemo(
    () => ({
      items,
      hasMore,
      loading,
      refreshKey: refreshNonce,
      loadMore,
      refresh: () => setRefreshNonce(value => value + 1),
    }),
    [hasMore, items, loading, loadMore, refreshNonce],
  );
}
