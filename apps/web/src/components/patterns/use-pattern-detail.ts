'use client';

import { useEffect, useState } from 'react';
import { fetchPatternDetail } from '@/lib/patterns/api';
import type { PatternDetail } from '@/lib/patterns/models';

export function usePatternDetail(patternId: string | null, refreshKey: number) {
  const [item, setItem] = useState<PatternDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!patternId) {
      setItem(null);
      return;
    }
    if (document.visibilityState !== 'visible') {
      return;
    }

    let cancelled = false;
    setItem(previous => (previous?.id === patternId ? previous : null));
    setLoading(true);

    fetchPatternDetail(patternId)
      .then(data => {
        if (!cancelled) {
          if (data) {
            setItem(data);
          }
        }
      })
      .catch(() => {
        // Preserve the previous detail snapshot during transient polling failures.
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [patternId, refreshKey]);

  return { item, loading };
}
