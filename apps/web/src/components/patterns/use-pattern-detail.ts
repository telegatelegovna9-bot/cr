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

    let cancelled = false;
    setLoading(true);

    fetchPatternDetail(patternId)
      .then(data => {
        if (!cancelled) {
          setItem(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItem(null);
        }
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
