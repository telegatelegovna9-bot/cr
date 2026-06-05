import type { PatternDetail, PatternFilters, PatternsPage } from './models';

function buildPatternsQuery(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    searchParams.set(key, String(value));
  }

  return searchParams.toString();
}

export async function fetchPatternsPage(args: {
  cursor?: number | null;
  search?: string;
  filters: PatternFilters;
}): Promise<PatternsPage> {
  const query = buildPatternsQuery({
    cursor: args.cursor ?? undefined,
    search: args.search || undefined,
    kinds: args.filters.kinds.length ? args.filters.kinds.join(',') : undefined,
    timeframes: args.filters.timeframes.length ? args.filters.timeframes.join(',') : undefined,
    statuses: args.filters.statuses.length ? args.filters.statuses.join(',') : undefined,
  });

  const response = await fetch(`/api/patterns${query ? `?${query}` : ''}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch patterns: ${response.status}`);
  }

  const payload = await response.json();
  return {
    items: payload.items ?? [],
    hasMore: payload.hasMore ?? false,
    nextCursor: payload.nextCursor ?? null,
  };
}

export async function fetchPatternDetail(id: string): Promise<PatternDetail | null> {
  const response = await fetch(`/api/patterns/${id}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch pattern detail: ${response.status}`);
  }

  const payload = await response.json();
  return payload.data ?? null;
}
