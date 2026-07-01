export function diffNewScreenerMatches(previous: string[], next: string[]): string[] {
  const previousSet = new Set(previous);
  return next.filter(key => !previousSet.has(key));
}
